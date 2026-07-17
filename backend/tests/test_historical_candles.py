"""
Test historical candle data fix — verifies minimum 1 year of bars for 1D/1W timeframes
and correctness of intraday + monthly-style timeframes.
Endpoint: GET /api/stock/bars/{ticker}
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
TICKER = "RELIANCE.NS"

@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ──────────────────────────────────────────────────────────────────────────────
# Helper
# ──────────────────────────────────────────────────────────────────────────────

def get_bars(session, ticker, timespan, multiplier, from_date=None, to_date=None):
    params = {"timespan": timespan, "multiplier": multiplier}
    if from_date:
        params["from_date"] = from_date
    if to_date:
        params["to_date"] = to_date
    resp = session.get(f"{BASE_URL}/api/stock/bars/{ticker}", params=params, timeout=30)
    return resp


# ──────────────────────────────────────────────────────────────────────────────
# 1. Daily (1D) timeframe — should return at least 365 bars (1+ year of data)
# ──────────────────────────────────────────────────────────────────────────────

class TestDailyTimeframe:
    """Daily (1D) bars — fix extended default from 120 days to 730 days"""

    def test_daily_status_200(self, session):
        """Endpoint must return HTTP 200 for daily timeframe"""
        resp = get_bars(session, TICKER, "day", 1)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text[:300]}"

    def test_daily_response_structure(self, session):
        """Response must have 'ticker' and 'bars' keys"""
        resp = get_bars(session, TICKER, "day", 1)
        data = resp.json()
        assert "ticker" in data, "Missing 'ticker' key in response"
        assert "bars" in data, "Missing 'bars' key in response"
        assert isinstance(data["bars"], list), "'bars' must be a list"

    def test_daily_bar_count_minimum_365(self, session):
        """Daily bars must be >= 365 (1+ year of data). Previously only 120 were returned."""
        resp = get_bars(session, TICKER, "day", 1)
        data = resp.json()
        bar_count = len(data["bars"])
        print(f"Daily bar count: {bar_count}")
        assert bar_count >= 365, (
            f"Expected at least 365 daily bars (1 year), got {bar_count}. "
            "Backend default was not updated from 120 days to 730 days."
        )

    def test_daily_bar_span_at_least_1_year(self, session):
        """The date range of returned bars should span at least 1 year"""
        resp = get_bars(session, TICKER, "day", 1)
        data = resp.json()
        bars = data["bars"]
        assert len(bars) >= 2, "Need at least 2 bars to measure span"

        timestamps = [b["timestamp"] for b in bars]
        earliest = min(timestamps) / 1000  # convert ms → seconds
        latest = max(timestamps) / 1000
        span_days = (latest - earliest) / 86400
        print(f"Daily span: {span_days:.0f} days (earliest={datetime.fromtimestamp(earliest).date()}, latest={datetime.fromtimestamp(latest).date()})")
        assert span_days >= 365, (
            f"Bar span is only {span_days:.0f} days — expected at least 365 days (1 year)"
        )

    def test_daily_bar_fields_valid(self, session):
        """Each bar must contain timestamp, open, high, low, close, volume"""
        resp = get_bars(session, TICKER, "day", 1)
        data = resp.json()
        bar = data["bars"][0]
        for field in ("timestamp", "open", "high", "low", "close", "volume"):
            assert field in bar, f"Missing field '{field}' in bar: {bar}"
        assert bar["high"] >= bar["low"], "bar.high < bar.low — data integrity issue"


# ──────────────────────────────────────────────────────────────────────────────
# 2. Weekly (1W) timeframe — should return at least 200 bars (multi-year data)
# ──────────────────────────────────────────────────────────────────────────────

class TestWeeklyTimeframe:
    """Weekly (1W) bars — default extended to 1825 days (5 years)"""

    def test_weekly_status_200(self, session):
        resp = get_bars(session, TICKER, "week", 1)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text[:300]}"

    def test_weekly_bar_count_minimum_200(self, session):
        """Weekly bars must be >= 200 (roughly 4 years of weekly candles)"""
        resp = get_bars(session, TICKER, "week", 1)
        data = resp.json()
        bar_count = len(data["bars"])
        print(f"Weekly bar count: {bar_count}")
        assert bar_count >= 200, (
            f"Expected at least 200 weekly bars, got {bar_count}."
        )

    def test_weekly_bar_span_at_least_3_years(self, session):
        """Weekly bars should span at least 3 years"""
        resp = get_bars(session, TICKER, "week", 1)
        data = resp.json()
        bars = data["bars"]
        timestamps = [b["timestamp"] for b in bars]
        earliest = min(timestamps) / 1000
        latest = max(timestamps) / 1000
        span_days = (latest - earliest) / 86400
        print(f"Weekly span: {span_days:.0f} days (~{span_days/365:.1f} years)")
        assert span_days >= 3 * 365, (
            f"Weekly bar span is only {span_days:.0f} days ({span_days/365:.1f} yrs) — expected at least 3 years"
        )


# ──────────────────────────────────────────────────────────────────────────────
# 3. Intraday timeframes — must still work within yfinance allowed limits
# ──────────────────────────────────────────────────────────────────────────────

class TestIntradayTimeframes:
    """15M and 1H intraday bars — limits are 60 days and 730 days respectively"""

    def test_15min_status_200(self, session):
        resp = get_bars(session, TICKER, "minute", 15)
        assert resp.status_code == 200, f"15M failed: {resp.status_code} {resp.text[:200]}"

    def test_15min_returns_bars(self, session):
        resp = get_bars(session, TICKER, "minute", 15)
        data = resp.json()
        bar_count = len(data["bars"])
        print(f"15M bar count: {bar_count}")
        assert bar_count > 0, "15M returned 0 bars — something is broken"

    def test_15min_bar_count_within_limit(self, session):
        """15M should stay within 60-day window (≤ ~4000 bars for 60 days at 15M)"""
        resp = get_bars(session, TICKER, "minute", 15)
        data = resp.json()
        bar_count = len(data["bars"])
        # 60 days * 6.5 trading hours * 4 bars/hr = ~1560 bars max
        assert bar_count <= 3000, f"15M returned {bar_count} bars — unexpectedly high"

    def test_1hour_status_200(self, session):
        resp = get_bars(session, TICKER, "hour", 1)
        assert resp.status_code == 200, f"1H failed: {resp.status_code} {resp.text[:200]}"

    def test_1hour_returns_bars(self, session):
        resp = get_bars(session, TICKER, "hour", 1)
        data = resp.json()
        bar_count = len(data["bars"])
        print(f"1H bar count: {bar_count}")
        assert bar_count > 0, "1H returned 0 bars"

    def test_1hour_bar_count_reasonable(self, session):
        """1H can go up to 730 days — expect a healthy multi-month count"""
        resp = get_bars(session, TICKER, "hour", 1)
        data = resp.json()
        bar_count = len(data["bars"])
        # At minimum we want a few weeks of hourly data
        assert bar_count >= 30, f"1H returned only {bar_count} bars — too few"


# ──────────────────────────────────────────────────────────────────────────────
# 4. Monthly-style views (1MO=30d, 3MO=90d, 6MO=180d) via explicit from_date
# ──────────────────────────────────────────────────────────────────────────────

class TestMonthlyStyleTimeframes:
    """Frontend sends explicit from_date for 1MO / 3MO / 6MO — backend must honour it"""

    def test_1mo_30_days(self, session):
        """1MO view: from_date = today - 30 days, daily bars → ~15-23 bars"""
        from_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        to_date = datetime.now().strftime("%Y-%m-%d")
        resp = get_bars(session, TICKER, "day", 1, from_date=from_date, to_date=to_date)
        assert resp.status_code == 200, f"1MO (30d) failed: {resp.status_code}"
        data = resp.json()
        bar_count = len(data["bars"])
        print(f"1MO (30d) bar count: {bar_count}")
        # ~22 trading days in 30 calendar days
        assert 10 <= bar_count <= 35, (
            f"1MO (30d) returned {bar_count} bars — expected between 10–35 trading days"
        )

    def test_3mo_90_days(self, session):
        """3MO view: from_date = today - 90 days → ~60-70 bars"""
        from_date = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")
        to_date = datetime.now().strftime("%Y-%m-%d")
        resp = get_bars(session, TICKER, "day", 1, from_date=from_date, to_date=to_date)
        assert resp.status_code == 200, f"3MO (90d) failed: {resp.status_code}"
        data = resp.json()
        bar_count = len(data["bars"])
        print(f"3MO (90d) bar count: {bar_count}")
        assert 40 <= bar_count <= 85, (
            f"3MO (90d) returned {bar_count} bars — expected 40–85"
        )

    def test_6mo_180_days(self, session):
        """6MO view: from_date = today - 180 days → ~120-135 bars"""
        from_date = (datetime.now() - timedelta(days=180)).strftime("%Y-%m-%d")
        to_date = datetime.now().strftime("%Y-%m-%d")
        resp = get_bars(session, TICKER, "day", 1, from_date=from_date, to_date=to_date)
        assert resp.status_code == 200, f"6MO (180d) failed: {resp.status_code}"
        data = resp.json()
        bar_count = len(data["bars"])
        print(f"6MO (180d) bar count: {bar_count}")
        assert 80 <= bar_count <= 155, (
            f"6MO (180d) returned {bar_count} bars — expected 80–155"
        )


# ──────────────────────────────────────────────────────────────────────────────
# 5. Health / sanity check
# ──────────────────────────────────────────────────────────────────────────────

class TestApiHealth:
    """Basic API availability checks"""

    def test_backend_reachable(self, session):
        resp = session.get(f"{BASE_URL}/api/", timeout=10)
        assert resp.status_code in (200, 404), f"Backend unreachable: {resp.status_code}"

    def test_invalid_ticker_returns_error(self, session):
        """Unknown ticker should return 404 or meaningful error"""
        resp = get_bars(session, "INVALID_TICKER_XYZ_999", "day", 1)
        assert resp.status_code in (404, 422, 500), (
            f"Expected 4xx/5xx for invalid ticker, got {resp.status_code}"
        )
