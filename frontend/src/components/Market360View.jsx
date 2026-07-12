import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TIMEFRAMES = ['1D', '5D', '1M', '3M', '6M', '1Y', '5Y', 'YTD'];

/**
 * Market360View
 * Multi-index Advance/Decline snapshot across NIFTY family with timeframe selector.
 * Mirrors the Moneycontrol "360 degree market view" pattern.
 */
export default function Market360View() {
  const [tf, setTf] = useState('1D');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const fetchData = useCallback(async (tframe) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await axios.get(`${API}/moneycontrol/market-360?timeframe=${tframe}`, { timeout: 30000 });
      if (res.data?.error) setErr(res.data.error);
      setData(res.data);
    } catch (e) {
      setErr(e?.message || 'Failed to fetch market view');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(tf); }, [tf, fetchData]);

  const indices = data?.indices || [];

  return (
    <div className="flex flex-col h-full" data-testid="market-360">
      {/* Timeframe selector */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/40 overflow-x-auto">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mr-2 shrink-0">
          Timeframe
        </span>
        {TIMEFRAMES.map(t => (
          <button
            key={t}
            onClick={() => setTf(t)}
            className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all shrink-0 ${
              tf === t
                ? 'bg-slate-900 dark:bg-white/20 text-white'
                : 'text-zinc-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10'
            }`}
            data-testid={`market-360-tf-${t}`}
          >
            {t}
          </button>
        ))}
        {loading && (
          <span className="ml-3 text-[10px] text-zinc-500 shrink-0 animate-pulse">Loading…</span>
        )}
      </div>

      {/* Index rows */}
      <div className="flex-1 overflow-y-auto">
        {err && (
          <div className="p-6 text-center text-xs text-rose-500">
            Error: {err}
          </div>
        )}
        {!err && !loading && indices.length === 0 && (
          <div className="p-6 text-center text-xs text-zinc-500">No data.</div>
        )}
        {indices.map((idx) => {
          const total = Math.max(1, idx.advances + idx.declines + idx.unchanged);
          const advPct = (idx.advances / total) * 100;
          const decPct = (idx.declines / total) * 100;
          const uncPct = (idx.unchanged / total) * 100;
          const dominant = idx.dominant;

          return (
            <div
              key={idx.name}
              className="px-4 py-3 border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              data-testid={`market-360-row-${idx.name}`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800 dark:text-white">{idx.name}</span>
                  <span
                    className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${
                      dominant === 'bullish'
                        ? 'bg-emerald-500/15 text-emerald-500'
                        : dominant === 'bearish'
                        ? 'bg-rose-500/15 text-rose-500'
                        : 'bg-amber-500/15 text-amber-500'
                    }`}
                  >
                    {dominant}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-zinc-500">
                  {idx.total}/{idx.coverage} stocks
                </span>
              </div>

              {/* A/D horizontal bar (green | grey | red) */}
              <div className="relative">
                <div className="flex h-4 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                    style={{ width: `${advPct}%` }}
                    title={`${idx.advances} advancing`}
                  />
                  <div
                    className="h-full bg-zinc-400 dark:bg-zinc-600 transition-all duration-500"
                    style={{ width: `${uncPct}%` }}
                    title={`${idx.unchanged} unchanged`}
                  />
                  <div
                    className="h-full bg-gradient-to-l from-rose-500 to-rose-400 transition-all duration-500"
                    style={{ width: `${decPct}%` }}
                    title={`${idx.declines} declining`}
                  />
                </div>
                {/* Numbers overlaid at each side */}
                <div className="flex justify-between mt-1 text-[10px] font-bold font-mono">
                  <span className="text-emerald-500">{idx.advances}</span>
                  {idx.unchanged > 0 && (
                    <span className="text-zinc-500">{idx.unchanged} flat</span>
                  )}
                  <span className="text-rose-500">{idx.declines}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/60 text-[9px] font-mono text-zinc-500 flex items-center justify-between">
        <span>Source: {data?.source || 'yfinance'} · cached 5m</span>
        <span>{data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : ''}</span>
      </div>
    </div>
  );
}
