"""
Tests for Black-Scholes IV Solver API
Tests: POST /api/black-scholes/calculate and POST /api/black-scholes/iv-solver
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestBSCalculate:
    """Black-Scholes calculation endpoint tests"""

    def test_bs_calculate_atm_call_put(self):
        """NIFTY ATM preset: S=K=24500, T=7 days, r=0.065, sigma=0.14"""
        payload = {"S": 24500, "K": 24500, "T_days": 7, "r": 0.065, "sigma": 0.14, "dividend_yield": 0.0}
        resp = requests.post(f"{BASE_URL}/api/black-scholes/calculate", json=payload)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "call_price" in data
        assert "put_price" in data
        assert "greeks" in data
        assert "d1" in data and "d2" in data
        assert data["call_price"] > 0
        assert data["put_price"] > 0
        # ATM call price should be close to put price (put-call parity approx)
        assert abs(data["call_price"] - data["put_price"]) < 50
        print(f"BS Calc ATM NIFTY: call={data['call_price']}, put={data['put_price']}")

    def test_bs_calculate_greeks_present(self):
        """Greeks table (Delta, Gamma, Vega, Theta, Rho) should be present"""
        payload = {"S": 24500, "K": 24500, "T_days": 7, "r": 0.065, "sigma": 0.14, "dividend_yield": 0.0}
        resp = requests.post(f"{BASE_URL}/api/black-scholes/calculate", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        greeks = data.get("greeks", {})
        call_g = greeks.get("call", {})
        put_g = greeks.get("put", {})
        for greek in ["Delta", "Gamma", "Vega", "Theta", "Rho"]:
            assert greek in call_g, f"Missing {greek} in call greeks"
            assert greek in put_g, f"Missing {greek} in put greeks"
        print(f"Greeks Call: {call_g}")

    def test_bs_calculate_banknifty_preset(self):
        """BANKNIFTY preset: S=K=52000, T=7 days, r=0.065, sigma=0.18"""
        payload = {"S": 52000, "K": 52000, "T_days": 7, "r": 0.065, "sigma": 0.18, "dividend_yield": 0.0}
        resp = requests.post(f"{BASE_URL}/api/black-scholes/calculate", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["call_price"] > 0
        assert data["put_price"] > 0
        print(f"BS Calc BANKNIFTY: call={data['call_price']}, put={data['put_price']}")

    def test_bs_calculate_t_years_value(self):
        """T_years should be T_days/365"""
        payload = {"S": 24500, "K": 24500, "T_days": 7, "r": 0.065, "sigma": 0.14, "dividend_yield": 0.0}
        resp = requests.post(f"{BASE_URL}/api/black-scholes/calculate", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        expected_T = round(7 / 365.0, 6)
        assert abs(data["T_years"] - expected_T) < 0.0001, f"T_years mismatch: {data['T_years']} vs {expected_T}"
        print(f"T_years: {data['T_years']}")


class TestIVSolver:
    """IV Solver endpoint tests - POST /api/black-scholes/iv-solver"""

    def test_iv_solver_basic_call(self):
        """S=24500 K=24500 T=7 r=0.065 market_price=205.03 option_type=call should return ~14% IV"""
        payload = {
            "S": 24500, "K": 24500, "T_days": 7,
            "r": 0.065, "market_price": 205.03,
            "option_type": "call", "dividend_yield": 0
        }
        resp = requests.post(f"{BASE_URL}/api/black-scholes/iv-solver", json=payload)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "iv_pct" in data
        assert "converged" in data
        assert data["converged"] == True
        # IV should be approximately 14%
        assert 12.0 <= data["iv_pct"] <= 16.0, f"Expected IV ~14%, got {data['iv_pct']}%"
        print(f"IV Solver: iv_pct={data['iv_pct']}%, converged={data['converged']}")

    def test_iv_solver_returns_correct_fields(self):
        """Response should contain iv, iv_pct, converged, theoretical_price, market_price, d1, d2, vega"""
        payload = {
            "S": 24500, "K": 24500, "T_days": 7,
            "r": 0.065, "market_price": 205.03,
            "option_type": "call", "dividend_yield": 0
        }
        resp = requests.post(f"{BASE_URL}/api/black-scholes/iv-solver", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        for field in ["iv", "iv_pct", "converged", "theoretical_price", "market_price", "d1", "d2", "vega"]:
            assert field in data, f"Missing field: {field}"
        assert data["market_price"] == 205.03
        print(f"IV fields verified: {list(data.keys())}")

    def test_iv_solver_theoretical_matches_market(self):
        """theoretical_price at solved IV should be close to market_price"""
        payload = {
            "S": 24500, "K": 24500, "T_days": 7,
            "r": 0.065, "market_price": 205.03,
            "option_type": "call", "dividend_yield": 0
        }
        resp = requests.post(f"{BASE_URL}/api/black-scholes/iv-solver", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        diff = abs(data["theoretical_price"] - data["market_price"])
        assert diff < 1.0, f"Theoretical price {data['theoretical_price']} differs from market {data['market_price']} by {diff}"
        print(f"Theoretical price {data['theoretical_price']} ~= market {data['market_price']}")

    def test_iv_solver_put_option(self):
        """IV solver should work for put option type too"""
        payload = {
            "S": 24500, "K": 24500, "T_days": 7,
            "r": 0.065, "market_price": 200.0,
            "option_type": "put", "dividend_yield": 0
        }
        resp = requests.post(f"{BASE_URL}/api/black-scholes/iv-solver", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["option_type"] == "put"
        assert data["iv_pct"] > 0
        assert data["converged"] == True
        print(f"Put IV Solver: iv_pct={data['iv_pct']}%, converged={data['converged']}")

    def test_iv_solver_zero_market_price_returns_400(self):
        """Market price = 0 should return 400"""
        payload = {
            "S": 24500, "K": 24500, "T_days": 7,
            "r": 0.065, "market_price": 0,
            "option_type": "call", "dividend_yield": 0
        }
        resp = requests.post(f"{BASE_URL}/api/black-scholes/iv-solver", json=payload)
        assert resp.status_code == 400, f"Expected 400 for zero market price, got {resp.status_code}"
        print(f"Zero market price correctly rejected: {resp.status_code}")

    def test_iv_solver_zero_days_returns_400(self):
        """T_days = 0 should return 400"""
        payload = {
            "S": 24500, "K": 24500, "T_days": 0,
            "r": 0.065, "market_price": 205.0,
            "option_type": "call", "dividend_yield": 0
        }
        resp = requests.post(f"{BASE_URL}/api/black-scholes/iv-solver", json=payload)
        assert resp.status_code == 400, f"Expected 400 for zero days, got {resp.status_code}"
        print(f"Zero T_days correctly rejected: {resp.status_code}")
