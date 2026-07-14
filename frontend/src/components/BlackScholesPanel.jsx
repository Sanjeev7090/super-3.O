import React, { useState, useCallback } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;

const PRESETS = [
  { label: 'NIFTY ATM', S: 24500, K: 24500, T_days: 7,  r: 0.065, sigma: 0.14 },
  { label: 'BANKNIFTY', S: 52000, K: 52000, T_days: 7,  r: 0.065, sigma: 0.18 },
  { label: 'RELIANCE',  S: 1400,  K: 1400,  T_days: 30, r: 0.065, sigma: 0.22 },
  { label: 'INFY',      S: 1600,  K: 1600,  T_days: 14, r: 0.065, sigma: 0.19 },
];

const GreekRow = ({ label, callVal, putVal, color }) => (
  <div className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
    <span className="text-[11px] font-bold text-zinc-400 w-12">{label}</span>
    <div className="flex gap-3">
      <span className={`text-[11px] font-mono font-bold ${color ?? 'text-emerald-400'}`}>{callVal}</span>
      <span className="text-[11px] text-zinc-600">/</span>
      <span className={`text-[11px] font-mono font-bold ${color ?? 'text-rose-400'}`}>{putVal}</span>
    </div>
  </div>
);

export default function BlackScholesPanel() {
  const [form, setForm] = useState({ S: 24500, K: 24500, T_days: 7, r: 0.065, sigma: 0.14, dividend_yield: 0.0 });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const calculate = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/black-scholes/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          S: +form.S, K: +form.K, T_days: +form.T_days,
          r: +form.r, sigma: +form.sigma, dividend_yield: +form.dividend_yield,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setResult(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [form]);

  const applyPreset = (p) => {
    setForm(f => ({ ...f, S: p.S, K: p.K, T_days: p.T_days, r: p.r, sigma: p.sigma }));
    setResult(null);
  };

  const callGreeks = result?.greeks?.call;
  const putGreeks  = result?.greeks?.put;

  return (
    <div className="p-4 space-y-4" data-testid="bs-calculator-panel">
      {/* Presets */}
      <div>
        <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Quick Presets</p>
        <div className="flex gap-1.5 flex-wrap">
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className="px-2.5 py-1 rounded text-[10px] font-bold border border-white/10 text-zinc-400 hover:text-white hover:border-amber-500/60 hover:bg-amber-500/10 transition-all"
              data-testid={`bs-preset-${p.label}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { key: 'S',              label: 'Spot Price (S)',      step: 50,    placeholder: '24500' },
          { key: 'K',              label: 'Strike Price (K)',    step: 50,    placeholder: '24500' },
          { key: 'T_days',         label: 'Days to Expiry',      step: 1,     placeholder: '7'     },
          { key: 'r',              label: 'Risk-Free Rate',      step: 0.001, placeholder: '0.065' },
          { key: 'sigma',          label: 'Volatility (IV)',     step: 0.01,  placeholder: '0.14'  },
          { key: 'dividend_yield', label: 'Dividend Yield',      step: 0.001, placeholder: '0.0'   },
        ].map(({ key, label, step, placeholder }) => (
          <div key={key}>
            <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 block mb-1">{label}</label>
            <input
              type="number"
              step={step}
              value={form[key]}
              onChange={e => set(key, e.target.value)}
              placeholder={placeholder}
              className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[12px] font-mono text-white focus:outline-none focus:border-amber-500/60 placeholder-zinc-600"
              data-testid={`bs-input-${key}`}
            />
          </div>
        ))}
      </div>

      {/* Calculate Button */}
      <button
        onClick={calculate}
        disabled={loading}
        className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-[12px] font-black uppercase tracking-wider transition-all"
        data-testid="bs-calculate-btn"
      >
        {loading ? 'Calculating...' : 'Calculate'}
      </button>

      {error && (
        <p className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded px-3 py-2">{error}</p>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-3 animate-in fade-in" data-testid="bs-result">
          {/* Call / Put Prices */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-center">
              <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 mb-1">CALL Price</p>
              <p className="text-xl font-black text-emerald-300" data-testid="bs-call-price">₹{result.call_price}</p>
            </div>
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-center">
              <p className="text-[9px] font-bold uppercase tracking-widest text-rose-400 mb-1">PUT Price</p>
              <p className="text-xl font-black text-rose-300" data-testid="bs-put-price">₹{result.put_price}</p>
            </div>
          </div>

          {/* d1 / d2 / T */}
          <div className="flex gap-2 text-center">
            {[
              { label: 'd1', val: result.d1 },
              { label: 'd2', val: result.d2 },
              { label: 'T (yrs)', val: result.T_years },
            ].map(({ label, val }) => (
              <div key={label} className="flex-1 bg-white/[0.03] border border-white/10 rounded px-2 py-1.5">
                <p className="text-[9px] text-zinc-500 font-bold uppercase">{label}</p>
                <p className="text-[11px] font-mono text-zinc-300">{val}</p>
              </div>
            ))}
          </div>

          {/* Greeks */}
          {callGreeks && (
            <div className="bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
                Greeks &nbsp;<span className="text-emerald-400">Call</span> / <span className="text-rose-400">Put</span>
              </p>
              <GreekRow label="Delta" callVal={callGreeks.Delta} putVal={putGreeks.Delta} />
              <GreekRow label="Gamma" callVal={callGreeks.Gamma} putVal={putGreeks.Gamma} color="text-blue-400" />
              <GreekRow label="Vega"  callVal={callGreeks.Vega}  putVal={putGreeks.Vega}  color="text-violet-400" />
              <GreekRow label="Theta" callVal={callGreeks.Theta} putVal={putGreeks.Theta} color="text-amber-400" />
              <GreekRow label="Rho"   callVal={callGreeks.Rho}   putVal={putGreeks.Rho}   color="text-cyan-400" />
            </div>
          )}

          {/* Put-Call Parity Note */}
          <p className="text-[9px] text-zinc-600 text-center">
            European option · Put-Call Parity: C − P = S·e^(−qT) − K·e^(−rT)
          </p>
        </div>
      )}
    </div>
  );
}
