import { useEffect, useRef } from 'react';

const COLORS = ['#4FC3F7', '#81D4FA', '#29B6F6', '#B3E5FC', '#E1F5FE', '#ffffff'];

export default function Confetti({ duration = 3000 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pieces = Array.from({ length: 120 }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.6,
      y: H * 0.4,
      vx: (Math.random() - 0.5) * 12,
      vy: -Math.random() * 14 - 4,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 12,
      w: Math.random() * 8 + 4,
      h: Math.random() * 4 + 2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      opacity: 1,
    }));

    const start = performance.now();
    let animId;

    const draw = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);

      ctx.clearRect(0, 0, W, H);

      for (const p of pieces) {
        p.vy += 0.25;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        p.opacity = 1 - progress;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (progress < 1) {
        animId = requestAnimationFrame(draw);
      }
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [duration]);

  return <canvas ref={canvasRef} className="confetti-canvas" />;
}
