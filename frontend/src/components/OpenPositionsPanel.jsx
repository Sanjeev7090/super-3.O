import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Right Panel — "Positions" tab.
 * Merges Robo (auto-trader) open positions + manual Paper Trading positions
 * into one unified live table with color-coded P&L.
 */
const OpenPositionsPanel = () => {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);

  const fetchAll = async () => {
    try {
      const [roboRes, paperRes] = await Promise.allSettled([
        axios.get(`${API}/robo/positions`),
        axios.get(`${API}/paper-trade/positions`),
      ]);

      const merged = [];

      if (roboRes.status === 'fulfilled') {
        const roboPos = roboRes.value.data?.open_positions || [];
        roboPos.forEach((p) => merged.push({
          id: `robo-${p.order_id || p.ticker}`,
          source: 'ROBO',
          ticker: p.ticker,
          direction: p.direction || 'BUY',
          quantity: p.quantity || 0,
          entry_price: p.entry_price || 0,
          current_price: p.current_price ?? p.entry_price ?? 0,
          pnl: p.unrealized_pnl ?? 0,
          pnl_pct: p.pnl_pct ?? 0,
        }));
      }

      if (paperRes.status === 'fulfilled') {
        const paperPos = paperRes.value.data?.positions || [];
        paperPos.forEach((p) => merged.push({
          id: `paper-${p.trade_id || p.symbol}`,
          source: 'PAPER',
          ticker: p.symbol,
          direction: p.direction || 'BUY',
          quantity: p.quantity || 0,
          entry_price: p.entry_price || 0,
          current_price: p.current_price ?? p.entry_price ?? 0,
          pnl: p.pnl ?? 0,
          pnl_pct: p.pnl_pct ?? 0,
        }));
      }

      setPositions(merged);
    } catch {
      /* silent — keep stale data */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    pollRef.current = setInterval(fetchAll, 8000);
    return () => clearInterval(pollRef.current);
  }, []);

  const totalPnl = positions.reduce((sum, p) => sum + (p.pnl || 0), 0);

  if (loading && positions.length === 0) {
    return (
      <div className="p-4 space-y-2" data-testid="positions-loading">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-md bg-white/[0.04] animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="open-positions-panel">
      {/* Summary strip */}
      <div className="px-3 py-2.5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-500">
          {positions.length} Open Position{positions.length !== 1 ? 's' : ''}
        </span>
        <span
          className={`text-sm font-black font-mono tabular-nums ${totalPnl >= 0 ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}
          data-testid="positions-total-pnl"
        >
          {totalPnl >= 0 ? '+' : ''}₹{totalPnl.toFixed(2)}
        </span>
      </div>

      {positions.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-zinc-500 text-xs text-center">
            No open positions yet.<br />Start a Paper Trade or Robo-Trader to see live positions here.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-white/5">
          {positions.map((p) => {
            const isUp = p.pnl >= 0;
            return (
              <div key={p.id} className="p-3 hover:bg-white/[0.03] transition-colors" data-testid={`position-row-${p.id}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold font-mono text-white truncate max-w-[110px]">
                      {(p.ticker || '').replace('.NS', '').replace('.BO', '')}
                    </span>
                    <span
                      className={`text-[8px] font-bold uppercase px-1 py-0.5 rounded ${
                        p.direction === 'BUY' ? 'bg-[#34C759]/15 text-[#34C759]' : 'bg-[#FF3B30]/15 text-[#FF3B30]'
                      }`}
                    >
                      {p.direction}
                    </span>
                    <span className="text-[7px] font-bold uppercase px-1 py-0.5 rounded bg-[#007AFF]/15 text-[#007AFF] tracking-wider">
                      {p.source}
                    </span>
                  </div>
                  <span className={`text-xs font-black font-mono tabular-nums ${isUp ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>
                    {isUp ? '+' : ''}₹{p.pnl.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                  <span>Qty {p.quantity} @ ₹{p.entry_price.toFixed(2)}</span>
                  <span className={isUp ? 'text-[#34C759]/80' : 'text-[#FF3B30]/80'}>
                    ₹{p.current_price.toFixed(2)} ({isUp ? '+' : ''}{p.pnl_pct.toFixed(2)}%)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default OpenPositionsPanel;
