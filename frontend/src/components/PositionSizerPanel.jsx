import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { TrendingUp, Clock, Calculator, Zap, Calendar } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const IMPACT_COLOR = { HIGH: '#f59e0b', EXTREME: '#ef4444', MEDIUM: '#3b82f6', LOW: '#6b7280' };
const WINDOW_COLOR = {
  opening_drive:  '#10b981',
  mid_morning:    '#3b82f6',
  lunch:          '#6b7280',
  afternoon:      '#a1a1aa',
  closing_drive:  '#f59e0b',
  market_closed:  '#3f3f46',
};

function TierBadge({ tier }) {
  const colors = {
    NANO:       'text-zinc-400 bg-zinc-800',
    SMALL:      'text-sky-400 bg-sky-900/30',
    MODERATE:   'text-emerald-400 bg-emerald-900/30',
    AGGRESSIVE: 'text-amber-400 bg-amber-900/30',
    CAPPED:     'text-red-400 bg-red-900/30',
    INVALID:    'text-zinc-600 bg-zinc-900',
  };
  return (
    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${colors[tier] || colors.INVALID}`}>
      {tier}
    </span>
  );
}

export default function PositionSizerPanel() {
  const [timeWindow, setTimeWindow] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventMult, setEventMult] = useState(1.0);
  const [result, setResult] = useState(null);
  const [computing, setComputing] = useState(false);

  // Form state
  const [capital, setCapital] = useState('100000');
  const [price, setPrice] = useState('1000');
  const [winRate, setWinRate] = useState('55');
  const [avgWin, setAvgWin] = useState('2.0');
  const [avgLoss, setAvgLoss] = useState('1.0');
  const [atrPct, setAtrPct] = useState('1.5');

  const fetchTimeAndEvents = useCallback(async () => {
    try {
      const [tw, ev] = await Promise.all([
        axios.get(`${API}/time-window`),
        axios.get(`${API}/events/upcoming?days_ahead=5`),
      ]);
      setTimeWindow(tw.data);
      setEvents(ev.data.events || []);
      setEventMult(ev.data.event_score_multiplier ?? 1.0);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchTimeAndEvents();
    const iv = setInterval(fetchTimeAndEvents, 30000);
    return () => clearInterval(iv);
  }, [fetchTimeAndEvents]);

  const calculate = async () => {
    setComputing(true);
    try {
      const { data } = await axios.post(`${API}/position-sizer/calculate`, {
        capital:     parseFloat(capital),
        current_price: parseFloat(price),
        win_rate:    parseFloat(winRate) / 100,
        avg_win_pct: parseFloat(avgWin),
        avg_loss_pct: parseFloat(avgLoss),
        atr_pct:     parseFloat(atrPct),
        lot_size:    1,
        prop_safe_multiplier: eventMult,
      });
      setResult(data);
    } catch { /* ignore */ } finally {
      setComputing(false);
    }
  };

  const twColor = WINDOW_COLOR[timeWindow?.window] || '#a1a1aa';

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 space-y-3" data-testid="position-sizer-panel">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calculator size={14} className="text-sky-400" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-200">Position Sizer</span>
          <span className="text-[8px] text-zinc-600">Kelly + Vol Adaptive</span>
        </div>
      </div>

      {/* Time Window + Event */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-zinc-950/60 border border-zinc-800/40 rounded-lg p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock size={10} style={{ color: twColor }} />
            <span className="text-[8px] text-zinc-500 uppercase tracking-wider">Time Window</span>
          </div>
          <p className="text-[10px] font-bold" style={{ color: twColor }}>{timeWindow?.label || '...'}</p>
          <p className="text-[9px] text-zinc-600 mt-0.5">
            Weight: <span className="text-zinc-300">{timeWindow?.weight?.toFixed(2)}x</span>
          </p>
          <p className="text-[8px] text-zinc-700 mt-0.5">{timeWindow?.time_ist}</p>
        </div>

        <div className="bg-zinc-950/60 border border-zinc-800/40 rounded-lg p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Calendar size={10} className="text-zinc-500" />
            <span className="text-[8px] text-zinc-500 uppercase tracking-wider">Event Filter</span>
          </div>
          {events.length > 0 ? (
            <div>
              <p
                className="text-[10px] font-bold truncate"
                style={{ color: IMPACT_COLOR[events[0]?.impact] || '#6b7280' }}
              >
                {events[0]?.event}
              </p>
              <p className="text-[9px] text-zinc-600 mt-0.5">
                Mult: <span className="text-zinc-300">{eventMult.toFixed(2)}x</span>
                {' '}({events[0]?.days_away === 0 ? 'TODAY' : `${events[0]?.days_away}d away`})
              </p>
            </div>
          ) : (
            <p className="text-[10px] text-zinc-500">No events nearby</p>
          )}
        </div>
      </div>

      {/* Input form */}
      <div className="grid grid-cols-3 gap-1.5">
        {[
          { label: 'Capital ₹', val: capital, set: setCapital, id: 'ps-capital' },
          { label: 'Price ₹', val: price, set: setPrice, id: 'ps-price' },
          { label: 'ATR %', val: atrPct, set: setAtrPct, id: 'ps-atr' },
          { label: 'Win Rate %', val: winRate, set: setWinRate, id: 'ps-winrate' },
          { label: 'Avg Win %', val: avgWin, set: setAvgWin, id: 'ps-avgwin' },
          { label: 'Avg Loss %', val: avgLoss, set: setAvgLoss, id: 'ps-avgloss' },
        ].map(({ label, val, set, id }) => (
          <div key={id}>
            <label className="text-[8px] text-zinc-600 block mb-0.5">{label}</label>
            <input
              type="number"
              value={val}
              onChange={e => set(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-1.5 py-1 text-[10px] text-zinc-200 focus:outline-none focus:border-sky-500/50"
              data-testid={id}
            />
          </div>
        ))}
      </div>

      <button
        onClick={calculate}
        disabled={computing}
        className="w-full py-1.5 bg-sky-600/80 hover:bg-sky-600 disabled:opacity-50 text-white text-[10px] font-bold rounded transition-colors flex items-center justify-center gap-1.5"
        data-testid="ps-calculate-btn"
      >
        <Zap size={10} />
        {computing ? 'Computing...' : 'Calculate Position'}
      </button>

      {/* Result */}
      {result && !result.error && (
        <div className="bg-zinc-950/80 border border-zinc-800/60 rounded-lg p-3 space-y-2" data-testid="ps-result">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-zinc-500">Suggested Position</span>
            <TierBadge tier={result.tier} />
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-base font-black text-sky-400">{result.quantity}</p>
              <p className="text-[8px] text-zinc-600">Quantity</p>
            </div>
            <div>
              <p className="text-base font-black text-emerald-400">{result.final_fraction_pct?.toFixed(1)}%</p>
              <p className="text-[8px] text-zinc-600">Of Capital</p>
            </div>
            <div>
              <p className="text-base font-black text-amber-400">₹{Math.round(result.actual_position_value || 0).toLocaleString('en-IN')}</p>
              <p className="text-[8px] text-zinc-600">Deploy</p>
            </div>
          </div>

          <div className="border-t border-zinc-800/50 pt-2 grid grid-cols-2 gap-1 text-[9px]">
            <span className="text-zinc-600">Full Kelly: <span className="text-zinc-300">{result.full_kelly_pct?.toFixed(1)}%</span></span>
            <span className="text-zinc-600">Half Kelly: <span className="text-zinc-300">{result.half_kelly_pct?.toFixed(1)}%</span></span>
            <span className="text-zinc-600">Vol Mult: <span className="text-zinc-300">{result.volatility_mult?.toFixed(2)}x</span></span>
            <span className="text-zinc-600">R:R Ratio: <span className="text-zinc-300">{result.reward_risk_ratio?.toFixed(2)}</span></span>
            <span className="text-zinc-600 col-span-2">
              Edge: {' '}
              <span className={result.edge_positive ? 'text-emerald-400' : 'text-red-400'}>
                {result.expected_value_pct?.toFixed(2)}% {result.edge_positive ? '✓ Positive' : '✗ Negative'}
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
