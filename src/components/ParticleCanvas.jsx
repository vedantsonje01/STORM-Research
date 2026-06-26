import { useEffect, useRef } from 'react';

export default function ParticleCanvas() {
  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let animId;
    let W, H;
    let nodes = [];

    const dpr = window.devicePixelRatio || 1;
    const NODE_COUNT = 90;
    const CONNECTION_DIST = 160;
    const RIPPLE_RADIUS = 250;
    const BASE_SPEED = 0.2;

    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const init = () => {
      nodes = Array.from({ length: NODE_COUNT }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * BASE_SPEED,
        vy: (Math.random() - 0.5) * BASE_SPEED,
        baseRadius: Math.random() * 1.8 + 0.8,
        radius: 0,
        pulse: 0,
        energy: 0,
      }));
    };

    const onMouseMove = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;

        if (n.x < 0) { n.x = 0; n.vx *= -1; }
        if (n.x > W) { n.x = W; n.vx *= -1; }
        if (n.y < 0) { n.y = 0; n.vy *= -1; }
        if (n.y > H) { n.y = H; n.vy *= -1; }

        const dx = n.x - mx;
        const dy = n.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const proximity = Math.max(0, 1 - dist / RIPPLE_RADIUS);

        n.energy += (proximity - n.energy) * 0.08;
        n.pulse = n.energy;
        n.radius = n.baseRadius + n.pulse * 3;
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < CONNECTION_DIST) {
            const fade = 1 - dist / CONNECTION_DIST;
            const energy = Math.max(a.energy, b.energy);
            const baseAlpha = fade * 0.08;
            const energyAlpha = fade * energy * 0.5;
            const alpha = baseAlpha + energyAlpha;

            if (energy > 0.05) {
              ctx.shadowColor = 'rgba(79, 195, 247, 0.4)';
              ctx.shadowBlur = 6 * energy;
            }

            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(79, 195, 247, ${alpha})`;
            ctx.lineWidth = 0.6 + energy * 1.2;
            ctx.stroke();

            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;

            if (energy > 0.3) {
              const t = 0.3 + Math.random() * 0.4;
              const px = a.x + (b.x - a.x) * t;
              const py = a.y + (b.y - a.y) * t;
              ctx.beginPath();
              ctx.arc(px, py, 1, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(129, 212, 250, ${energy * 0.4})`;
              ctx.fill();
            }
          }
        }
      }

      for (const n of nodes) {
        const glowAlpha = 0.15 + n.energy * 0.6;
        const glowSize = n.radius + n.energy * 8;

        if (n.energy > 0.05) {
          const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowSize);
          grad.addColorStop(0, `rgba(79, 195, 247, ${n.energy * 0.3})`);
          grad.addColorStop(1, 'transparent');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(n.x, n.y, glowSize, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(129, 212, 250, ${glowAlpha})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    resize();
    init();
    draw();

    window.addEventListener('resize', () => { resize(); init(); });
    window.addEventListener('mousemove', onMouseMove);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
}
