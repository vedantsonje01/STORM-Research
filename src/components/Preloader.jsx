import { useState, useEffect, useRef } from 'react';

const ACCENT = '#4FC3F7';
const GLOW = '#29B6F6';
const DIM = 'rgba(79, 195, 247, 0.08)';

const ELECTRONS = [
  { speed: 2.1, radius: 60, size: 4, opacity: 0.9 },
  { speed: -1.6, radius: 45, size: 3, opacity: 0.7 },
  { speed: 2.8, radius: 75, size: 3.5, opacity: 0.6 },
  { speed: -3.4, radius: 55, size: 2.5, opacity: 0.5 },
];

export default function Preloader({ onDone }) {
  const [progress, setProgress] = useState(0);
  const [fading, setFading] = useState(false);
  const canvasRef = useRef(null);
  const progressRef = useRef(0);

  useEffect(() => {
    const start = performance.now();
    const duration = 2200;

    const tick = (now) => {
      const elapsed = now - start;
      const p = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = eased * 100;
      setProgress(val);
      progressRef.current = val;

      if (p < 1) {
        requestAnimationFrame(tick);
      } else {
        setProgress(100);
        progressRef.current = 100;
        setTimeout(() => {
          setFading(true);
          setTimeout(onDone, 700);
        }, 300);
      }
    };

    requestAnimationFrame(tick);
  }, [onDone]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = (time) => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      const barWidth = Math.min(w * 0.55, 500);
      const barHeight = 2;
      const barX = (w - barWidth) / 2;
      const barY = h / 2;
      const p = progressRef.current / 100;
      const filledWidth = barWidth * p;

      ctx.fillStyle = DIM;
      ctx.beginPath();
      ctx.roundRect(barX, barY - barHeight / 2, barWidth, barHeight, barHeight / 2);
      ctx.fill();

      if (filledWidth > 0) {
        const glowIntensity = 8 + p * 20;
        ctx.save();
        ctx.shadowColor = GLOW;
        ctx.shadowBlur = glowIntensity;
        ctx.fillStyle = ACCENT;
        ctx.beginPath();
        ctx.roundRect(barX, barY - barHeight / 2, filledWidth, barHeight, barHeight / 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.shadowColor = ACCENT;
        ctx.shadowBlur = glowIntensity * 1.5;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(barX + filledWidth, barY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      const tipX = barX + filledWidth;
      const tipY = barY;
      const t = time / 1000;

      for (const e of ELECTRONS) {
        const scaledRadius = e.radius * (0.3 + p * 0.7);
        const angle = t * e.speed;
        const ex = tipX + Math.cos(angle) * scaledRadius * 0.6;
        const ey = tipY + Math.sin(angle) * scaledRadius * 0.35;

        const trail = 8;
        for (let i = trail; i >= 0; i--) {
          const trailAngle = angle - i * 0.12 * Math.sign(e.speed);
          const tx = tipX + Math.cos(trailAngle) * scaledRadius * 0.6;
          const ty = tipY + Math.sin(trailAngle) * scaledRadius * 0.35;
          const trailOpacity = e.opacity * p * (1 - i / trail) * 0.3;
          ctx.fillStyle = `rgba(79, 195, 247, ${trailOpacity})`;
          ctx.beginPath();
          ctx.arc(tx, ty, e.size * (1 - i / trail * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.save();
        ctx.shadowColor = ACCENT;
        ctx.shadowBlur = 12 * p;
        ctx.fillStyle = `rgba(79, 195, 247, ${e.opacity * p})`;
        ctx.beginPath();
        ctx.arc(ex, ey, e.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0A0A0F',
        zIndex: 9999,
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.7s ease',
        pointerEvents: fading ? 'none' : 'all',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}
