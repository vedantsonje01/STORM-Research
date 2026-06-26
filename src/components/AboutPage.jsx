import { useEffect, useRef } from 'react';
import ParticleCanvas from './ParticleCanvas.jsx';

const sections = [
  {
    q: 'What is STORM?',
    a: 'STORM (Synthesis of Topic Outlines through Retrieval and Multi-perspective questioning) is a research methodology developed at Stanford University. This tool implements that methodology as a multi-agent AI research loop that generates deep, structured analysis on any topic by examining it through multiple analytical lenses simultaneously.',
  },
  {
    q: 'How does it work?',
    a: 'STORM breaks research into a pipeline of specialized AI agents. First, it generates analytical perspectives tailored to your topic. Then it conducts multi-perspective research, identifies contradictions and nuances, synthesizes findings into a coherent analysis, and finally reviews the output for quality. If the quality threshold isn\'t met, it loops again — refining until the research meets the standard.',
  },
  {
    q: 'Why was it built?',
    a: 'Traditional research is time-consuming and often limited to a single viewpoint. STORM was built to democratize deep research — giving anyone the ability to explore complex topics with the rigor of a multi-disciplinary team. It surfaces contradictions, challenges assumptions, and produces analysis that a single perspective would miss.',
  },
  {
    q: 'What are the benefits?',
    a: 'Multi-perspective analysis that catches blind spots a single viewpoint would miss. Automated quality control through iterative refinement loops. Structured output that\'s ready to use — exportable as Markdown. Speed: what would take a research team days is produced in minutes. Customizable perspectives that adapt to your specific topic and role.',
  },
  {
    q: 'Who is this for?',
    a: 'Researchers, students, analysts, product managers, journalists, policy makers — anyone who needs to understand a topic deeply and from multiple angles before making decisions or forming opinions.',
  },
];

const disclaimers = [
  'Not financial advice — STORM does not provide investment, trading, or financial planning recommendations. Consult a licensed financial advisor.',
  'Not legal advice — Nothing produced by STORM constitutes legal counsel. Consult a qualified attorney for legal matters.',
  'Not medical advice — STORM is not a substitute for professional medical diagnosis, treatment, or consultation. Always seek guidance from a healthcare provider.',
  'Not professional advice — Outputs should not replace domain-specific professional consultation in any regulated field.',
  'AI limitations — STORM uses large language models that can produce inaccurate, incomplete, or outdated information. Always verify critical claims independently.',
  'No liability — The creators of STORM accept no responsibility for decisions made based on its outputs. Use at your own discretion.',
];

function MiniScrollTrack({ scrollerRef }) {
  const trackRef = useRef(null);
  const thumbRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !trackRef.current || !thumbRef.current) return;

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const maxScroll = scrollHeight - clientHeight;
      if (maxScroll <= 0) { trackRef.current.style.opacity = '0'; return; }
      trackRef.current.style.opacity = '1';
      const ratio = scrollTop / maxScroll;
      const trackH = trackRef.current.clientHeight;
      const thumbH = thumbRef.current.clientHeight;
      thumbRef.current.style.transform = `translateY(${ratio * (trackH - thumbH)}px)`;
    };

    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => el.removeEventListener('scroll', onScroll);
  }, [scrollerRef]);

  return (
    <div ref={trackRef} style={{
      position: 'fixed', right: 8, top: '50%',
      transform: 'translateY(-50%)',
      width: 2, height: '18vh',
      background: 'rgba(79, 195, 247, 0.08)',
      borderRadius: 2, zIndex: 120,
      pointerEvents: 'none',
      transition: 'opacity 0.3s ease',
    }}>
      <div ref={thumbRef} style={{
        width: 2, height: '35%',
        background: 'rgba(79, 195, 247, 0.45)',
        borderRadius: 2,
      }} />
    </div>
  );
}

export default function AboutPage({ onBack }) {
  const scrollerRef = useRef(null);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#050508' }}>
      <ParticleCanvas />
      <MiniScrollTrack scrollerRef={scrollerRef} />

      <div ref={scrollerRef} style={{
        position: 'relative', zIndex: 1,
        maxWidth: 1100, margin: '0 auto',
        padding: '40px 48px 60px',
        overflowY: 'auto', height: '100vh',
        scrollbarWidth: 'none', msOverflowStyle: 'none',
      }}>
        <style>{`.about-scroll::-webkit-scrollbar { display: none; }`}</style>

        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none',
            color: 'var(--muted-dim)', fontSize: '13px',
            cursor: 'pointer', padding: 0,
            transition: 'color 0.2s ease',
            marginBottom: 24,
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#4FC3F7'}
          onMouseLeave={(e) => e.currentTarget.style.color = ''}
        >
          ← Back to STORM
        </button>

        <div style={{ marginBottom: 36 }}>
          <h1 style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: 'clamp(28px, 5vw, 40px)',
            fontWeight: 400,
            letterSpacing: '-0.03em',
            color: '#E0E0E8',
            marginBottom: 6,
          }}>
            About STORM
          </h1>
          <p style={{
            color: 'rgba(129, 212, 250, 0.5)',
            fontSize: '13px',
            letterSpacing: '0.06em',
          }}>
            Stanford's Research Methodology — reimagined as a tool
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
          {sections.map((s, i) => (
            <div key={i} style={{
              background: 'rgba(17, 17, 24, 0.6)',
              border: '1px solid rgba(42, 42, 62, 0.5)',
              borderRadius: 10,
              padding: '18px 24px',
              backdropFilter: 'blur(12px)',
            }}>
              <h3 style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: '17px',
                fontWeight: 400,
                color: '#4FC3F7',
                marginBottom: 8,
                marginTop: 0,
              }}>
                {s.q}
              </h3>
              <p style={{
                color: 'rgba(224, 224, 232, 0.75)',
                fontSize: '13.5px',
                lineHeight: 1.65,
                margin: 0,
              }}>
                {s.a}
              </p>
            </div>
          ))}
        </div>

        <div style={{
          background: 'rgba(17, 17, 24, 0.6)',
          border: '1px solid rgba(220, 120, 120, 0.15)',
          borderRadius: 10,
          padding: '18px 24px',
          backdropFilter: 'blur(12px)',
        }}>
          <h3 style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: '17px',
            fontWeight: 400,
            color: 'rgba(248, 180, 180, 0.85)',
            marginBottom: 14,
            marginTop: 0,
          }}>
            Disclaimers
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {disclaimers.map((d, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{
                  color: 'rgba(248, 180, 180, 0.4)',
                  fontSize: '11px',
                  flexShrink: 0,
                  paddingTop: 2,
                }}>!</span>
                <p style={{
                  color: 'rgba(224, 224, 232, 0.55)',
                  fontSize: '12.5px',
                  lineHeight: 1.55,
                  margin: 0,
                }}>{d}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          textAlign: 'center',
          marginTop: 32,
          paddingBottom: 20,
          color: 'var(--muted-dim)',
          fontSize: '11px',
        }}>
          Built with Stanford's STORM methodology
        </div>
      </div>
    </div>
  );
}
