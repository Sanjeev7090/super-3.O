"""
Position Sizing Intelligence — Kelly Criterion + Volatility Adaptive
=====================================================================
Standalone module that wraps core Kelly math with volatility-based
dynamic adjustments. Designed for quick API access and frontend display.

Formula:
    Kelly fraction  f* = (b*p - q) / b
    where:  b = avg_win / avg_loss  (reward:risk ratio)
            p = win_rate
            q = 1 - p

    Volatility adjustment: size_mult = clamp(1.5 / atr_pct, 0.25, 2.0)
    Final fraction       = half_kelly * volatility_mult

Sizing tiers (for display):
    0 – 5%    : NANO       (< 5% of capital)
    5 – 10%   : SMALL      (5-10%)
    10 – 15%  : MODERATE   (10-15%)
    15 – 25%  : AGGRESSIVE (15-25%)
    > 25%     : CAPPED AT 25% (hard ceiling)

DISCLAIMER: For research/paper trading only. No guaranteed returns.
"""

from __future__ import annotations

import logging
import math
from typing import Dict, Optional

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────
HALF_KELLY          = 0.50    # conservative: use half the full Kelly
MAX_POSITION_PCT    = 0.25    # never exceed 25% of capital in one trade
MIN_POSITION_PCT    = 0.005   # floor: 0.5%
BASELINE_ATR_PCT    = 1.50    # "normal" daily ATR% for NSE stocks
MAX_VOL_MULT        = 2.0     # cap vol multiplier at 2x when very low vol
MIN_VOL_MULT        = 0.25    # floor vol multiplier at 0.25x when very high vol

# Event / time window multipliers
TIME_WINDOW_MULTIPLIERS = {
    "opening_drive":   1.50,  # 09:15 – 10:00 IST
    "mid_morning":     1.10,  # 10:00 – 11:30 IST
    "lunch":           0.80,  # 11:30 – 13:00 IST
    "afternoon":       1.00,  # 13:00 – 14:00 IST
    "closing_drive":   1.20,  # 14:00 – 15:30 IST
}


def kelly_fraction(
    win_rate: float,
    avg_win_pct: float,
    avg_loss_pct: float,
) -> float:
    """
    Compute full Kelly fraction (0 → 1).

    Args:
        win_rate:     historical win rate (0-1, e.g. 0.55)
        avg_win_pct:  average winning trade return in % (e.g. 2.5)
        avg_loss_pct: average losing trade return in % (positive, e.g. 1.2)

    Returns:
        Kelly fraction clipped to [0, 1]
    """
    if avg_loss_pct <= 0 or win_rate <= 0:
        return 0.0
    if win_rate >= 1.0:
        return 1.0

    b = avg_win_pct / avg_loss_pct      # reward:risk ratio
    p = float(win_rate)
    q = 1.0 - p

    kelly = (b * p - q) / b             # classic Kelly formula
    return float(max(0.0, min(1.0, kelly)))


def volatility_multiplier(atr_pct: float) -> float:
    """
    Returns a size multiplier based on ATR%.
    Higher volatility → smaller position (risk stays constant).

    atr_pct should be in % terms (e.g. 1.5 for 1.5% ATR).
    """
    if atr_pct <= 0:
        return 1.0
    mult = BASELINE_ATR_PCT / atr_pct
    return float(max(MIN_VOL_MULT, min(MAX_VOL_MULT, mult)))


def compute_position_size(
    capital: float,
    win_rate: float,
    avg_win_pct: float,
    avg_loss_pct: float,
    atr_pct: float,
    current_price: float,
    lot_size: int = 1,
    prop_safe_multiplier: float = 1.0,
) -> Dict:
    """
    Full position sizing calculation.

    Returns rich dict with sizing breakdown for frontend display.
    """
    if capital <= 0 or current_price <= 0:
        return _empty_result("Invalid capital or price")

    # ── Kelly ─────────────────────────────────────────────────────────────────
    full_kelly = kelly_fraction(win_rate, avg_win_pct, avg_loss_pct)
    half_k     = full_kelly * HALF_KELLY

    # ── Volatility adjustment ─────────────────────────────────────────────────
    vol_mult   = volatility_multiplier(atr_pct)

    # ── Final fraction ────────────────────────────────────────────────────────
    raw_frac   = half_k * vol_mult * prop_safe_multiplier
    final_frac = float(max(MIN_POSITION_PCT, min(MAX_POSITION_PCT, raw_frac)))

    # ── Money amounts ─────────────────────────────────────────────────────────
    capital_to_deploy = capital * final_frac
    qty               = max(lot_size, int(capital_to_deploy / current_price))
    actual_value      = qty * current_price
    actual_pct        = actual_value / capital * 100.0

    # ── Tier label ────────────────────────────────────────────────────────────
    tier = _size_tier(actual_pct)

    # ── Reward:risk ───────────────────────────────────────────────────────────
    rr = avg_win_pct / avg_loss_pct if avg_loss_pct > 0 else 1.5
    expected_value = win_rate * avg_win_pct - (1 - win_rate) * avg_loss_pct

    result = {
        "capital":              round(capital, 2),
        "current_price":        round(current_price, 2),
        "win_rate_pct":         round(win_rate * 100, 1),
        "avg_win_pct":          round(avg_win_pct, 2),
        "avg_loss_pct":         round(avg_loss_pct, 2),
        "atr_pct":              round(atr_pct, 2),
        "full_kelly_pct":       round(full_kelly * 100, 2),
        "half_kelly_pct":       round(half_k * 100, 2),
        "volatility_mult":      round(vol_mult, 3),
        "prop_safe_mult":       round(prop_safe_multiplier, 2),
        "final_fraction_pct":   round(final_frac * 100, 2),
        "capital_to_deploy":    round(capital_to_deploy, 2),
        "quantity":             qty,
        "actual_position_value":round(actual_value, 2),
        "actual_position_pct":  round(actual_pct, 2),
        "tier":                 tier,
        "reward_risk_ratio":    round(rr, 2),
        "expected_value_pct":   round(expected_value, 2),
        "edge_positive":        expected_value > 0,
    }

    logger.debug(
        "[PositionSizer] K=%.1f%% vol_mult=%.2f → final=%.1f%% qty=%d tier=%s",
        half_k * 100, vol_mult, final_frac * 100, qty, tier,
    )
    return result


def _size_tier(pct: float) -> str:
    if pct < 5:   return "NANO"
    if pct < 10:  return "SMALL"
    if pct < 15:  return "MODERATE"
    if pct < 25:  return "AGGRESSIVE"
    return "CAPPED"


def _empty_result(reason: str) -> Dict:
    return {
        "error":              reason,
        "quantity":           0,
        "final_fraction_pct": 0.0,
        "tier":               "INVALID",
        "edge_positive":      False,
    }


def get_time_window_info(now_ist=None) -> Dict:
    """
    Returns current time window label + multiplier for IST.
    Used by trading_loop and frontend display.
    """
    from datetime import datetime, timezone, timedelta
    if now_ist is None:
        now_utc = datetime.now(timezone.utc)
        now_ist = now_utc + timedelta(hours=5, minutes=30)

    h, m = now_ist.hour, now_ist.minute
    t = h * 60 + m   # minutes since midnight

    # 09:15 – 10:00 = Opening Drive (highest weight)
    if 9 * 60 + 15 <= t < 10 * 60:
        window = "opening_drive"
        label  = "Opening Drive"
        weight = 1.50

    # 10:00 – 11:30 = Mid Morning
    elif 10 * 60 <= t < 11 * 60 + 30:
        window = "mid_morning"
        label  = "Mid Morning"
        weight = 1.10

    # 11:30 – 13:00 = Lunch / Low volatility
    elif 11 * 60 + 30 <= t < 13 * 60:
        window = "lunch"
        label  = "Lunch Zone"
        weight = 0.80

    # 13:00 – 14:00 = Afternoon
    elif 13 * 60 <= t < 14 * 60:
        window = "afternoon"
        label  = "Afternoon"
        weight = 1.00

    # 14:00 – 15:30 = Closing Drive (secondary weight)
    elif 14 * 60 <= t < 15 * 60 + 30:
        window = "closing_drive"
        label  = "Closing Drive"
        weight = 1.20

    else:
        window = "market_closed"
        label  = "Market Closed"
        weight = 0.0

    return {
        "window":      window,
        "label":       label,
        "weight":      weight,
        "time_ist":    now_ist.strftime("%H:%M IST"),
        "description": _window_description(window),
    }


def _window_description(window: str) -> str:
    desc = {
        "opening_drive":  "Highest liquidity + momentum. Best entries.",
        "mid_morning":    "Trend confirmation phase. Good for breakouts.",
        "lunch":          "Low volume. Reduced position sizing recommended.",
        "afternoon":      "Trend continuation. Normal sizing.",
        "closing_drive":  "Closing momentum. Quick trades only.",
        "market_closed":  "NSE market closed.",
    }
    return desc.get(window, "")


__all__ = [
    "kelly_fraction",
    "volatility_multiplier",
    "compute_position_size",
    "get_time_window_info",
]
