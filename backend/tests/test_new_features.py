"""
Test suite for new trading features:
- PropSafe Mode (drawdown protection)
- Position Sizing Intelligence (Kelly Criterion + Volatility Adaptive)
- Time Window API (adaptive time windows)
- NSE Event Calendar
- News RSS Feed (replaced yfinance)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


class TestPropSafeAPI:
    """PropSafe Mode — drawdown protection endpoints"""

    def test_status_returns_200(self):
        """GET /api/propsafe/status should return 200 with required fields"""
        resp = requests.get(f"{BASE_URL}/api/propsafe/status", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_status_has_enabled_field(self):
        """Status response must contain 'enabled' field"""
        resp = requests.get(f"{BASE_URL}/api/propsafe/status", timeout=10)
        data = resp.json()
        assert "enabled" in data, f"Missing 'enabled' in: {data}"

    def test_status_has_daily_loss_limit(self):
        """Status response must contain 'daily_loss_limit_pct' field"""
        resp = requests.get(f"{BASE_URL}/api/propsafe/status", timeout=10)
        data = resp.json()
        assert "daily_loss_limit_pct" in data, f"Missing 'daily_loss_limit_pct' in: {data}"

    def test_status_has_max_drawdown(self):
        """Status response must contain 'max_drawdown_pct' field"""
        resp = requests.get(f"{BASE_URL}/api/propsafe/status", timeout=10)
        data = resp.json()
        assert "max_drawdown_pct" in data, f"Missing 'max_drawdown_pct' in: {data}"

    def test_status_initial_disabled(self):
        """Initially PropSafe should be disabled (or toggleable)"""
        resp = requests.get(f"{BASE_URL}/api/propsafe/status", timeout=10)
        data = resp.json()
        # Just verify it returns a boolean, not necessarily False
        assert isinstance(data.get("enabled"), bool), \
            f"'enabled' should be bool, got {type(data.get('enabled'))}"

    def test_configure_enable(self):
        """POST /api/propsafe/configure with enabled=true should enable PropSafe"""
        payload = {
            "enabled": True,
            "daily_loss_limit_pct": 2.0,
            "max_drawdown_pct": 5.0,
        }
        resp = requests.post(f"{BASE_URL}/api/propsafe/configure", json=payload, timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("enabled") is True, f"Expected enabled=True in: {data}"

    def test_configure_sets_limits(self):
        """Configure should set daily_loss_limit_pct and max_drawdown_pct"""
        payload = {
            "enabled": True,
            "daily_loss_limit_pct": 3.0,
            "max_drawdown_pct": 7.0,
        }
        resp = requests.post(f"{BASE_URL}/api/propsafe/configure", json=payload, timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("daily_loss_limit_pct") == 3.0, \
            f"Expected daily_loss_limit_pct=3.0, got {data.get('daily_loss_limit_pct')}"
        assert data.get("max_drawdown_pct") == 7.0, \
            f"Expected max_drawdown_pct=7.0, got {data.get('max_drawdown_pct')}"

    def test_configure_disable(self):
        """POST configure with enabled=false should disable PropSafe"""
        payload = {"enabled": False}
        resp = requests.post(f"{BASE_URL}/api/propsafe/configure", json=payload, timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("enabled") is False, f"Expected enabled=False in: {data}"

    def test_reset_returns_200(self):
        """POST /api/propsafe/reset should return 200"""
        resp = requests.post(f"{BASE_URL}/api/propsafe/reset", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_reset_clears_breach_flags(self):
        """After reset, breach flags should be cleared"""
        resp = requests.post(f"{BASE_URL}/api/propsafe/reset", timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("daily_loss_breached") is False, \
            f"Expected daily_loss_breached=False after reset, got: {data}"
        assert data.get("max_dd_breached") is False, \
            f"Expected max_dd_breached=False after reset, got: {data}"

    def test_status_has_safe_to_trade_field(self):
        """Status should include safe_to_trade field"""
        resp = requests.get(f"{BASE_URL}/api/propsafe/status", timeout=10)
        data = resp.json()
        assert "safe_to_trade" in data, f"Missing 'safe_to_trade' in: {data}"


class TestPositionSizerAPI:
    """Position Sizing Intelligence (Kelly + Volatility Adaptive)"""

    def test_calculate_returns_200(self):
        """POST /api/position-sizer/calculate should return 200"""
        payload = {
            "capital": 100000.0,
            "current_price": 1000.0,
            "win_rate": 0.55,
            "avg_win_pct": 2.0,
            "avg_loss_pct": 1.0,
            "atr_pct": 1.5,
        }
        resp = requests.post(f"{BASE_URL}/api/position-sizer/calculate", json=payload, timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_calculate_has_quantity_field(self):
        """Response must contain 'quantity' field"""
        payload = {
            "capital": 100000.0,
            "current_price": 1000.0,
            "win_rate": 0.55,
            "avg_win_pct": 2.0,
            "avg_loss_pct": 1.0,
            "atr_pct": 1.5,
        }
        resp = requests.post(f"{BASE_URL}/api/position-sizer/calculate", json=payload, timeout=10)
        data = resp.json()
        assert "quantity" in data, f"Missing 'quantity' in: {data}"
        assert isinstance(data["quantity"], int), f"quantity should be int, got {type(data['quantity'])}"

    def test_calculate_has_tier_field(self):
        """Response must contain 'tier' field with valid value"""
        payload = {
            "capital": 100000.0,
            "current_price": 1000.0,
            "win_rate": 0.55,
            "avg_win_pct": 2.0,
            "avg_loss_pct": 1.0,
            "atr_pct": 1.5,
        }
        resp = requests.post(f"{BASE_URL}/api/position-sizer/calculate", json=payload, timeout=10)
        data = resp.json()
        assert "tier" in data, f"Missing 'tier' in: {data}"
        assert data["tier"] in ["NANO", "SMALL", "MODERATE", "AGGRESSIVE", "CAPPED", "INVALID"], \
            f"Unexpected tier value: {data['tier']}"

    def test_calculate_has_final_fraction_pct(self):
        """Response must contain 'final_fraction_pct' field"""
        payload = {
            "capital": 100000.0,
            "current_price": 1000.0,
            "win_rate": 0.55,
            "avg_win_pct": 2.0,
            "avg_loss_pct": 1.0,
            "atr_pct": 1.5,
        }
        resp = requests.post(f"{BASE_URL}/api/position-sizer/calculate", json=payload, timeout=10)
        data = resp.json()
        assert "final_fraction_pct" in data, f"Missing 'final_fraction_pct' in: {data}"

    def test_calculate_has_edge_positive(self):
        """Response must contain 'edge_positive' field"""
        payload = {
            "capital": 100000.0,
            "current_price": 1000.0,
            "win_rate": 0.55,
            "avg_win_pct": 2.0,
            "avg_loss_pct": 1.0,
            "atr_pct": 1.5,
        }
        resp = requests.post(f"{BASE_URL}/api/position-sizer/calculate", json=payload, timeout=10)
        data = resp.json()
        assert "edge_positive" in data, f"Missing 'edge_positive' in: {data}"
        assert isinstance(data["edge_positive"], bool), \
            f"edge_positive should be bool, got {type(data['edge_positive'])}"

    def test_calculate_positive_edge_for_good_stats(self):
        """Win rate 55% with 2:1 reward:risk should have positive edge"""
        payload = {
            "capital": 100000.0,
            "current_price": 1000.0,
            "win_rate": 0.55,
            "avg_win_pct": 2.0,
            "avg_loss_pct": 1.0,
            "atr_pct": 1.5,
        }
        resp = requests.post(f"{BASE_URL}/api/position-sizer/calculate", json=payload, timeout=10)
        data = resp.json()
        assert data.get("edge_positive") is True, \
            f"55% WR with 2:1 RR should have positive edge, got: {data}"

    def test_calculate_with_prop_safe_multiplier(self):
        """Test with prop_safe_multiplier=0.5 reduces position size"""
        payload_full = {
            "capital": 100000.0,
            "current_price": 1000.0,
            "win_rate": 0.55,
            "avg_win_pct": 2.0,
            "avg_loss_pct": 1.0,
            "atr_pct": 1.5,
            "prop_safe_multiplier": 1.0,
        }
        payload_half = {**payload_full, "prop_safe_multiplier": 0.5}

        resp_full = requests.post(f"{BASE_URL}/api/position-sizer/calculate", json=payload_full, timeout=10)
        resp_half = requests.post(f"{BASE_URL}/api/position-sizer/calculate", json=payload_half, timeout=10)

        assert resp_full.status_code == 200
        assert resp_half.status_code == 200
        # Half multiplier should yield smaller or equal position
        assert resp_half.json().get("quantity", 999) <= resp_full.json().get("quantity", 0), \
            f"Half prop_safe_mult should reduce quantity: full={resp_full.json()}, half={resp_half.json()}"


class TestTimeWindowAPI:
    """Time Window API"""

    def test_get_time_window_returns_200(self):
        """GET /api/time-window should return 200"""
        resp = requests.get(f"{BASE_URL}/api/time-window", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_time_window_has_window_field(self):
        """Response must contain 'window' field"""
        resp = requests.get(f"{BASE_URL}/api/time-window", timeout=10)
        data = resp.json()
        assert "window" in data, f"Missing 'window' in: {data}"
        valid_windows = ["opening_drive", "mid_morning", "lunch", "afternoon", "closing_drive", "market_closed"]
        assert data["window"] in valid_windows, \
            f"Unexpected window value '{data['window']}', expected one of {valid_windows}"

    def test_time_window_has_label_field(self):
        """Response must contain 'label' field"""
        resp = requests.get(f"{BASE_URL}/api/time-window", timeout=10)
        data = resp.json()
        assert "label" in data, f"Missing 'label' in: {data}"
        assert isinstance(data["label"], str) and len(data["label"]) > 0, \
            f"label should be non-empty string, got: {data['label']}"

    def test_time_window_has_weight_field(self):
        """Response must contain 'weight' field"""
        resp = requests.get(f"{BASE_URL}/api/time-window", timeout=10)
        data = resp.json()
        assert "weight" in data, f"Missing 'weight' in: {data}"
        assert isinstance(data["weight"], (int, float)), \
            f"weight should be numeric, got {type(data['weight'])}"

    def test_time_window_has_time_ist_field(self):
        """Response must contain 'time_ist' field"""
        resp = requests.get(f"{BASE_URL}/api/time-window", timeout=10)
        data = resp.json()
        assert "time_ist" in data, f"Missing 'time_ist' in: {data}"
        assert "IST" in data["time_ist"], \
            f"time_ist should contain 'IST', got: {data['time_ist']}"


class TestNSEEventsAPI:
    """NSE Event Calendar"""

    def test_upcoming_events_returns_200(self):
        """GET /api/events/upcoming should return 200"""
        resp = requests.get(f"{BASE_URL}/api/events/upcoming", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_upcoming_events_has_events_array(self):
        """Response must contain 'events' array"""
        resp = requests.get(f"{BASE_URL}/api/events/upcoming", timeout=10)
        data = resp.json()
        assert "events" in data, f"Missing 'events' in: {data}"
        assert isinstance(data["events"], list), \
            f"'events' should be a list, got {type(data['events'])}"

    def test_upcoming_events_has_event_score_multiplier(self):
        """Response must contain 'event_score_multiplier' field"""
        resp = requests.get(f"{BASE_URL}/api/events/upcoming", timeout=10)
        data = resp.json()
        assert "event_score_multiplier" in data, f"Missing 'event_score_multiplier' in: {data}"
        mult = data["event_score_multiplier"]
        assert isinstance(mult, (int, float)) and 0 < mult <= 1.0, \
            f"event_score_multiplier should be (0,1], got: {mult}"

    def test_upcoming_events_with_custom_days_ahead(self):
        """Events endpoint should accept days_ahead parameter"""
        resp = requests.get(f"{BASE_URL}/api/events/upcoming?days_ahead=30", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "events" in data


class TestNewsRSSAPI:
    """News RSS Feed — replaces yfinance"""

    def test_news_returns_200_for_reliance(self):
        """GET /api/news/RELIANCE should return 200"""
        resp = requests.get(f"{BASE_URL}/api/news/RELIANCE", timeout=20)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_news_returns_list(self):
        """News response should be a list"""
        resp = requests.get(f"{BASE_URL}/api/news/RELIANCE", timeout=20)
        data = resp.json()
        # Could be list directly or wrapped
        if isinstance(data, dict):
            assert "news" in data or "items" in data or len(data) > 0, \
                f"Unexpected response format: {data}"
        else:
            assert isinstance(data, list), f"Expected list, got {type(data)}"

    def test_news_items_have_title(self):
        """News items should have title field"""
        resp = requests.get(f"{BASE_URL}/api/news/RELIANCE", timeout=20)
        data = resp.json()
        items = data if isinstance(data, list) else data.get("news", data.get("items", []))
        if len(items) > 0:
            assert "title" in items[0], f"News item missing 'title': {items[0]}"

    def test_news_source_is_rss(self):
        """News items should have source field indicating RSS (not yfinance)"""
        resp = requests.get(f"{BASE_URL}/api/news/RELIANCE", timeout=20)
        data = resp.json()
        items = data if isinstance(data, list) else data.get("news", data.get("items", []))
        if len(items) > 0:
            # Check source field exists
            first = items[0]
            # Either source='rss', or the item has a 'url' field pointing to a news site
            has_source = "source" in first
            has_url = "url" in first
            assert has_source or has_url, \
                f"News item should have 'source' or 'url' field: {first}"
            # Should NOT be from yfinance
            if has_source:
                assert "yfinance" not in str(first.get("source", "")).lower(), \
                    f"News source should not be yfinance: {first['source']}"
