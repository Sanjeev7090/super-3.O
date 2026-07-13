import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Shield, AlertTriangle, CheckCircle, XCircle, RotateCcw, Settings, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmt1 = v => v == null ? '—' : Number(v).toFixed(1);
const fmtPct = v => v == null ? '—' : `${Number(v).toFixed(1)}%`;

function GaugeBar({ value, limit, color }) {
  const pct = Math.min(100, (value / limit) * 100);
  const warn = pct >= 75;
  const danger = pct >= 100;
  const barColor = danger ? '#ef4444' : warn ? '#f59e0b' : color || '#10b981';
  return (
    <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: barColor }}
      />
    </div>
  );
}

export default function PropSafePanel() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [configOpen, setConfigOpen] = useState(false);
  const [dailyLimit, setDailyLimit] = useState('2.0');
  const [maxDD, setMaxDD] = useState('5.0');

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/propsafe/status`);
      setStatus(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const iv = setInterval(fetchStatus, 5000);
    return () => clearInterval(iv);
  }, [fetchStatus]);

  const toggle = async () => {
    try {
      const { data } = await axios.post(`${API}/propsafe/configure`, {
        enabled: !status?.enabled,
        daily_loss_limit_pct: parseFloat(dailyLimit),
        max_drawdown_pct: parseFloat(maxDD),
      });
      setStatus(data);
      toast.success(data.enabled ? 'PropSafe Mode ENABLED' : 'PropSafe Mode DISABLED');
    } catch {
      toast.error('PropSafe update failed');
    }
  };

  const saveConfig = async () => {
    try {
      const { data } = await axios.post(`${API}/propsafe/configure`, {
        enabled: status?.enabled ?? true,
        daily_loss_limit_pct: parseFloat(dailyLimit),
        max_drawdown_pct: parseFloat(maxDD),
      });
      setStatus(data);
      setConfigOpen(false);
      toast.success('PropSafe limits updated');
    } catch {
      toast.error('Config update failed');
    }
  };

  const resetBreaches = async () => {
    try {
      const { data } = await axios.post(`${API}/propsafe/reset`);
      setStatus(data);
      toast.success('PropSafe breaches reset');
    } catch {
      toast.error('Reset failed');
    }
  };

  if (loading) return (
    <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 animate-pulse h-40" />
  );

  const blocked = status?.daily_loss_breached || status?.max_dd_breached;
  const borderColor = blocked ? '#ef4444' : (status?.enabled ? '#10b981' : '#3f3f46');
  const ddPct  = status?.current_drawdown_pct ?? 0;
  const maxDDL = status?.max_drawdown_pct ?? 5;
  const dailyWarn = status?.daily_warning_thresh ?? 1.5;
  const maxDDL_ = status?.max_drawdown_pct ?? 5;

  return (
    <div
      className="bg-zinc-900/90 border rounded-xl p-4 space-y-3 transition-all"
      style={{ borderColor }}
      data-testid="propsafe-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={14} style={{ color: status?.enabled ? '#10b981' : '#6b7280' }} />
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-200">PropSafe Mode</span>
          {blocked && (
            <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold uppercase">
              BLOCKED
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {status?.enabled && (status?.warnings_today > 0) && (
            <span className="text-[8px] text-amber-400 flex items-center gap-0.5">
              <AlertTriangle size={8} /> {status.warnings_today} warn
            </span>
          )}
          <button
            onClick={() => setConfigOpen(o => !o)}
            className="p-1 hover:bg-white/5 rounded transition-colors"
            data-testid="propsafe-config-btn"
          >
            <Settings size={12} className="text-zinc-500" />
          </button>
          {/* Toggle */}
          <button
            onClick={toggle}
            className={`relative w-8 h-4 rounded-full transition-all ${status?.enabled ? 'bg-emerald-500/80' : 'bg-zinc-700'}`}
            data-testid="propsafe-toggle"
          >
            <span
              className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all shadow-sm ${status?.enabled ? 'left-4' : 'left-0.5'}`}
            />
          </button>
        </div>
      </div>

      {/* Metrics */}
      {status?.enabled && (
        <div className="grid grid-cols-2 gap-2">
          {/* Drawdown */}
          <div className="space-y-1">
            <div className="flex justify-between text-[9px] text-zinc-500">
              <span className="flex items-center gap-0.5"><TrendingDown size={8} /> Drawdown</span>
              <span className={ddPct >= maxDDL ? 'text-red-400' : ddPct >= maxDDL * 0.75 ? 'text-amber-400' : 'text-zinc-400'}>
                {fmtPct(ddPct)} / {fmtPct(maxDDL)}
              </span>
            </div>
            <GaugeBar value={ddPct} limit={maxDDL} color="#10b981" />
          </div>

          {/* Status icons */}
          <div className="flex items-center justify-end gap-2">
            <div className="flex items-center gap-1 text-[9px]">
              {status.daily_loss_breached ? (
                <XCircle size={10} className="text-red-400" />
              ) : (
                <CheckCircle size={10} className="text-emerald-400" />
              )}
              <span className="text-zinc-500">Daily</span>
            </div>
            <div className="flex items-center gap-1 text-[9px]">
              {status.max_dd_breached ? (
                <XCircle size={10} className="text-red-400" />
              ) : (
                <CheckCircle size={10} className="text-emerald-400" />
              )}
              <span className="text-zinc-500">DD</span>
            </div>
          </div>
        </div>
      )}

      {/* Config limits info */}
      {status?.enabled && !configOpen && (
        <div className="flex gap-3 text-[9px] text-zinc-600">
          <span>Daily limit: <span className="text-zinc-400">{fmtPct(status.daily_loss_limit_pct)}</span></span>
          <span>Max DD: <span className="text-zinc-400">{fmtPct(status.max_drawdown_pct)}</span></span>
          <span>Blocks: <span className="text-zinc-400">{status.total_blocks_today}</span></span>
        </div>
      )}

      {/* Config panel */}
      {configOpen && (
        <div className="border border-zinc-800 rounded-lg p-3 space-y-2.5 bg-zinc-950/50">
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider font-bold">Configure Limits</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] text-zinc-500 block mb-1">Daily Loss Limit %</label>
              <input
                type="number"
                value={dailyLimit}
                onChange={e => setDailyLimit(e.target.value)}
                step="0.5"
                min="0.5"
                max="10"
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[10px] text-zinc-200 focus:outline-none focus:border-emerald-500/50"
                data-testid="propsafe-daily-limit-input"
              />
            </div>
            <div>
              <label className="text-[9px] text-zinc-500 block mb-1">Max Drawdown %</label>
              <input
                type="number"
                value={maxDD}
                onChange={e => setMaxDD(e.target.value)}
                step="0.5"
                min="1"
                max="20"
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[10px] text-zinc-200 focus:outline-none focus:border-emerald-500/50"
                data-testid="propsafe-max-dd-input"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={saveConfig}
              className="flex-1 py-1 bg-emerald-600/80 hover:bg-emerald-600 text-white text-[9px] font-bold rounded transition-colors"
              data-testid="propsafe-save-btn"
            >
              Save
            </button>
            {blocked && (
              <button
                onClick={resetBreaches}
                className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[9px] rounded transition-colors"
                data-testid="propsafe-reset-btn"
              >
                <RotateCcw size={8} /> Reset
              </button>
            )}
          </div>
        </div>
      )}

      {/* Disabled state */}
      {!status?.enabled && (
        <p className="text-[9px] text-zinc-600 leading-relaxed">
          Enable to automatically block new trades when daily loss or drawdown limits are breached.
        </p>
      )}
    </div>
  );
}
