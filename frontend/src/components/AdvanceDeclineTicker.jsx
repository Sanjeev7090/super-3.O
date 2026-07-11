import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import Nifty50LiveModal from './Nifty50LiveModal';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * AdvanceDeclineTicker
 * - Fetches NIFTY 50 A/D live (60s cache backend-side)
 * - Shows a slim animated ticker at the top: 🐂 running when bullish, 🐻 when bearish
 * - Click anywhere on the ticker → opens Nifty50LiveModal with live per-stock data
 */
export default function AdvanceDeclineTicker() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAD = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/moneycontrol/advance-decline`, { timeout: 20000 });
      setData(res.data);
    } catch (err) {
      // silent — the ticker just stays on last known state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAD();
    const id = setInterval(fetchAD, 60_000); // refresh every 60s
    return () => clearInterval(id);
  }, [fetchAD]);

  if (loading && !data) {
    return (
      <div
        className="h-8 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/40 flex items-center px-3 text-[10px] font-mono text-zinc-500"
        data-testid="ad-ticker-loading"
      >
        Loading NIFTY 50 Advance/Decline…
      </div>
    );
  }
  if (!data) return null;

  const { advances = 0, declines = 0, unchanged = 0, dominant = 'neutral', index_data, stocks = [] } = data;
  const bullish = dominant === 'bullish';
  const bearish = dominant === 'bearish';

  // Emoji + color scheme based on dominant sentiment
  const animal = bullish ? '🐂' : bearish ? '🐻' : '⚖️';
  const accent = bullish ? '#00E676' : bearish ? '#FF3B30' : '#F5A623';
  const bgTint = bullish ? 'rgba(0,230,118,0.06)' : bearish ? 'rgba(255,59,48,0.06)' : 'rgba(245,166,35,0.06)';

  // Build the marquee content — a repeating strip of top gainers/losers symbols
  const topGainers = stocks.filter(s => s.change_pct > 0).slice(0, 8);
  const topLosers  = stocks.filter(s => s.change_pct < 0).slice(-8).reverse();

  const idx = index_data || {};
  const idxPos = (idx.change ?? 0) >= 0;

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        className="relative h-9 border-b border-slate-200 dark:border-white/10 flex items-center overflow-hidden cursor-pointer group select-none"
        style={{ background: bgTint }}
        data-testid="ad-ticker"
        title="Click to view live NIFTY 50 stocks"
      >
        {/* Left pill: A/D counts + animal */}
        <div
          className="shrink-0 flex items-center gap-2 pl-3 pr-4 h-full border-r border-slate-200 dark:border-white/10 z-10"
          style={{ background: bgTint }}
        >
          <span
            className={`text-lg leading-none inline-block ${bullish ? 'ad-run-right' : bearish ? 'ad-run-left' : ''}`}
            style={{ filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.4))' }}
            aria-label={dominant}
          >
            {animal}
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-400 font-semibold">
              NIFTY 50 A/D
            </span>
            <span className="text-[11px] font-bold font-mono flex items-center gap-1.5">
              <span className="text-emerald-500">{advances}</span>
              <span className="text-zinc-500">·</span>
              <span className="text-rose-500">{declines}</span>
              {unchanged > 0 && (
                <>
                  <span className="text-zinc-500">·</span>
                  <span className="text-zinc-400">{unchanged}</span>
                </>
              )}
            </span>
          </div>
          {/* A/D visual bar */}
          <div className="hidden sm:flex w-24 h-1.5 bg-zinc-800/40 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${(advances / Math.max(1, advances + declines + unchanged)) * 100}%` }}
            />
            <div
              className="h-full bg-rose-500"
              style={{ width: `${(declines / Math.max(1, advances + declines + unchanged)) * 100}%` }}
            />
          </div>
        </div>

        {/* Middle: NIFTY 50 index snapshot */}
        {idx.value != null && (
          <div className="shrink-0 flex items-center gap-2 px-3 border-r border-slate-200 dark:border-white/10 h-full">
            <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-semibold">NIFTY 50</span>
            <span className="text-[11px] font-bold font-mono text-slate-800 dark:text-white">
              {idx.value?.toLocaleString?.() ?? idx.value}
            </span>
            <span className={`text-[10px] font-bold font-mono ${idxPos ? 'text-emerald-500' : 'text-rose-500'}`}>
              {idxPos ? '▲' : '▼'} {Math.abs(idx.change ?? 0).toFixed(2)} ({Math.abs(idx.change_pct ?? 0).toFixed(2)}%)
            </span>
          </div>
        )}

        {/* Right: running marquee of top gainers/losers */}
        <div className="relative flex-1 h-full overflow-hidden">
          <div className="ad-marquee absolute inset-y-0 left-0 flex items-center gap-6 whitespace-nowrap pr-6">
            {[...topGainers, ...topLosers, ...topGainers, ...topLosers].map((s, i) => (
              <span key={`${s.symbol}-${i}`} className="flex items-center gap-1 text-[11px] font-mono">
                <span className="text-slate-700 dark:text-zinc-200 font-bold">{s.symbol}</span>
                <span
                  className={`font-bold ${s.change_pct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}
                >
                  {s.change_pct >= 0 ? '+' : ''}{s.change_pct.toFixed(2)}%
                </span>
              </span>
            ))}
          </div>
          {/* Fade edges for readability */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white dark:from-[#0A0A0A] to-transparent" />
        </div>

        {/* Right hint */}
        <div className="shrink-0 pr-3 pl-2 text-[9px] font-bold tracking-widest uppercase text-zinc-400 hidden sm:block group-hover:text-slate-600 dark:group-hover:text-zinc-200 transition-colors">
          Click → Live 50 ▸
        </div>

        {/* Accent stripe at bottom */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: accent, opacity: 0.55 }} />
      </div>

      {/* Local styles for animation */}
      <style>{`
        @keyframes ad-marquee-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ad-marquee { animation: ad-marquee-scroll 40s linear infinite; }
        .ad-marquee:hover { animation-play-state: paused; }

        @keyframes ad-run-r {
          0%   { transform: translateX(-4px) scale(1);   }
          50%  { transform: translateX(4px)  scale(1.08);}
          100% { transform: translateX(-4px) scale(1);   }
        }
        @keyframes ad-run-l {
          0%   { transform: translateX(4px)  scaleX(-1); }
          50%  { transform: translateX(-4px) scale(-1.08, 1.08); }
          100% { transform: translateX(4px)  scaleX(-1); }
        }
        .ad-run-right { animation: ad-run-r 1.2s ease-in-out infinite; display:inline-block; }
        .ad-run-left  { animation: ad-run-l 1.2s ease-in-out infinite; display:inline-block; }
      `}</style>

      {open && (
        <Nifty50LiveModal
          data={data}
          onClose={() => setOpen(false)}
          onRefresh={fetchAD}
        />
      )}
    </>
  );
}
