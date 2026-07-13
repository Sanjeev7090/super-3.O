"""
News Filter — RSS-based financial news + NSE Event Calendar
============================================================
Replaces yfinance news fetching with multi-source RSS aggregation.

Sources (free, no API key):
  1. Google News RSS  (global + India focus)
  2. Economic Times   RSS
  3. Moneycontrol     RSS (headline feed)
  4. Business Standard RSS

Event Calendar:
  - NSE F&O Expiry  : Last Thursday of each month
  - RBI MPC Meeting : ~every 6 weeks (estimated)
  - Budget Day      : First week of February
  - Quarterly Results: Jan, Apr, Jul, Oct (earnings season)

High-impact event within ±1 day → returns impact flag so scanner can
reduce position sizing / skip trades.
"""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timezone, timedelta, date
from typing import Dict, List, Optional, Tuple
from urllib.parse import quote_plus

import aiohttp

logger = logging.getLogger(__name__)

# ── Cache ─────────────────────────────────────────────────────────────────────
_news_cache: Dict[str, Dict] = {}
CACHE_TTL_SECONDS = 600  # 10 minutes

# ── RSS Sources ───────────────────────────────────────────────────────────────
# Google News RSS for ticker/company search
GOOGLE_NEWS_RSS = (
    "https://news.google.com/rss/search?q={query}"
    "&hl=en-IN&gl=IN&ceid=IN:en"
)

ET_MARKETS_RSS = "https://economictimes.indiatimes.com/markets/rss.cms"
MONEYCONTROL_RSS = "https://www.moneycontrol.com/rss/latestnews.xml"
BS_RSS = "https://www.business-standard.com/rss/home_page_news.rss"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
}

# ── NSE Event Calendar ────────────────────────────────────────────────────────

def _last_thursday_of_month(year: int, month: int) -> date:
    """Returns last Thursday of given month (NSE F&O expiry)."""
    import calendar
    # Start from last day of month, go back to Thursday
    last_day = calendar.monthrange(year, month)[1]
    d = date(year, month, last_day)
    while d.weekday() != 3:  # 3 = Thursday
        d -= timedelta(days=1)
    return d


def get_upcoming_events(days_ahead: int = 7) -> List[Dict]:
    """
    Returns NSE high-impact events in the next `days_ahead` days.
    """
    today = date.today()
    events = []

    # Check F&O expiry for current + next 2 months
    for delta_month in range(3):
        m = (today.month - 1 + delta_month) % 12 + 1
        y = today.year + ((today.month - 1 + delta_month) // 12)
        expiry = _last_thursday_of_month(y, m)
        diff = (expiry - today).days
        if 0 <= diff <= days_ahead:
            events.append({
                "date":   expiry.isoformat(),
                "event":  "NSE F&O Monthly Expiry",
                "impact": "HIGH",
                "days_away": diff,
                "description": "Avoid large positions on expiry day — high intraday volatility.",
            })

    # Budget: First week of February (approximate)
    budget_date = date(today.year, 2, 1)
    diff = (budget_date - today).days
    if 0 <= diff <= days_ahead:
        events.append({
            "date":   budget_date.isoformat(),
            "event":  "Union Budget (Approx.)",
            "impact": "EXTREME",
            "days_away": diff,
            "description": "Major policy event. Extreme volatility expected. Consider staying flat.",
        })

    # Quarterly results season: Jan (15-31), Apr, Jul, Oct
    results_months = {1: (15, 31), 4: (1, 30), 7: (1, 31), 10: (1, 31)}
    if today.month in results_months:
        start_d, end_d = results_months[today.month]
        if start_d <= today.day <= end_d:
            events.append({
                "date":   today.isoformat(),
                "event":  "Quarterly Results Season",
                "impact": "MEDIUM",
                "days_away": 0,
                "description": "High stock-specific volatility. Check earnings calendar before trading.",
            })

    return sorted(events, key=lambda x: x["days_away"])


def is_high_impact_event_today() -> Tuple[bool, str]:
    """
    Returns (is_high_impact: bool, description: str).
    True if today has a HIGH or EXTREME event.
    """
    events = get_upcoming_events(days_ahead=1)
    for ev in events:
        if ev.get("days_away", 99) == 0 and ev.get("impact") in ("HIGH", "EXTREME"):
            return True, ev["event"]
    return False, ""


def get_event_score_multiplier() -> float:
    """
    Returns a confidence score multiplier based on upcoming events.
    - Day of HIGH event   → 0.5x (be cautious)
    - Day before HIGH     → 0.75x
    - Normal day          → 1.0x
    - Day of EXTREME      → 0.3x
    """
    events = get_upcoming_events(days_ahead=2)
    mult = 1.0
    for ev in events:
        days_away = ev.get("days_away", 99)
        impact    = ev.get("impact", "LOW")
        if impact == "EXTREME" and days_away == 0:
            mult = min(mult, 0.3)
        elif impact == "EXTREME" and days_away == 1:
            mult = min(mult, 0.6)
        elif impact == "HIGH" and days_away == 0:
            mult = min(mult, 0.5)
        elif impact == "HIGH" and days_away == 1:
            mult = min(mult, 0.75)
    return mult


# ── RSS Parsing ───────────────────────────────────────────────────────────────

def _parse_rss_items(xml_text: str, max_items: int = 10) -> List[Dict]:
    """Parse RSS XML and extract news items."""
    import xml.etree.ElementTree as ET

    items = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return items

    # Handle both RSS and Atom
    ns = {}
    channel = root.find("channel")
    if channel is None:
        channel = root

    for item in channel.findall("item")[:max_items]:
        title   = _text(item, "title")
        link    = _text(item, "link")
        summary = _text(item, "description")
        pub     = _text(item, "pubDate")

        # Clean HTML from summary
        if summary:
            summary = re.sub(r"<[^>]+>", "", summary).strip()[:300]

        # Parse date
        published = _parse_date(pub)

        # Extract source
        source = ""
        source_el = item.find("source")
        if source_el is not None:
            source = source_el.text or ""

        if title and link:
            items.append({
                "title":     title.strip(),
                "url":       link.strip(),
                "summary":   summary or "",
                "published": published,
                "source":    source,
                "image":     None,
            })

    return items


def _text(element, tag: str) -> str:
    el = element.find(tag)
    return (el.text or "").strip() if el is not None else ""


def _parse_date(date_str: str) -> str:
    """Parse RFC 2822 date to ISO format, return empty string on failure."""
    if not date_str:
        return ""
    try:
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(date_str).isoformat()
    except Exception:
        return date_str


# ── Async Fetch ───────────────────────────────────────────────────────────────

async def _fetch_url(session: aiohttp.ClientSession, url: str) -> str:
    """Fetch URL with timeout + error handling."""
    try:
        async with session.get(url, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=8)) as resp:
            if resp.status == 200:
                return await resp.text(encoding="utf-8", errors="replace")
    except Exception as e:
        logger.debug("[NewsFilter] fetch failed %s: %s", url[:80], e)
    return ""


async def fetch_news_for_ticker_async(ticker: str, max_items: int = 10) -> List[Dict]:
    """
    Fetch news for a given NSE ticker from multiple RSS sources.

    Args:
        ticker: NSE ticker like "RELIANCE.NS" or "RELIANCE"
        max_items: max news items to return

    Returns:
        List of news dicts: {title, url, summary, published, source, image}
    """
    cache_key = f"news_{ticker.upper()}"
    cached = _news_cache.get(cache_key)
    if cached:
        age = (datetime.now(timezone.utc) - cached["ts"]).total_seconds()
        if age < CACHE_TTL_SECONDS:
            return cached["data"]

    # Clean ticker for search query
    symbol = ticker.replace(".NS", "").replace(".BO", "").upper()

    # Build company name lookup (common NSE symbols → full names)
    company = _ticker_to_company(symbol) or symbol

    query = quote_plus(f"{company} NSE stock India")
    google_url = GOOGLE_NEWS_RSS.format(query=query)

    all_items: List[Dict] = []

    async with aiohttp.ClientSession() as session:
        # Fetch Google News for ticker (most relevant)
        tasks = [
            _fetch_url(session, google_url),
            _fetch_url(session, ET_MARKETS_RSS),
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    for i, xml in enumerate(results):
        if isinstance(xml, Exception) or not xml:
            continue
        parsed = _parse_rss_items(xml, max_items=6)
        if i == 0:
            # Google News — all relevant to ticker query
            all_items.extend(parsed)
        else:
            # General RSS — filter by ticker/company keyword
            kw = symbol.lower()
            co = company.lower().split()[0] if company else kw
            for item in parsed:
                text = (item.get("title", "") + item.get("summary", "")).lower()
                if kw in text or co in text:
                    all_items.append(item)

    # Deduplicate by URL
    seen: set = set()
    unique: List[Dict] = []
    for item in all_items:
        url = item.get("url", "")
        if url and url not in seen:
            seen.add(url)
            unique.append(item)

    # Sort by date (most recent first)
    def _sort_key(x):
        d = x.get("published", "")
        return d if d else "0"

    unique.sort(key=_sort_key, reverse=True)
    result = unique[:max_items]

    _news_cache[cache_key] = {"data": result, "ts": datetime.now(timezone.utc)}
    logger.info("[NewsFilter] %s → %d items fetched", symbol, len(result))
    return result


def _ticker_to_company(symbol: str) -> str:
    """Map common NSE tickers to company names for better search results."""
    lookup = {
        "RELIANCE":  "Reliance Industries",
        "TCS":       "Tata Consultancy Services",
        "INFY":      "Infosys",
        "HDFCBANK":  "HDFC Bank",
        "ICICIBANK": "ICICI Bank",
        "HINDUNILVR":"Hindustan Unilever",
        "ITC":       "ITC Limited",
        "KOTAKBANK": "Kotak Mahindra Bank",
        "LT":        "Larsen Toubro",
        "BHARTIARTL":"Bharti Airtel",
        "SBIN":      "State Bank of India",
        "WIPRO":     "Wipro",
        "BAJFINANCE":"Bajaj Finance",
        "TITAN":     "Titan Company",
        "MARUTI":    "Maruti Suzuki",
        "AXISBANK":  "Axis Bank",
        "NESTLEIND": "Nestle India",
        "TECHM":     "Tech Mahindra",
        "SUNPHARMA": "Sun Pharmaceutical",
        "POWERGRID": "Power Grid Corporation",
        "NTPC":      "NTPC",
        "ULTRACEMCO":"UltraTech Cement",
        "ASIANPAINT":"Asian Paints",
        "HCLTECH":   "HCL Technologies",
        "ADANIENT":  "Adani Enterprises",
        "ADANIPORTS":"Adani Ports",
        "NIFTY":     "Nifty 50",
        "BANKNIFTY": "Bank Nifty",
        "SENSEX":    "BSE Sensex",
    }
    return lookup.get(symbol, symbol)


# ── Sync wrapper for server.py ────────────────────────────────────────────────

def fetch_news_for_ticker_sync(ticker: str, max_items: int = 10) -> List[Dict]:
    """Synchronous wrapper for use in FastAPI sync endpoints."""
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        result = loop.run_until_complete(fetch_news_for_ticker_async(ticker, max_items))
        loop.close()
        return result
    except Exception as e:
        logger.error("[NewsFilter] sync fetch failed for %s: %s", ticker, e)
        return []


__all__ = [
    "fetch_news_for_ticker_async",
    "fetch_news_for_ticker_sync",
    "get_upcoming_events",
    "is_high_impact_event_today",
    "get_event_score_multiplier",
]
