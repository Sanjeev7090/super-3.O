import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import Nifty50LiveModal from './Nifty50LiveModal';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * AdvanceDeclineTicker
 * - Fetches NIFTY 50 A/D live (60s cache backend-side)
 * - Shows a slim animated ticker at the top: 🐂 running when bullish, 🐻 when bearish
 * - Full-screen 3D bull/bear runs randomly every 2 minutes
 * - Click anywhere on the ticker → opens Nifty50LiveModal with live per-stock data
 */
export default function AdvanceDeclineTicker() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  // Full-screen run state
  const [run, setRun] = useState(null);
  const runRef = useRef(null);

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

  // ─── Full-screen 3D bull/bear run — randomised every 2 minutes ───
  const triggerRun = useCallback((sentimentOverride) => {
    const dominant = sentimentOverride || data?.dominant || 'neutral';
    const isBull = dominant === 'bullish';
    const isBear = dominant === 'bearish';
    // Randomly pick which animal — heavily biased by dominant sentiment
    const rand = Math.random();
    let animal;
    if (isBull) animal = rand < 0.85 ? '🐂' : '🐻';
    else if (isBear) animal = rand < 0.85 ? '🐻' : '🐂';
    else animal = rand < 0.5 ? '🐂' : '🐻';

    // Direction: bull tends L→R, bear tends R→L (but not always)
    const rtl = animal === '🐻' ? Math.random() < 0.75 : Math.random() < 0.25;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const startX = rtl ? W + 260 : -260;
    const endX   = rtl ? -260 : W + 260;
    // Random vertical band (top 15% – bottom 75%)
    const startY = H * (0.15 + Math.random() * 0.6);
    const endY   = H * (0.15 + Math.random() * 0.6);
    // Random 3D roll + slight tilt
    const rotZ   = (Math.random() - 0.5) * 18;
    const scale  = 0.9 + Math.random() * 0.4;    // 0.9 – 1.3
    const duration = 3800 + Math.random() * 1600; // 3.8 – 5.4s

    setRun({ animal, startX, endX, startY, endY, rotZ, scale, rtl, duration, key: Date.now() });
  }, [data]);

  useEffect(() => {
    if (!data) return;
    // First run 6s after data loads so the user sees it soon
    const t1 = setTimeout(() => triggerRun(), 6000);
    // Repeat every 2 minutes
    const t2 = setInterval(() => triggerRun(), 120_000);
    return () => { clearTimeout(t1); clearInterval(t2); };
  }, [data, triggerRun]);

  // Drive the WAAPI animation whenever a new `run` config appears
  useEffect(() => {
    if (!run || !runRef.current) return;
    const el = runRef.current;
    const flip = run.rtl ? -1 : 1; // face left when running right-to-left
    const midX = (run.startX + run.endX) / 2;
    const midY = Math.min(run.startY, run.endY) - 60;
    const kf = [
      {
        transform: `translate3d(${run.startX}px, ${run.startY}px, 0) rotateZ(0deg) scale(${run.scale * 0.85}, ${run.scale * 0.85}) scaleX(${flip})`,
        opacity: 0,
      },
      {
        transform: `translate3d(${midX}px, ${midY}px, 0) rotateZ(${run.rotZ}deg) scale(${run.scale * 1.1}, ${run.scale * 1.1}) scaleX(${flip * 1.1})`,
        opacity: 1,
        offset: 0.5,
      },
      {
        transform: `translate3d(${run.endX}px, ${run.endY}px, 0) rotateZ(0deg) scale(${run.scale * 0.85}, ${run.scale * 0.85}) scaleX(${flip})`,
        opacity: 0,
      },
    ];
    const anim = el.animate(kf, {
      duration: run.duration,
      easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      fill: 'forwards',
    });
    anim.onfinish = () => setRun(null);
    return () => { try { anim.cancel(); } catch (e) { /* ignore */ } };
  }, [run]);

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
            className={`ad-3d-emoji inline-block ${bullish ? 'ad-run-right' : bearish ? 'ad-run-left' : ''}`}
            aria-label={dominant}
            onClick={(e) => { e.stopPropagation(); triggerRun(); }}
            title="Click to launch full-screen run"
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

        /* 3D emoji in ticker — multi-layer drop-shadows fake depth */
        .ad-3d-emoji {
          font-size: 22px;
          line-height: 1;
          transform: perspective(120px) rotateY(-8deg) rotateX(3deg);
          filter:
            drop-shadow(0 3px 3px rgba(0,0,0,0.45))
            drop-shadow(0 1px 0 rgba(255,255,255,0.35))
            drop-shadow(2px 4px 6px rgba(0,0,0,0.35));
          transition: transform 0.2s ease;
          cursor: pointer;
        }
        .ad-3d-emoji:hover { transform: perspective(120px) rotateY(-14deg) rotateX(6deg) scale(1.18); }

        @keyframes ad-run-r {
          0%   { transform: perspective(120px) rotateY(-8deg) rotateX(3deg) translateX(-3px) scale(1);   }
          50%  { transform: perspective(120px) rotateY(-8deg) rotateX(3deg) translateX(3px)  scale(1.08); }
          100% { transform: perspective(120px) rotateY(-8deg) rotateX(3deg) translateX(-3px) scale(1);   }
        }
        @keyframes ad-run-l {
          0%   { transform: perspective(120px) rotateY(8deg)  rotateX(3deg) translateX(3px)  scaleX(-1); }
          50%  { transform: perspective(120px) rotateY(8deg)  rotateX(3deg) translateX(-3px) scale(-1.08, 1.08); }
          100% { transform: perspective(120px) rotateY(8deg)  rotateX(3deg) translateX(3px)  scaleX(-1); }
        }
        .ad-run-right { animation: ad-run-r 1.2s ease-in-out infinite; }
        .ad-run-left  { animation: ad-run-l 1.2s ease-in-out infinite; }

        /* Full-screen 3D bull / bear */
        .ad-fullscreen-3d {
          font-size: clamp(120px, 22vw, 260px);
          line-height: 1;
          position: absolute;
          top: 0; left: 0;
          transform-origin: center;
          transform-style: preserve-3d;
          will-change: transform, opacity;
          filter:
            drop-shadow(0 25px 40px rgba(0,0,0,0.65))
            drop-shadow(0 12px 18px rgba(0,0,0,0.5))
            drop-shadow(0 3px 0 rgba(255,255,255,0.25))
            drop-shadow(8px 16px 22px rgba(0,0,0,0.55));
        }
      `}</style>

      {/* Full-screen 3D run overlay — appears every 2 minutes */}
      {run && (
        <div
          className="fixed inset-0 pointer-events-none z-[9997]"
          style={{ perspective: '900px' }}
          data-testid="ad-fullscreen-run"
        >
          <div
            ref={runRef}
            key={run.key}
            className="ad-fullscreen-3d"
          >
            {run.animal}
          </div>
        </div>
      )}

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
