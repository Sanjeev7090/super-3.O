import React, { useEffect, useState, useMemo } from 'react';
import { X } from '@phosphor-icons/react';

/**
 * Nifty50LiveModal
 * Displays all NIFTY 50 constituent stocks with live LTP / change / change%.
 * Sortable columns, filter box, auto-refresh via parent's onRefresh.
 */
export default function Nifty50LiveModal({ data, onClose, onRefresh }) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState('change_pct');
  const [sortDir, setSortDir] = useState('desc');
  const [tab, setTab] = useState('all'); // all | advances | declines
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const stocks = data?.stocks || [];
  const idx = data?.index_data || {};

  const filtered = useMemo(() => {
    let out = stocks;
    if (tab === 'advances') out = out.filter(s => s.change_pct > 0);
    if (tab === 'declines') out = out.filter(s => s.change_pct < 0);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter(s =>
        s.symbol.toLowerCase().includes(q) ||
        (s.name && s.name.toLowerCase().includes(q))
      );
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...out].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'string') return av.localeCompare(bv) * dir;
      return ((av ?? 0) - (bv ?? 0)) * dir;
    });
  }, [stocks, query, sortKey, sortDir, tab]);

  const handleSort = (k) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('desc'); }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await onRefresh?.(); } finally { setRefreshing(false); }
  };

  const idxPos = (idx.change ?? 0) >= 0;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      data-testid="nifty50-modal"
    >
      <div
        className="w-full max-w-5xl max-h-[90vh] bg-white dark:bg-[#0C0C0C] border border-slate-200 dark:border-white/10 rounded-lg shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/60">
          <div className="flex items-center gap-3">
            <span className="text-2xl leading-none">
              {data?.dominant === 'bullish' ? '🐂' : data?.dominant === 'bearish' ? '🐻' : '⚖️'}
            </span>
            <div>
              <div className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-white">
                NIFTY 50 · Live A/D
              </div>
              <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                <span className="text-emerald-500 font-bold">{data?.advances}</span> up ·{' '}
                <span className="text-rose-500 font-bold">{data?.declines}</span> down ·{' '}
                <span className="text-zinc-400">{data?.unchanged}</span> flat · total {data?.total}
              </div>
            </div>
            {idx.value != null && (
              <div className="ml-4 pl-4 border-l border-slate-200 dark:border-white/10">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Index</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm font-mono font-bold text-slate-800 dark:text-white">
                    {idx.value?.toLocaleString?.() ?? idx.value}
                  </span>
                  <span className={`text-xs font-mono font-bold ${idxPos ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {idxPos ? '▲' : '▼'} {Math.abs(idx.change ?? 0).toFixed(2)} ({Math.abs(idx.change_pct ?? 0).toFixed(2)}%)
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded border border-slate-200 dark:border-white/10 text-zinc-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
              data-testid="nifty50-refresh"
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded border border-slate-200 dark:border-white/10 text-zinc-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
              data-testid="nifty50-close"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0A0A]">
          <div className="flex items-center gap-1 border border-slate-200 dark:border-white/10 rounded overflow-hidden">
            {[
              { k: 'all',       label: `All (${stocks.length})`,     cls: 'text-slate-700 dark:text-zinc-200' },
              { k: 'advances',  label: `▲ ${data?.advances}`,        cls: 'text-emerald-500' },
              { k: 'declines',  label: `▼ ${data?.declines}`,        cls: 'text-rose-500' },
            ].map(t => (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  tab === t.k ? 'bg-slate-900 dark:bg-white/10 text-white' : `hover:bg-slate-100 dark:hover:bg-white/5 ${t.cls}`
                }`}
                data-testid={`nifty50-tab-${t.k}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbol / name…"
            className="flex-1 min-w-[180px] px-3 py-1 text-xs font-mono bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white rounded focus:outline-none focus:border-emerald-500/60"
            data-testid="nifty50-search"
          />
          <span className="text-[10px] text-zinc-500 font-mono">
            {filtered.length} shown
          </span>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs font-mono border-collapse">
            <thead className="sticky top-0 bg-white dark:bg-[#0A0A0A] border-b border-slate-200 dark:border-white/10 z-10">
              <tr className="text-[10px] uppercase tracking-widest text-zinc-500">
                {[
                  { k: 'symbol',     label: 'Symbol',   align: 'left'  },
                  { k: 'name',       label: 'Name',     align: 'left'  },
                  { k: 'ltp',        label: 'LTP',      align: 'right' },
                  { k: 'change',     label: 'Δ',        align: 'right' },
                  { k: 'change_pct', label: 'Δ %',      align: 'right' },
                  { k: 'volume',     label: 'Volume',   align: 'right' },
                ].map(c => (
                  <th
                    key={c.k}
                    onClick={() => handleSort(c.k)}
                    className={`px-3 py-2 cursor-pointer select-none font-bold text-${c.align} hover:text-slate-800 dark:hover:text-white transition-colors`}
                  >
                    {c.label}
                    {sortKey === c.k && (
                      <span className="ml-1 text-emerald-500">{sortDir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const pos = s.change_pct >= 0;
                return (
                  <tr
                    key={s.symbol}
                    className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                    data-testid={`nifty50-row-${s.symbol}`}
                  >
                    <td className="px-3 py-2 font-bold text-slate-800 dark:text-white">{s.symbol}</td>
                    <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400 max-w-[220px] truncate">{s.name}</td>
                    <td className="px-3 py-2 text-right text-slate-800 dark:text-white">{s.ltp?.toFixed(2)}</td>
                    <td className={`px-3 py-2 text-right font-bold ${pos ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {pos ? '+' : ''}{s.change?.toFixed(2)}
                    </td>
                    <td className={`px-3 py-2 text-right font-bold ${pos ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {pos ? '+' : ''}{s.change_pct?.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-500">
                      {s.volume ? s.volume.toLocaleString() : '—'}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                    No stocks match the filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/60 text-[9px] font-mono text-zinc-500 flex items-center justify-between">
          <span>Source: {data?.source || 'yfinance'} · cached 60s</span>
          <span>Updated {data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : ''}</span>
        </div>
      </div>
    </div>
  );
}
