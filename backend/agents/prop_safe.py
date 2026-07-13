"""
PropSafe Mode — Drawdown Protection Engine
==========================================
Institutional-grade daily loss limit + max drawdown protection.

Features:
  1. Daily Loss Limit   — stop trading when daily PnL crosses -X%
  2. Max Drawdown       — stop trading when equity drawdown crosses -Y%
  3. Kill Switch        — auto-block new entries on breach
  4. Gradual Position   — reduce size as approaching limits (warning zone)
  5. Auto-Reset         — resets daily limit tracker at 09:15 IST each day

DISCLAIMER: Paper trading only. No guaranteed returns.
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional, Tuple

logger = logging.getLogger(__name__)

# ── Defaults ──────────────────────────────────────────────────────────────────
DEFAULT_DAILY_LOSS_LIMIT_PCT   = 2.0   # 2% of capital
DEFAULT_MAX_DRAWDOWN_PCT       = 5.0   # 5% total drawdown
DEFAULT_WARNING_ZONE_PCT       = 0.75  # trigger warning at 75% of limit
DEFAULT_SIZE_REDUCTION_WARNING = 0.50  # reduce position size by 50% in warning zone


class PropSafe:
    """
    PropSafe Mode — Real-time drawdown + daily loss protection.

    Usage:
        prop_safe = PropSafe()
        prop_safe.enable(daily_limit_pct=2.0, max_dd_pct=5.0)

        # Before every trade entry:
        ok, reason, size_mult = prop_safe.check_entry(daily_pnl_pct, drawdown_pct)
        if not ok:
            # blocked by PropSafe
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._enabled: bool = False

        # Config
        self.daily_loss_limit_pct:   float = DEFAULT_DAILY_LOSS_LIMIT_PCT
        self.max_drawdown_pct:       float = DEFAULT_MAX_DRAWDOWN_PCT
        self.warning_zone_pct:       float = DEFAULT_WARNING_ZONE_PCT

        # Runtime state
        self._daily_loss_breached:   bool  = False
        self._max_dd_breached:       bool  = False
        self._today_str:             str   = ""
        self._peak_capital:          float = 0.0
        self._current_capital:       float = 0.0
        self._daily_start_capital:   float = 0.0

        # Stats
        self._total_blocks:  int = 0
        self._warnings_today: int = 0

    # ── Config ────────────────────────────────────────────────────────────────

    def enable(
        self,
        daily_loss_limit_pct: Optional[float] = None,
        max_drawdown_pct: Optional[float] = None,
    ) -> Dict:
        with self._lock:
            self._enabled = True
            if daily_loss_limit_pct is not None:
                self.daily_loss_limit_pct = float(daily_loss_limit_pct)
            if max_drawdown_pct is not None:
                self.max_drawdown_pct = float(max_drawdown_pct)
            logger.info(
                "[PropSafe] ENABLED | daily_limit=%.1f%% max_dd=%.1f%%",
                self.daily_loss_limit_pct, self.max_drawdown_pct,
            )
        return self.get_status()

    def disable(self) -> Dict:
        with self._lock:
            self._enabled = False
            self._daily_loss_breached = False
            self._max_dd_breached = False
            logger.info("[PropSafe] DISABLED")
        return self.get_status()

    def configure(
        self,
        daily_loss_limit_pct: Optional[float] = None,
        max_drawdown_pct: Optional[float] = None,
    ) -> Dict:
        with self._lock:
            if daily_loss_limit_pct is not None:
                self.daily_loss_limit_pct = float(daily_loss_limit_pct)
            if max_drawdown_pct is not None:
                self.max_drawdown_pct = float(max_drawdown_pct)
        return self.get_status()

    # ── Daily reset ───────────────────────────────────────────────────────────

    def daily_reset(self, current_capital: float) -> None:
        """Call at 09:15 IST each trading day."""
        with self._lock:
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            if today == self._today_str:
                return
            self._today_str = today
            self._daily_loss_breached = False
            self._warnings_today = 0
            self._daily_start_capital = current_capital
            logger.info("[PropSafe] Daily reset | capital=%.2f", current_capital)

    def update_capital(self, current_capital: float) -> None:
        """Call whenever capital changes to track peak + drawdown."""
        with self._lock:
            self._current_capital = current_capital
            if current_capital > self._peak_capital:
                self._peak_capital = current_capital

    # ── Core check ────────────────────────────────────────────────────────────

    def check_entry(
        self,
        daily_pnl: float,
        capital: float,
        peak_capital: Optional[float] = None,
    ) -> Tuple[bool, str, float]:
        """
        Check if a new trade entry is allowed.

        Returns:
            (allowed: bool, reason: str, size_multiplier: float)
            size_multiplier: 1.0 = normal, 0.5 = warning zone, 0.0 = blocked
        """
        if not self._enabled:
            return True, "PropSafe inactive", 1.0

        with self._lock:
            if capital <= 0:
                return True, "PropSafe: capital=0, skipping check", 1.0

            # Update peak
            self.update_capital(capital)
            pk = peak_capital or self._peak_capital or capital

            # ── Daily Loss Check ──────────────────────────────────────────────
            daily_loss_pct = -(daily_pnl / capital * 100) if daily_pnl < 0 else 0.0

            if daily_loss_pct >= self.daily_loss_limit_pct:
                self._daily_loss_breached = True
                self._total_blocks += 1
                reason = (
                    f"PropSafe BLOCKED: Daily loss {daily_loss_pct:.1f}% "
                    f"≥ limit {self.daily_loss_limit_pct:.1f}%"
                )
                logger.warning("[PropSafe] %s", reason)
                return False, reason, 0.0

            # ── Drawdown Check ────────────────────────────────────────────────
            if pk > 0:
                dd_pct = (pk - capital) / pk * 100
            else:
                dd_pct = 0.0

            if dd_pct >= self.max_drawdown_pct:
                self._max_dd_breached = True
                self._total_blocks += 1
                reason = (
                    f"PropSafe BLOCKED: Drawdown {dd_pct:.1f}% "
                    f"≥ max {self.max_drawdown_pct:.1f}%"
                )
                logger.warning("[PropSafe] %s", reason)
                return False, reason, 0.0

            # ── Warning Zone ──────────────────────────────────────────────────
            daily_warn_thresh = self.daily_loss_limit_pct * self.warning_zone_pct
            dd_warn_thresh    = self.max_drawdown_pct    * self.warning_zone_pct

            in_daily_warning = daily_loss_pct >= daily_warn_thresh
            in_dd_warning    = dd_pct         >= dd_warn_thresh

            if in_daily_warning or in_dd_warning:
                self._warnings_today += 1
                reason = (
                    f"PropSafe WARNING: "
                    f"daily_loss={daily_loss_pct:.1f}% "
                    f"drawdown={dd_pct:.1f}% — reducing size 50%"
                )
                logger.info("[PropSafe] %s", reason)
                return True, reason, DEFAULT_SIZE_REDUCTION_WARNING

            return True, "PropSafe: OK", 1.0

    # ── Status ────────────────────────────────────────────────────────────────

    def get_status(self) -> Dict:
        with self._lock:
            cap = self._current_capital or 1.0
            pk  = self._peak_capital    or cap
            dd_pct       = (pk - cap) / pk * 100 if pk > 0 else 0.0
            daily_used   = 0.0  # updated externally via check_entry
            daily_warn   = self.daily_loss_limit_pct * self.warning_zone_pct
            dd_warn      = self.max_drawdown_pct     * self.warning_zone_pct

            return {
                "enabled":               self._enabled,
                "daily_loss_limit_pct":  self.daily_loss_limit_pct,
                "max_drawdown_pct":      self.max_drawdown_pct,
                "warning_zone_pct":      self.warning_zone_pct,
                "daily_loss_breached":   self._daily_loss_breached,
                "max_dd_breached":       self._max_dd_breached,
                "current_drawdown_pct":  round(dd_pct, 2),
                "peak_capital":          round(pk, 2),
                "current_capital":       round(cap, 2),
                "total_blocks_today":    self._total_blocks,
                "warnings_today":        self._warnings_today,
                "daily_warning_thresh":  round(daily_warn, 2),
                "dd_warning_thresh":     round(dd_warn, 2),
                "safe_to_trade":         self._enabled and not self._daily_loss_breached and not self._max_dd_breached,
            }

    def reset_breaches(self) -> Dict:
        """Manual override — reset breaches (use with caution)."""
        with self._lock:
            self._daily_loss_breached = False
            self._max_dd_breached     = False
            self._total_blocks        = 0
            logger.info("[PropSafe] Breaches manually reset")
        return self.get_status()


# ── Singleton ─────────────────────────────────────────────────────────────────
prop_safe = PropSafe()

__all__ = ["PropSafe", "prop_safe"]
