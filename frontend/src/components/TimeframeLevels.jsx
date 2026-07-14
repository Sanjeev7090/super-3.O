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

const BADGE_H    = 15; // px — height of one badge row
const RIGHT_OFFSET = 74; // px from container right edge (clears the price scale)

const TimeframeLevels = ({ series, chart, bars }) => {
  const priceLinesRef = useRef([]);
  const levelsRef     = useRef([]);   // [{ name, price, color }]
  const [badges, setBadges] = useState([]);

  /* ── helpers ─────────────────────────────────────── */
  const clearLines = useCallback(() => {
    priceLinesRef.current.forEach(pl => {
      try { if (series && pl) series.removePriceLine(pl); } catch (_) {}
    });
    priceLinesRef.current = [];
  }, [series]);

  const recomputePositions = useCallback(() => {
    if (!series || levelsRef.current.length === 0) return;

    // Convert price → pixel y
    const raw = levelsRef.current.map(lv => {
      let y = null;
      try { y = series.priceToCoordinate(lv.price); } catch (_) {}
      return { ...lv, y };
    }).filter(lv => lv.y !== null && lv.y > 5);

    // Sort top→bottom
    raw.sort((a, b) => a.y - b.y);

    // Collision avoidance — push down if too close
    for (let i = 1; i < raw.length; i++) {
      if (raw[i].y - raw[i - 1].y < BADGE_H) {
        raw[i].y = raw[i - 1].y + BADGE_H;
      }
    }

    setBadges(raw);
  }, [series]);

  /* ── create / recreate price lines when data changes ─ */
  useEffect(() => {
    if (!series || !bars || bars.length === 0) {
      clearLines();
      levelsRef.current = [];
      setBadges([]);
      return;
    }

    clearLines();
    const computed = [];

    TIMEFRAMES.forEach(tf => {
      try {
        const { high, low } = calcHighLow(bars, tf.period);
        const price = tf.type === 'high' ? high : low;
        if (price > 0) {
          const pl = series.createPriceLine({
            price,
            color: tf.color,
            lineWidth: 1,
            lineStyle: tf.style,   // 0=solid, 2=dashed
            axisLabelVisible: false, // custom badges handle labels
            title: '',
          });
          priceLinesRef.current.push(pl);
          computed.push({ name: tf.name, price, color: tf.color });
        }
      } catch (_) {}
    });

    levelsRef.current = computed;

    // Give chart a moment to render before computing pixel positions
    const t = setTimeout(recomputePositions, 150);
    return () => {
      clearTimeout(t);
      clearLines();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, bars]);

  /* ── subscribe to chart scroll / zoom to keep badges in sync ── */
  useEffect(() => {
    if (!chart) return;

    const onPriceChange = () => recomputePositions();
    const onTimeChange  = () => recomputePositions();

    try { chart.priceScale('right').subscribeVisiblePriceRangeChange(onPriceChange); } catch (_) {}
    try { chart.timeScale().subscribeVisibleTimeRangeChange(onTimeChange); } catch (_) {}

    return () => {
      try { chart.priceScale('right').unsubscribeVisiblePriceRangeChange(onPriceChange); } catch (_) {}
      try { chart.timeScale().unsubscribeVisibleTimeRangeChange(onTimeChange); } catch (_) {}
    };
  }, [chart, recomputePositions]);

  /* ── render HTML badges ────────────────────────────── */
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
          {/* Colored name badge */}
          <div
            style={{
              background:  b.color,
              color:       '#fff',
              fontSize:    9,
              fontFamily:  'monospace',
              fontWeight:  700,
              padding:     '1px 4px',
              borderRadius: 2,
              lineHeight:  '13px',
              whiteSpace:  'nowrap',
              opacity:     0.95,
            }}
          >
            {b.name}
          </div>
          {/* Dark price badge */}
          <div
            style={{
              background:  'rgba(10,10,10,0.82)',
              color:       b.color,
              fontSize:    9,
              fontFamily:  'monospace',
              fontWeight:  700,
              padding:     '1px 4px',
              borderRadius: 2,
              lineHeight:  '13px',
              whiteSpace:  'nowrap',
              border:      `1px solid ${b.color}44`,
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
