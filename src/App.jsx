import { useState, useEffect, useRef, useCallback } from 'react';
import Preloader from './components/Preloader.jsx';
import ParticleCanvas from './components/ParticleCanvas.jsx';
import OutputPanel from './components/OutputPanel.jsx';

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PERSPECTIVES = [
  { id: 'practitioner', name: 'Practitioner', description: 'Examines real-world implementation, practical challenges, and ground-level insights.', group: 'storm' },
  { id: 'academic', name: 'Academic', description: 'Applies theoretical frameworks, peer-reviewed research, and scholarly analysis.', group: 'storm' },
  { id: 'skeptic', name: 'Skeptic', description: 'Interrogates assumptions, limitations, risks, and counterarguments.', group: 'storm' },
  { id: 'economist', name: 'Economist', description: 'Analyzes incentives, resource allocation, market dynamics, and economic impacts.', group: 'storm' },
  { id: 'historian', name: 'Historian', description: 'Situates the topic in historical context, examining precedents and evolution.', group: 'storm' },
];

const QUALITY_OPTIONS = [7, 7.5, 8, 8.5, 9, 9.5];

const AGENT_KEYS = ['agent0', 'agent1', 'agent2', 'agent3', 'agent4'];

const emptyOutputs = () =>
  Object.fromEntries(AGENT_KEYS.map((k) => [k, { text: '', status: 'idle', loop: 1 }]));

// ── Scroll fade-in hook ──────────────────────────────────────────────────────

function useFadeIn(ref) {
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible');
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.1 }
    );
    const els = ref.current.querySelectorAll('.fade-in-up');
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  });
}

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [phase, setPhase] = useState('input'); // input | perspectives | running | done
  const [topic, setTopic] = useState('');
  const [role, setRole] = useState('');
  const [qualityThreshold, setQualityThreshold] = useState(8.5);
  const [perspectiveMode, setPerspectiveMode] = useState('storm'); // storm | custom
  const [perspectives, setPerspectives] = useState(DEFAULT_PERSPECTIVES);
  const [loadingCustom, setLoadingCustom] = useState(false);
  const [outputs, setOutputs] = useState(emptyOutputs());
  const [currentLoop, setCurrentLoop] = useState(1);
  const [finalGrade, setFinalGrade] = useState(null);
  const [totalLoops, setTotalLoops] = useState(null);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const mainRef = useRef(null);

  useFadeIn(mainRef);

  // Re-run observer whenever phase/outputs change to catch new .fade-in-up elements
  useEffect(() => {
    if (!mainRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible');
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.05 }
    );
    const els = mainRef.current.querySelectorAll('.fade-in-up:not(.visible)');
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  });

  // ── Perspective generation ─────────────────────────────────────────────────

  const generateCustomPerspectives = async () => {
    if (!topic.trim()) return;
    setLoadingCustom(true);
    setPerspectiveMode('custom');
    try {
      const res = await fetch('/api/perspectives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();
      if (data.perspectives) {
        setPerspectives(data.perspectives.map((p) => ({ ...p, group: 'custom' })));
      }
    } catch (err) {
      setError('Failed to generate perspectives: ' + err.message);
    } finally {
      setLoadingCustom(false);
    }
  };

  const switchToStorm = () => {
    setPerspectiveMode('storm');
    setPerspectives(DEFAULT_PERSPECTIVES);
  };

  // ── Research loop ──────────────────────────────────────────────────────────

  const startResearch = useCallback(async () => {
    setPhase('running');
    setOutputs(emptyOutputs());
    setCurrentLoop(1);
    setFinalGrade(null);
    setTotalLoops(null);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/run-loop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ topic, role, perspectives, qualityThreshold }),
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          handleEvent(event);
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
        setPhase('done');
      }
    }
  }, [topic, role, perspectives, qualityThreshold]);

  const handleEvent = (event) => {
    switch (event.type) {
      case 'loop_start':
        setCurrentLoop(event.loop);
        // On subsequent loops, clear agent1-4 outputs
        if (event.loop > 1) {
          setOutputs((prev) => {
            const next = { ...prev };
            for (const k of ['agent1', 'agent2', 'agent3', 'agent4']) {
              next[k] = { text: '', status: 'idle', loop: event.loop };
            }
            return next;
          });
        }
        break;

      case 'agent_start':
        setOutputs((prev) => ({
          ...prev,
          [event.agent]: { text: '', status: 'streaming', loop: event.loop ?? 1 },
        }));
        break;

      case 'agent_chunk':
        setOutputs((prev) => ({
          ...prev,
          [event.agent]: {
            ...prev[event.agent],
            text: prev[event.agent].text + event.chunk,
          },
        }));
        break;

      case 'agent_done':
        setOutputs((prev) => ({
          ...prev,
          [event.agent]: { ...prev[event.agent], status: 'done' },
        }));
        break;

      case 'loop_done':
        // Grade/loop info handled in 'done'
        break;

      case 'done':
        setFinalGrade(event.finalGrade);
        setTotalLoops(event.loops);
        setPhase('done');
        break;

      case 'error':
        setError(event.message);
        setPhase('done');
        break;
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setPhase('done');
  };

  const reset = () => {
    abortRef.current?.abort();
    setPhase('input');
    setTopic('');
    setRole('');
    setOutputs(emptyOutputs());
    setFinalGrade(null);
    setTotalLoops(null);
    setError(null);
    setPerspectiveMode('storm');
    setPerspectives(DEFAULT_PERSPECTIVES);
    setQualityThreshold(8.5);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!loaded) return <Preloader onDone={() => setLoaded(true)} />;

  return (
    <>
      {phase === 'input' && <ParticleCanvas />}

      <div ref={mainRef} style={{ position: 'relative', zIndex: 1 }}>
        <div
          style={{
            maxWidth: 800,
            margin: '0 auto',
            padding: '56px 24px 80px',
          }}
        >
          {/* ── Input Phase ────────────────────────────── */}
          {phase === 'input' && (
            <InputPhase
              topic={topic}
              setTopic={setTopic}
              role={role}
              setRole={setRole}
              qualityThreshold={qualityThreshold}
              setQualityThreshold={setQualityThreshold}
              perspectiveMode={perspectiveMode}
              perspectives={perspectives}
              loadingCustom={loadingCustom}
              onStorm={switchToStorm}
              onCustom={generateCustomPerspectives}
              onNext={() => setPhase('perspectives')}
            />
          )}

          {/* ── Perspectives Phase ─────────────────────── */}
          {phase === 'perspectives' && (
            <PerspectivesPhase
              topic={topic}
              perspectives={perspectives}
              perspectiveMode={perspectiveMode}
              qualityThreshold={qualityThreshold}
              onBack={() => setPhase('input')}
              onStart={startResearch}
            />
          )}

          {/* ── Running / Done Phase ───────────────────── */}
          {(phase === 'running' || phase === 'done') && (
            <RunningPhase
              topic={topic}
              outputs={outputs}
              currentLoop={currentLoop}
              finalGrade={finalGrade}
              totalLoops={totalLoops}
              qualityThreshold={qualityThreshold}
              phase={phase}
              error={error}
              onCancel={cancel}
              onReset={reset}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ── Input Phase Component ────────────────────────────────────────────────────

function InputPhase({
  topic, setTopic, role, setRole,
  qualityThreshold, setQualityThreshold,
  perspectiveMode, perspectives, loadingCustom,
  onStorm, onCustom, onNext,
}) {
  const canProceed = topic.trim().length >= 3;

  return (
    <div>
      {/* Header */}
      <div className="fade-in-up" style={{ marginBottom: 56 }}>
        <h1
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: 'clamp(40px, 6vw, 52px)',
            fontWeight: 400,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            marginBottom: 12,
          }}
        >
          STORM
        </h1>
        <p style={{ color: '#6B7280', fontSize: '14px', letterSpacing: '0.06em' }}>
          SYSTEMATIC TECHNOLOGY OF RESEARCH METHODOLOGY
        </p>
      </div>

      {/* Topic */}
      <div className="fade-in-up" style={{ marginBottom: 32 }}>
        <label style={labelStyle}>Research Topic</label>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="What do you want to research deeply?"
          rows={3}
          style={textareaStyle}
        />
      </div>

      {/* Role */}
      <div className="fade-in-up" style={{ marginBottom: 32 }}>
        <label style={labelStyle}>
          Your Role <span style={{ color: '#6B7280', fontWeight: 400 }}>(optional)</span>
        </label>
        <input
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="e.g. product manager, PhD researcher, policy analyst…"
          style={inputStyle}
        />
      </div>

      {/* Perspectives */}
      <div className="fade-in-up" style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>Analytical Perspectives</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <PillBadge active={perspectiveMode === 'storm'} onClick={onStorm} variant="storm">
              STORM
            </PillBadge>
            <PillBadge
              active={perspectiveMode === 'custom'}
              onClick={canProceed ? onCustom : undefined}
              variant="custom"
              disabled={!canProceed || loadingCustom}
            >
              {loadingCustom ? 'Generating…' : 'CUSTOM'}
            </PillBadge>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {perspectives.map((p) => (
            <div key={p.id} style={perspectiveRowStyle}>
              <span style={{ color: '#6C5CE7', fontSize: '12px', fontWeight: 600, letterSpacing: '0.06em' }}>
                {p.name.toUpperCase()}
              </span>
              <span style={{ color: '#6B7280', fontSize: '13px' }}>{p.description}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quality threshold */}
      <div className="fade-in-up" style={{ marginBottom: 40 }}>
        <label style={labelStyle}>Quality Threshold</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {QUALITY_OPTIONS.map((v) => (
            <button
              key={v}
              onClick={() => setQualityThreshold(v)}
              style={{
                padding: '6px 14px',
                borderRadius: '999px',
                border: `1px solid ${qualityThreshold === v ? '#6C5CE7' : '#1E1E2E'}`,
                background: qualityThreshold === v ? 'rgba(108,92,231,0.15)' : 'transparent',
                color: qualityThreshold === v ? '#A29BFE' : '#6B7280',
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {v}/10
            </button>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="fade-in-up">
        <button
          onClick={onNext}
          disabled={!canProceed}
          style={{
            ...pillButtonStyle,
            opacity: canProceed ? 1 : 0.4,
            cursor: canProceed ? 'pointer' : 'not-allowed',
          }}
        >
          Configure Research →
        </button>
      </div>
    </div>
  );
}

// ── Perspectives Phase Component ─────────────────────────────────────────────

function PerspectivesPhase({ topic, perspectives, perspectiveMode, qualityThreshold, onBack, onStart }) {
  return (
    <div>
      <div className="fade-in-up" style={{ marginBottom: 40 }}>
        <button onClick={onBack} style={backButtonStyle}>← Back</button>
        <h2
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: 'clamp(28px, 4vw, 36px)',
            fontWeight: 400,
            letterSpacing: '-0.03em',
            marginTop: 24,
            marginBottom: 8,
          }}
        >
          Research Configuration
        </h2>
        <p style={{ color: '#6B7280', fontSize: '14px' }}>
          Reviewing perspectives for: <em style={{ color: '#A29BFE' }}>{topic}</em>
        </p>
      </div>

      <div className="fade-in-up" style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: '13px', fontWeight: 500, color: '#E8E8F0' }}>
            Active Perspectives
          </span>
          <PillBadge active variant={perspectiveMode === 'storm' ? 'storm' : 'custom'}>
            {perspectiveMode === 'storm' ? 'STORM' : 'CUSTOM'}
          </PillBadge>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {perspectives.map((p, i) => (
            <div
              key={p.id}
              className="fade-in-up"
              style={{
                background: '#13131A',
                border: '1px solid #1E1E2E',
                borderRadius: 8,
                padding: '14px 18px',
                display: 'flex',
                gap: 14,
                alignItems: 'flex-start',
              }}
            >
              <span style={{ color: '#6C5CE7', fontSize: '13px', fontWeight: 600, flexShrink: 0, paddingTop: 1 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#E8E8F0', marginBottom: 3 }}>
                  {p.name}
                </div>
                <div style={{ fontSize: '13px', color: '#6B7280', lineHeight: 1.6 }}>
                  {p.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="fade-in-up" style={{ marginBottom: 32, padding: '14px 18px', background: '#13131A', border: '1px solid #1E1E2E', borderRadius: 8 }}>
        <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: 4, letterSpacing: '0.06em' }}>
          QUALITY THRESHOLD
        </div>
        <div style={{ fontSize: '20px', fontFamily: "'Instrument Serif', Georgia, serif", color: '#A29BFE' }}>
          {qualityThreshold}/10
        </div>
        <div style={{ fontSize: '12px', color: '#6B7280', marginTop: 4 }}>
          Research loops until this score is achieved (max 3)
        </div>
      </div>

      <div className="fade-in-up">
        <button onClick={onStart} style={pillButtonStyle}>
          Begin Research Loop ↗
        </button>
      </div>
    </div>
  );
}

// ── Running Phase Component ──────────────────────────────────────────────────

function RunningPhase({
  topic, outputs, currentLoop, finalGrade, totalLoops,
  qualityThreshold, phase, error, onCancel, onReset,
}) {
  const isDone = phase === 'done';
  const passed = finalGrade !== null && finalGrade >= qualityThreshold;

  return (
    <div>
      {/* Header */}
      <div className="fade-in-up" style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: 'clamp(24px, 4vw, 32px)',
                fontWeight: 400,
                letterSpacing: '-0.03em',
                marginBottom: 6,
              }}
            >
              {isDone ? 'Research Complete' : 'Running Research Loop'}
            </h2>
            <p style={{ color: '#6B7280', fontSize: '13px' }}>
              <em style={{ color: '#A29BFE', fontStyle: 'normal' }}>{topic}</em>
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {!isDone && (
              <button onClick={onCancel} style={ghostButtonStyle}>
                Cancel
              </button>
            )}
            {isDone && (
              <button onClick={onReset} style={ghostButtonStyle}>
                New Research
              </button>
            )}
          </div>
        </div>

        {/* Loop indicator */}
        {!isDone && (
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                style={{
                  height: 3,
                  flex: 1,
                  borderRadius: 2,
                  background: n < currentLoop ? '#6C5CE7' : n === currentLoop ? '#A29BFE' : '#1E1E2E',
                  transition: 'background 0.4s ease',
                }}
              />
            ))}
            <span style={{ fontSize: '12px', color: '#6B7280', flexShrink: 0 }}>
              Loop {currentLoop}/3
            </span>
          </div>
        )}
      </div>

      {/* Panels */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {AGENT_KEYS.map((key) => (
          <OutputPanel
            key={key}
            agentKey={key}
            output={outputs[key]?.text}
            status={outputs[key]?.status}
            loop={outputs[key]?.loop}
          />
        ))}
      </div>

      {/* Error */}
      {error && (
        <div
          className="fade-in-up"
          style={{
            marginTop: 20,
            padding: '14px 18px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8,
            color: '#EF4444',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {/* Final result */}
      {isDone && !error && finalGrade !== null && (
        <div
          className="fade-in-up"
          style={{
            marginTop: 24,
            padding: '24px',
            background: passed ? 'rgba(108,92,231,0.08)' : 'rgba(107,114,128,0.08)',
            border: `1px solid ${passed ? 'rgba(108,92,231,0.35)' : '#1E1E2E'}`,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 20,
          }}
        >
          <div
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: '48px',
              fontWeight: 400,
              lineHeight: 1,
              color: passed ? '#A29BFE' : '#6B7280',
            }}
          >
            {finalGrade?.toFixed(1)}
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#E8E8F0', marginBottom: 4 }}>
              {passed ? 'Quality Threshold Achieved' : 'Maximum Loops Reached'}
            </div>
            <div style={{ fontSize: '12px', color: '#6B7280' }}>
              Final grade {finalGrade?.toFixed(1)}/10 · {totalLoops} loop{totalLoops !== 1 ? 's' : ''} · Threshold {qualityThreshold}/10
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small UI pieces ──────────────────────────────────────────────────────────

function PillBadge({ children, active, onClick, variant = 'storm', disabled }) {
  const colors =
    variant === 'storm'
      ? { bg: '#1A1040', color: '#A29BFE', border: '#3A2A80' }
      : { bg: '#001A14', color: '#5CE7C0', border: '#0A4A30' };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '3px 10px',
        borderRadius: 999,
        border: `1px solid ${active ? colors.border : '#1E1E2E'}`,
        background: active ? colors.bg : 'transparent',
        color: active ? colors.color : '#6B7280',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.06em',
        cursor: disabled ? 'not-allowed' : onClick ? 'pointer' : 'default',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.2s ease',
      }}
    >
      {children}
    </button>
  );
}

// ── Shared styles ────────────────────────────────────────────────────────────

const labelStyle = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  color: '#6B7280',
  marginBottom: 10,
  textTransform: 'uppercase',
};

const inputBase = {
  width: '100%',
  background: '#13131A',
  border: '1px solid #1E1E2E',
  borderRadius: 8,
  color: '#E8E8F0',
  fontSize: '15px',
  fontFamily: "'Inter', system-ui, sans-serif",
  outline: 'none',
  transition: 'border-color 0.2s ease',
};

const textareaStyle = {
  ...inputBase,
  padding: '14px 16px',
  resize: 'vertical',
  lineHeight: 1.6,
};

const inputStyle = {
  ...inputBase,
  padding: '12px 16px',
};

const perspectiveRowStyle = {
  padding: '12px 16px',
  background: '#13131A',
  border: '1px solid #1E1E2E',
  borderRadius: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const pillButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '13px 28px',
  borderRadius: 999,
  background: 'linear-gradient(135deg, #6C5CE7, #7C6CF7)',
  color: '#fff',
  fontSize: '15px',
  fontWeight: 500,
  border: 'none',
  cursor: 'pointer',
  letterSpacing: '-0.01em',
  transition: 'opacity 0.2s ease, transform 0.15s ease',
};

const ghostButtonStyle = {
  padding: '9px 18px',
  borderRadius: 8,
  border: '1px solid #1E1E2E',
  background: 'transparent',
  color: '#6B7280',
  fontSize: '13px',
  cursor: 'pointer',
  transition: 'border-color 0.2s ease, color 0.2s ease',
};

const backButtonStyle = {
  background: 'none',
  border: 'none',
  color: '#6B7280',
  fontSize: '13px',
  cursor: 'pointer',
  padding: 0,
};
