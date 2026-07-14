import { useEffect, useRef, useState, useCallback } from 'react';

const TIMEFRAMES = [
  { name: '4Y High', period: 252 * 4, type: 'high', color: '#22c55e', style: 2 },
  { name: '4Y Low',  period: 252 * 4, type: 'low',  color: '#22c55e', style: 2 },
  { name: '1Y High', period: 252,     type: 'high', color: '#eab308', style: 2 },
  { name: '1Y Low',  period: 252,     type: 'low',  color: '#eab308', style: 2 },
  { name: '6M High', period: 120,     type: 'high', color: '#a855f7', style: 2 },
  { name: '6M Low',  period: 120,     type: 'low',  color: '#a855f7', style: 2 },
  { name: '30D High',period: 30,      type: 'high', color: '#f97316', style: 2 },
  { name: '30D Low', period: 30,      type: 'low',  color: '#f97316', style: 2 },
  { name: '1W High', period: 5,       type: 'high', color: '#06b6d4', style: 2 },
  { name: '1W Low',  period: 5,       type: 'low',  color: '#06b6d4', style: 2 },
  { name: '4H High', period: 16,      type: 'high', color: '#ef4444', style: 0 },
  { name: '4H Low',  period: 16,      type: 'low',  color: '#ef4444', style: 0 },
  { name: '1H High', period: 4,       type: 'high', color: '#f59e0b', style: 0 },
  { name: '1H Low',  period: 4,       type: 'low',  color: '#f59e0b', style: 0 },
  { name: '30M High',period: 2,       type: 'high', color: '#84cc16', style: 0 },
  { name: '30M Low', period: 2,       type: 'low',  color: '#84cc16', style: 0 },
];

const calcHighLow = (bars, n) => {
  if (!bars || bars.length === 0) return { high: 0, low: 0 };
  const slice = bars.slice(-Math.min(n, bars.length));
  return {
    high: Math.max(...slice.map(b => b.high)),
    low:  Math.min(...slice.map(b => b.low)),
  };
};

const BADGE_H     = 15;   // px height per badge row for collision avoidance
const RIGHT_OFFSET = 74;  // px from container right edge — clears price scale

const TimeframeLevels = ({ series, chart, bars }) => {
  const priceLinesRef = useRef([]);
  const levelsRef     = useRef([]);
  const rafRef        = useRef(null);
  const [badges, setBadges] = useState([]);

  /* ── clear old price lines from series ── */
  const clearLines = useCallback((s) => {
    priceLinesRef.current.forEach(pl => {
      try { if (s && pl) s.removePriceLine(pl); } catch (_) {}
    });
    priceLinesRef.current = [];
  }, []);

  /* ── recompute y-coordinates from current series state ── */
  const recompute = useCallback((s) => {
    if (!s || levelsRef.current.length === 0) return;
    const raw = levelsRef.current.map(lv => {
      let y = null;
      try { y = s.priceToCoordinate(lv.price); } catch (_) {}
      return { ...lv, y };
    }).filter(lv => lv.y !== null && lv.y > 5);

    // Sort top → bottom, then push overlapping badges apart
    raw.sort((a, b) => a.y - b.y);
    for (let i = 1; i < raw.length; i++) {
      if (raw[i].y - raw[i - 1].y < BADGE_H) {
        raw[i].y = raw[i - 1].y + BADGE_H;
      }
    }
    setBadges(raw);
  }, []);

  /* ── rAF-based scroll tracking (fires on every rendered frame during drag/zoom) ── */
  const startTracking = useCallback((s) => {
    const tick = () => {
      recompute(s);
      rafRef.current = requestAnimationFrame(tick);
    };
    // Only run while user is likely interacting — use a flag via chart subscriptions
    rafRef.current = requestAnimationFrame(tick);
    // Stop after 3 seconds of inactivity (will restart on next interaction)
    const stop = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    return stop;
  }, [recompute]);

  /* ── create / recreate price lines when bars data changes ── */
  useEffect(() => {
    const s = series;
    if (!s || !bars || bars.length === 0) {
      clearLines(s);
      levelsRef.current = [];
      setBadges([]);
      return;
    }

    clearLines(s);
    const computed = [];

    TIMEFRAMES.forEach(tf => {
      try {
        const { high, low } = calcHighLow(bars, tf.period);
        const price = tf.type === 'high' ? high : low;
        if (price > 0) {
          const pl = s.createPriceLine({
            price,
            color:            tf.color,
            lineWidth:        1.5,
            lineStyle:        tf.style,  // 0=solid, 2=dashed
            axisLabelVisible: false,
            title:            '',
          });
          priceLinesRef.current.push(pl);
          computed.push({ name: tf.name, price, color: tf.color });
        }
      } catch (_) {}
    });

    levelsRef.current = computed;
    // Initial position computation after chart renders
    const t = setTimeout(() => recompute(s), 200);

    return () => {
      clearTimeout(t);
      clearLines(s);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, bars]);

  /* ── chart scroll / zoom subscription → update badge positions ── */
  useEffect(() => {
    if (!chart || !series) return;

    let stopRaf = null;

    const onInteract = () => {
      // Cancel previous RAF burst, start a new one
      if (stopRaf) stopRaf();
      // Run recompute for ~1.5s of frames covering the interaction
      let count = 0;
      const MAX = 90; // ~1.5s at 60fps
      const burst = () => {
        recompute(series);
        count++;
        if (count < MAX) rafRef.current = requestAnimationFrame(burst);
        else stopRaf = null;
      };
      rafRef.current = requestAnimationFrame(burst);
      stopRaf = () => { cancelAnimationFrame(rafRef.current); rafRef.current = null; };
    };

    // Use logical range change — fires on every scroll/pan/zoom
    try { chart.timeScale().subscribeVisibleLogicalRangeChange(onInteract); } catch (_) {}
    try { chart.priceScale('right').subscribeVisiblePriceRangeChange(onInteract); } catch (_) {}

    return () => {
      if (stopRaf) stopRaf();
      try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(onInteract); } catch (_) {}
      try { chart.priceScale('right').unsubscribeVisiblePriceRangeChange(onInteract); } catch (_) {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, series, recompute]);

  /* ── render ── */
  return (
    <>
      {badges.map(b => (
        <div
          key={b.name}
          style={{
            position:      'absolute',
            right:         RIGHT_OFFSET,
            top:           b.y,
            transform:     'translateY(-50%)',
            zIndex:        6,
            pointerEvents: 'none',
            display:       'flex',
            alignItems:    'center',
            gap:           2,
          }}
        >
          {/* Colored name badge — same color as the line */}
          <div
            style={{
              background:   b.color,
              color:        '#fff',
              fontSize:     9,
              fontFamily:   'monospace',
              fontWeight:   700,
              padding:      '1px 4px',
              borderRadius: 2,
              lineHeight:   '13px',
              whiteSpace:   'nowrap',
              opacity:      0.95,
            }}
          >
            {b.name}
          </div>
          {/* Dark price badge with colored text */}
          <div
            style={{
              background:   'rgba(10,10,10,0.85)',
              color:        b.color,
              fontSize:     9,
              fontFamily:   'monospace',
              fontWeight:   700,
              padding:      '1px 4px',
              borderRadius: 2,
              lineHeight:   '13px',
              whiteSpace:   'nowrap',
              border:       `1px solid ${b.color}44`,
            }}
          >
            {b.price.toFixed(2)}
          </div>
        </div>
      ))}
    </>
  );
};

export default TimeframeLevels;
