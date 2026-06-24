import { useState, useEffect } from 'react';

export default function Preloader({ onDone }) {
  const [count, setCount] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const start = performance.now();
    const duration = 1800;

    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * 100));

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        setCount(100);
        setTimeout(() => {
          setFading(true);
          setTimeout(onDone, 600);
        }, 200);
      }
    };

    requestAnimationFrame(tick);
  }, [onDone]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0A0A0F',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.6s ease',
        pointerEvents: fading ? 'none' : 'all',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: '80px',
            fontWeight: 400,
            lineHeight: 1,
            letterSpacing: '-0.04em',
            color: '#E8E8F0',
            fontVariantNumeric: 'tabular-nums',
            minWidth: '3ch',
            display: 'inline-block',
          }}
        >
          {count}
        </div>
        <div
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: '80px',
            fontWeight: 400,
            lineHeight: 1,
            letterSpacing: '-0.04em',
            color: '#6C5CE7',
            display: 'inline-block',
          }}
        >
          %
        </div>
      </div>
    </div>
  );
}
