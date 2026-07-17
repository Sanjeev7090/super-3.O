import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { X, TrendUp, TrendDown, Minus, ArrowClockwise, Gauge, Globe, ChartLine, Timer, Warning } from '@phosphor-icons/react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmt = (v, dec = 2) => (v == null ? '—' : Number(v).toFixed(dec));
const fmtPct = (v) => {
  if (v == null) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${Number(v).toFixed(2)}%`;
};

const chgColor = (v) =>
  v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-zinc-400';

const ROWS = [
  { label: 'Strong Bullish', brent: '< $82',  vix: '< 14', regulatory: 'Positive', gift: 'Green',        move: '+300 to +600 pts', prob: 'High',        action: 'Aggressive Long (Energy + Banking)', color: '#22c55e', bg: 'rgba(34,197,94,0.08)' },
  { label: 'Mild Bullish',   brent: '$80-83', vix: '13-15', regulatory: 'Neutral',  gift: 'Mild Green',  move: '+150 to +350 pts', prob: 'Medium-High', action: 'Selective Long',                       color: '#86efac', bg: 'rgba(134,239,172,0.08)' },
  { label: 'Neutral',        brent: '$82-85', vix: '14-16', regulatory: 'Neutral',  gift: 'Flat',        move: '-150 to +150 pts', prob: 'High',        action: 'Range trading, small positions',        color: '#94a3b8', bg: 'rgba(148,163,184,0.06)' },
  { label: 'Mild Bearish',   brent: '$85+',   vix: '15+',  regulatory: 'Neutral',  gift: 'Red/Mild Red',move: '-150 to -350 pts', prob: 'High',        action: 'Selective Energy Long, Profit booking', color: '#fca5a5', bg: 'rgba(252,165,165,0.08)' },
  { label: 'Strong Bearish', brent: '$87+',   vix: '16+',  regulatory: 'Negative', gift: 'Strong Red',  move: '-400 to -800 pts', prob: 'Medium',      action: 'Hedging, Cash increase',                color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
];

function GiftBadge({ premium }) {
  if (premium == null) return <span className="text-zinc-400">—</span>;
  const sign = premium >= 0 ? '+' : '';
  const color = premium > 30 ? '#22c55e' : premium > -30 ? '#94a3b8' : '#ef4444';
  return (
    <span style={{ color }} className="font-mono font-semibold text-xs">
      {sign}{fmt(premium, 0)} pts
    </span>
  );
}

function RegBadge({ sentiment }) {
  const map = {
    Positive: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
    Neutral:  { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
    Negative: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  };
  const { color, bg } = map[sentiment] || map.Neutral;
  return (
    <span style={{ color, backgroundColor: bg }} className="px-1.5 py-0.5 rounded text-[10px] font-bold">
      {sentiment || 'Neutral'}
    </span>
  );
}

function ScoreBar({ label, score, max = 2.5 }) {
  const norm  = Math.max(0, (score + Math.abs(max)) / (2 * Math.abs(max)));
  const color = score > 0.3 ? '#22c55e' : score < -0.3 ? '#ef4444' : '#94a3b8';
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="text-zinc-400 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1 bg-zinc-700 rounded overflow-hidden">
        <div style={{ width: `${norm * 100}%`, backgroundColor: color }} className="h-full rounded" />
      </div>
      <span style={{ color }} className="font-mono w-8 text-right">{score > 0 ? '+' : ''}{score}</span>
    </div>
  );
}

const MarketIntelPanel = ({ onClose }) => {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [ts,      setTs]      = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: d } = await axios.get(`${API}/market-intel`);
      setData(d);
      setTs(new Date());
    } catch (e) {
      setError('Failed to load market intelligence data');
    } finally {
      setLoading(false);
    }
  }, []);

  const [brentTf, setBrentTf] = useState('D');
  const [vixTf,   setVixTf]   = useState('D');

  useEffect(() => { load(); }, [load]);

  const activeRow = data
    ? ROWS.findIndex(r => r.label === data.bias)
    : -1;

  // Timeframe-aware change % picker
  const brentChg = brentTf === 'W' ? data?.brent_chg_week
                 : brentTf === 'M' ? data?.brent_chg_month
                 : data?.brent_chg_pct;
  const vixChg   = vixTf === 'W' ? data?.vix_chg_week
                 : vixTf === 'M' ? data?.vix_chg_month
                 : data?.vix_chg_pct;

  const TfPill = ({ value, active, onClick }) => (
    <button
      onClick={onClick}
      className="px-1.5 py-0.5 rounded text-[9px] font-bold transition-all"
      style={{
        background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
        color:      active ? '#fff' : '#52525b',
        border:     active ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
      }}
    >
      {value}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-3"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="market-intel-panel"
    >
      <div
        className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl border border-white/10"
        style={{ background: '#0f1117', boxShadow: '0 0 60px rgba(0,0,0,0.8)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8 sticky top-0 z-10"
          style={{ background: '#0f1117' }}>
          <div className="flex items-center gap-2.5">
            <Globe size={18} weight="duotone" className="text-sky-400" />
            <span className="text-sm font-bold text-white tracking-wide">Market Intelligence</span>
            {ts && (
              <span className="text-[10px] text-zinc-500 ml-1">
                Updated {ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-zinc-400 hover:text-white border border-white/10 hover:border-white/20 transition-all"
              data-testid="market-intel-refresh"
            >
              <ArrowClockwise size={11} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-zinc-500 hover:text-white hover:bg-white/8 transition-all"
              data-testid="market-intel-close"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
        </div>

        {loading && !data && (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <ArrowClockwise size={28} className="text-sky-400 animate-spin" />
              <span className="text-xs text-zinc-400">Fetching live macro data...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="m-5 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs">
            {error}
          </div>
        )}

        {data && (
          <div className="p-5 space-y-5">

            {/* Live Data Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">

              {/* Brent Crude — with D/W/M toggle */}
              <div className="rounded-xl p-3 border border-white/8" style={{ background: '#181c27' }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 text-[9px] text-zinc-500">
                    <ChartLine size={12} />
                    <span className="uppercase tracking-widest">Brent Crude</span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {['D','W','M'].map(t => (
                      <TfPill key={t} value={t} active={brentTf === t} onClick={() => setBrentTf(t)} />
                    ))}
                  </div>
                </div>
                <div className="text-sm font-bold font-mono text-white">${fmt(data.brent)}</div>
                <div className={`text-[10px] mt-0.5 ${chgColor(brentChg)}`}>
                  {fmtPct(brentChg)} {brentTf === 'D' ? '(Day)' : brentTf === 'W' ? '(Week)' : '(Month)'}
                </div>
              </div>

              {/* India VIX — with D/W/M toggle */}
              <div className="rounded-xl p-3 border border-white/8" style={{ background: '#181c27' }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 text-[9px] text-zinc-500">
                    <Gauge size={12} />
                    <span className="uppercase tracking-widest">India VIX</span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {['D','W','M'].map(t => (
                      <TfPill key={t} value={t} active={vixTf === t} onClick={() => setVixTf(t)} />
                    ))}
                  </div>
                </div>
                <div className="text-sm font-bold font-mono text-white">{fmt(data.vix)}</div>
                <div className={`text-[10px] mt-0.5 ${chgColor(vixChg)}`}>
                  {fmtPct(vixChg)} {vixTf === 'D' ? '(Day)' : vixTf === 'W' ? '(Week)' : '(Month)'}
                </div>
              </div>

              {/* Remaining 4 cards */}
              {[
                { label: 'Nifty 50',   value: fmt(data.nifty, 0),      sub: fmtPct(data.nifty_chg_pct), subColor: chgColor(data.nifty_chg_pct), icon: <TrendUp size={14} /> },
                { label: 'GIFT Nifty', value: fmt(data.gift_nifty, 0), sub: `Premium: ${data.gift_premium > 0 ? '+' : ''}${fmt(data.gift_premium, 0)}`, subColor: data.gift_premium >= 0 ? 'text-emerald-400' : 'text-red-400', icon: <Globe size={14} /> },
                { label: 'Regulatory', value: data.regulatory,         sub: 'SEBI/NSE', subColor: 'text-zinc-500', icon: <Gauge size={14} />, valueColor: data.regulatory === 'Positive' ? '#22c55e' : data.regulatory === 'Negative' ? '#ef4444' : '#94a3b8' },
                { label: 'Bias',       value: data.bias,               sub: `Score: ${data.scores?.total}`, subColor: 'text-zinc-500', icon: <Gauge size={14} />, valueColor: data.bias_color },
              ].map(({ label, value, sub, subColor, icon, valueColor }) => (
                <div key={label} className="rounded-xl p-3 border border-white/8" style={{ background: '#181c27' }}>
                  <div className="flex items-center gap-1.5 text-[9px] text-zinc-500 mb-1.5">
                    {icon}
                    <span className="uppercase tracking-widest">{label}</span>
                  </div>
                  <div className="text-sm font-bold font-mono" style={{ color: valueColor || '#fff' }}>{value}</div>
                  <div className={`text-[10px] mt-0.5 ${subColor}`}>{sub}</div>
                </div>
              ))}
            </div>

            {/* Current Bias Card */}
            <div
              className="rounded-xl p-4 border"
              style={{ background: `${data.bias_color}10`, borderColor: `${data.bias_color}30` }}
              data-testid="market-intel-bias-card"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[9px] text-zinc-400 uppercase tracking-widest mb-1">Current Market Bias</div>
                  <div className="text-2xl font-black" style={{ color: data.bias_color }}>{data.bias}</div>
                  <div className="text-xs text-zinc-300 mt-1">{data.action}</div>
                </div>
                <div className="flex gap-4">
                  <div className="text-center">
                    <div className="text-[9px] text-zinc-500 uppercase tracking-widest">Expected Move (1-3 Days)</div>
                    <div className="text-base font-bold text-white font-mono mt-0.5">{data.move_label}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] text-zinc-500 uppercase tracking-widest">Probability</div>
                    <div className="text-base font-bold text-amber-400 mt-0.5">{data.probability}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Score Breakdown */}
            {data.scores && (
              <div className="rounded-xl p-4 border border-white/8" style={{ background: '#181c27' }}>
                <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-3">Factor Scores</div>
                <div className="space-y-2">
                  <ScoreBar label="Brent"      score={data.scores.brent} />
                  <ScoreBar label="India VIX"  score={data.scores.vix} />
                  <ScoreBar label="Regulatory" score={data.scores.regulatory} />
                  <ScoreBar label="GIFT Nifty" score={data.scores.gift} />
                  <div className="h-px bg-white/8 my-1" />
                  <ScoreBar label="Total" score={data.scores.total} max={6} />
                </div>
              </div>
            )}

            {/* VIX Percentile + Expiry Countdown row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              {/* India VIX 52-Week Percentile */}
              {data.vix_52w_high > 0 && (
                <div className="rounded-xl p-4 border border-white/8" style={{ background: '#181c27' }}
                  data-testid="vix-percentile-card">
                  <div className="flex items-center gap-2 mb-3">
                    <Gauge size={13} className="text-amber-400" />
                    <span className="text-[9px] text-zinc-400 uppercase tracking-widest">India VIX — 52-Week Percentile</span>
                  </div>
                  {/* Range bar */}
                  <div className="relative mb-2">
                    <div className="h-3 rounded-full overflow-hidden" style={{ background: 'linear-gradient(to right, #22c55e 0%, #eab308 40%, #f97316 70%, #ef4444 100%)' }}>
                      <div
                        className="absolute top-0 w-2 h-3 rounded-sm border-2 border-white shadow-lg"
                        style={{ left: `calc(${data.vix_percentile}% - 4px)`, background: data.vix_zone_color }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between text-[9px] text-zinc-600 mb-3">
                    <span>Low {fmt(data.vix_52w_low)}</span>
                    <span>High {fmt(data.vix_52w_high)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xl font-black font-mono" style={{ color: data.vix_zone_color }}>
                        {fmt(data.vix_percentile, 1)}%ile
                      </div>
                      <div className="text-[10px] mt-0.5" style={{ color: data.vix_zone_color }}>
                        {data.vix_zone}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] text-zinc-500">Current VIX</div>
                      <div className="text-base font-bold text-white font-mono">{fmt(data.vix)}</div>
                    </div>
                  </div>
                  {data.vix_percentile >= 75 && (
                    <div className="mt-2 flex items-center gap-1.5 text-[9px] text-red-400 bg-red-500/10 rounded px-2 py-1">
                      <Warning size={10} weight="fill" />
                      VIX at historical highs — expect high volatility
                    </div>
                  )}
                  {data.vix_percentile <= 20 && (
                    <div className="mt-2 flex items-center gap-1.5 text-[9px] text-emerald-400 bg-emerald-500/10 rounded px-2 py-1">
                      <Gauge size={10} weight="fill" />
                      VIX at historical lows — calm market conditions
                    </div>
                  )}
                </div>
              )}

              {/* Options Expiry Countdown */}
              {data.expiry && (
                <div className="rounded-xl p-4 border border-white/8" style={{ background: '#181c27' }}
                  data-testid="expiry-countdown-card">
                  <div className="flex items-center gap-2 mb-3">
                    <Timer size={13} className="text-violet-400" />
                    <span className="text-[9px] text-zinc-400 uppercase tracking-widest">Weekly Options Expiry</span>
                  </div>
                  <div className="space-y-3">
                    {Object.entries(data.expiry).map(([name, info]) => {
                      const urgent = info.days === 0;
                      const urgentColor = urgent ? '#f97316' : '#a78bfa';
                      return (
                        <div key={name} className="flex items-center justify-between"
                          data-testid={`expiry-${name.toLowerCase()}`}>
                          <div>
                            <div className="text-[9px] text-zinc-500 uppercase tracking-widest">{name} Weekly</div>
                            <div className="text-[10px] text-zinc-400 mt-0.5">{info.expiry_date}</div>
                          </div>
                          <div className="text-right">
                            {urgent ? (
                              <div className="text-xs font-bold text-orange-400 animate-pulse">
                                TODAY — {info.hours}h {info.minutes}m
                              </div>
                            ) : (
                              <div className="font-mono text-sm font-bold" style={{ color: urgentColor }}>
                                {info.days}d {info.hours}h {info.minutes}m
                              </div>
                            )}
                            <div className="text-[9px] text-zinc-600 mt-0.5">to expiry</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/5 text-[9px] text-zinc-600">
                    NIFTY: every Thursday · BANKNIFTY: every Wednesday · 3:30 PM IST
                  </div>
                </div>
              )}
            </div>

            {/* Decision Matrix Table */}
            <div className="rounded-xl overflow-hidden border border-white/8">
              <div className="px-4 py-2.5 border-b border-white/8" style={{ background: '#181c27' }}>
                <span className="text-[9px] text-zinc-400 uppercase tracking-widest">Decision Matrix</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-white/8" style={{ background: '#12151f' }}>
                      {['Bias', 'Brent Level', 'VIX', 'Regulatory', 'GIFT Nifty', 'Expected Move (1-3D)', 'Probability', 'Example Action'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-zinc-500 font-semibold uppercase tracking-widest whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ROWS.map((row, i) => {
                      const isActive = i === activeRow;
                      return (
                        <tr
                          key={row.label}
                          data-testid={`matrix-row-${row.label.toLowerCase().replace(/ /g,'-')}`}
                          style={{
                            background: isActive ? row.bg : 'transparent',
                            borderLeft: isActive ? `3px solid ${row.color}` : '3px solid transparent',
                          }}
                          className="border-b border-white/5 transition-colors"
                        >
                          <td className="px-3 py-2.5 font-bold whitespace-nowrap" style={{ color: row.color }}>
                            {isActive && <span className="mr-1">▶</span>}{row.label}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-zinc-200">{row.brent}</td>
                          <td className="px-3 py-2.5 font-mono text-zinc-200">{row.vix}</td>
                          <td className="px-3 py-2.5">
                            <RegBadge sentiment={row.regulatory} />
                          </td>
                          <td className="px-3 py-2.5 text-zinc-200">{row.gift}</td>
                          <td className="px-3 py-2.5 font-mono font-semibold text-zinc-100 whitespace-nowrap">{row.move}</td>
                          <td className="px-3 py-2.5">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              row.prob === 'High' ? 'bg-emerald-500/15 text-emerald-400' :
                              row.prob === 'Medium-High' ? 'bg-sky-500/15 text-sky-400' :
                              'bg-amber-500/15 text-amber-400'
                            }`}>{row.prob}</span>
                          </td>
                          <td className="px-3 py-2.5 text-zinc-300 whitespace-nowrap">{row.action}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer disclaimer */}
            <p className="text-[9px] text-zinc-600 text-center">
              Data: Brent Crude (ICE Futures via Yahoo Finance) · India VIX (NSE) · Regulatory (SEBI/NSE RSS) · GIFT Nifty (NSE IFSC / estimated) · For informational purposes only. Not investment advice.
            </p>

          </div>
        )}
      </div>
    </div>
  );
};

export default MarketIntelPanel;
