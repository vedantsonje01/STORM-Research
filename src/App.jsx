import { useState, useEffect, useRef, useCallback } from 'react';
import Preloader from './components/Preloader.jsx';
import ParticleCanvas from './components/ParticleCanvas.jsx';
import OutputPanel from './components/OutputPanel.jsx';
import Confetti from './components/Confetti.jsx';
import CrystalIntro from './components/CrystalIntro.jsx';
import { StormText } from './components/BoltLogo.jsx';

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PERSPECTIVES = [
  { id: 'practitioner', name: 'Practitioner', description: 'Examines real-world implementation, practical challenges, and ground-level insights.', group: 'storm' },
  { id: 'academic', name: 'Academic', description: 'Applies theoretical frameworks, peer-reviewed research, and scholarly analysis.', group: 'storm' },
  { id: 'skeptic', name: 'Skeptic', description: 'Interrogates assumptions, limitations, risks, and counterarguments.', group: 'storm' },
  { id: 'economist', name: 'Economist', description: 'Analyzes incentives, resource allocation, market dynamics, and economic impacts.', group: 'storm' },
  { id: 'historian', name: 'Historian', description: 'Situates the topic in historical context, examining precedents and evolution.', group: 'storm' },
];

const QUALITY_THRESHOLD = 8.5;
const AGENT_KEYS = ['agent0', 'agent1', 'agent2', 'agent3', 'agent4'];
const AGENT_LABELS = {
  agent0: 'Perspectives',
  agent1: 'Research',
  agent2: 'Contradictions',
  agent3: 'Synthesis',
  agent4: 'Review',
};
const AGENT_ICONS = {
  agent0: '◎',
  agent1: '◈',
  agent2: '◇',
  agent3: '◆',
  agent4: '★',
};

const emptyOutputs = () =>
  Object.fromEntries(AGENT_KEYS.map((k) => [k, { text: '', status: 'idle', loop: 1 }]));

// ── Research history (localStorage) ─────────────────────────────────────────

const HISTORY_KEY = 'storm_research_history';

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch { return []; }
}

function saveToHistory(entry) {
  const history = loadHistory();
  history.unshift(entry);
  if (history.length > 20) history.length = 20;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function deleteFromHistory(id) {
  const history = loadHistory().filter((h) => h.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

// ── Typewriter hook ─────────────────────────────────────────────────────────

function useTypewriter(text, speed = 120, delay = 300) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let i = 0;
    const timeout = setTimeout(() => {
      const interval = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(interval);
          setDone(true);
        }
      }, speed);
      return () => clearInterval(interval);
    }, delay);
    return () => clearTimeout(timeout);
  }, [text, speed, delay]);

  return { displayed, done };
}

// ── Toast system ────────────────────────────────────────────────────────────

function ToastContainer({ toasts, onRemove }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.type} ${t.exiting ? 'toast-exit' : ''}`}
          onClick={() => onRemove(t.id)}
        >
          <span>{t.type === 'error' ? '✕' : '✓'}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

// ── Scroll fade-in hook ─────────────────────────────────────────────────────

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
      { threshold: 0.05 }
    );
    const els = ref.current.querySelectorAll('.fade-in-up:not(.visible)');
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  });
}

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [phase, setPhase] = useState('input');
  const [topic, setTopic] = useState('');
  const [role, setRole] = useState('');
  const qualityThreshold = QUALITY_THRESHOLD;
  const [allPerspectives, setAllPerspectives] = useState(DEFAULT_PERSPECTIVES);
  const [selected, setSelected] = useState(() => new Set(DEFAULT_PERSPECTIVES.map((p) => p.id)));
  const [loadingCustom, setLoadingCustom] = useState(false);
  const [hasCustom, setHasCustom] = useState(false);
  const [outputs, setOutputs] = useState(emptyOutputs());
  const [currentLoop, setCurrentLoop] = useState(1);
  const [finalGrade, setFinalGrade] = useState(null);
  const [totalLoops, setTotalLoops] = useState(null);
  const [error, setError] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [history, setHistory] = useState(loadHistory);
  const [showHistory, setShowHistory] = useState(false);
  const abortRef = useRef(null);
  const mainRef = useRef(null);
  const toastIdRef = useRef(0);

  useFadeIn(mainRef);

  // ── Global keyboard shortcuts ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && phase === 'running') {
        abortRef.current?.abort();
        setPhase('done');
      }
      if (e.key === 'h' && e.ctrlKey && phase === 'input') {
        e.preventDefault();
        setShowHistory((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase]);

  const addToast = useCallback((toast) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => t.id === id ? { ...t, exiting: true } : t));
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 300);
    }, 3000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 300);
  }, []);

  // ── Perspective generation ────────────────────────────────────────────────

  const selectedPerspectives = allPerspectives.filter((p) => selected.has(p.id));

  const togglePerspective = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 5) {
        next.add(id);
      }
      return next;
    });
  };

  const generateCustomPerspectives = async () => {
    if (!topic.trim()) return;
    setLoadingCustom(true);
    try {
      const res = await fetch('/api/perspectives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();
      if (data.perspectives) {
        const custom = data.perspectives.map((p) => ({ ...p, group: 'custom' }));
        setAllPerspectives([...DEFAULT_PERSPECTIVES, ...custom]);
        setHasCustom(true);
        addToast({ type: 'success', message: 'Custom perspectives generated — pick any 5' });
      }
    } catch (err) {
      addToast({ type: 'error', message: 'Failed to generate perspectives: ' + err.message });
    } finally {
      setLoadingCustom(false);
    }
  };

  // ── Research loop ─────────────────────────────────────────────────────────

  const startResearch = useCallback(async () => {
    setPhase('running');
    setOutputs(emptyOutputs());
    setCurrentLoop(1);
    setFinalGrade(null);
    setTotalLoops(null);
    setError(null);
    setShowConfetti(false);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/run-loop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ topic, role, perspectives: selectedPerspectives, qualityThreshold }),
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
          try { event = JSON.parse(line); } catch { continue; }
          handleEvent(event);
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        addToast({ type: 'error', message: err.message });
        setPhase('done');
      }
    }
  }, [topic, role, selectedPerspectives, qualityThreshold, addToast]);

  const handleEvent = (event) => {
    switch (event.type) {
      case 'loop_start':
        setCurrentLoop(event.loop);
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
          [event.agent]: { ...prev[event.agent], text: prev[event.agent].text + event.chunk },
        }));
        break;
      case 'agent_done':
        setOutputs((prev) => ({
          ...prev,
          [event.agent]: { ...prev[event.agent], status: 'done' },
        }));
        break;
      case 'loop_done':
        break;
      case 'done': {
        setFinalGrade(event.finalGrade);
        setTotalLoops(event.loops);
        setPhase('done');
        if (event.finalGrade >= QUALITY_THRESHOLD) {
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 3500);
        }
        const entry = {
          id: Date.now().toString(36),
          topic,
          grade: event.finalGrade,
          loops: event.loops,
          date: new Date().toISOString(),
        };
        saveToHistory(entry);
        setHistory(loadHistory());
        break;
      }
      case 'error':
        addToast({ type: 'error', message: event.message });
        setPhase('done');
        break;
    }
  };

  const cancel = () => { abortRef.current?.abort(); setPhase('done'); };

  const reset = () => {
    abortRef.current?.abort();
    setPhase('input');
    setTopic('');
    setRole('');
    setOutputs(emptyOutputs());
    setFinalGrade(null);
    setTotalLoops(null);
    setError(null);
    setShowConfetti(false);
    setAllPerspectives(DEFAULT_PERSPECTIVES);
    setSelected(new Set(DEFAULT_PERSPECTIVES.map((p) => p.id)));
    setHasCustom(false);
  };

  const exportPDF = () => {
    const synthesisText = outputs.agent3?.text;
    if (!synthesisText) {
      addToast({ type: 'error', message: 'No synthesis output to export' });
      return;
    }

    const paragraphs = synthesisText
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('### ')) return `<h3>${trimmed.slice(4)}</h3>`;
        if (trimmed.startsWith('## ')) return `<h2>${trimmed.slice(3)}</h2>`;
        if (trimmed.startsWith('# ')) return `<h1 style="font-size:20px">${trimmed.slice(2)}</h1>`;
        if (trimmed.startsWith('- ')) return `<li>${trimmed.slice(2)}</li>`;
        if (trimmed.startsWith('**') && trimmed.endsWith('**')) return `<p><strong>${trimmed.slice(2, -2)}</strong></p>`;
        return `<p>${trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>')}</p>`;
      })
      .join('\n');

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>STORM Research: ${topic}</title>
<style>
  @page { margin: 1in; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; line-height: 1.7; max-width: 100%; font-size: 11pt; }
  h1 { font-size: 22pt; margin-bottom: 4px; color: #111; }
  h2 { font-size: 14pt; margin-top: 24px; margin-bottom: 8px; color: #222; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  h3 { font-size: 12pt; margin-top: 18px; margin-bottom: 6px; color: #333; }
  p { margin: 6px 0; text-align: justify; }
  li { margin: 3px 0 3px 20px; }
  .subtitle { color: #666; font-size: 10pt; margin-bottom: 24px; }
  .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #ddd; color: #999; font-size: 9pt; }
</style></head><body>
<h1>STORM Research Synthesis</h1>
<div class="subtitle">${topic}</div>
${paragraphs}
<div class="footer">Generated by STORM Research Loop &middot; ${new Date().toLocaleDateString()}</div>
</body></html>`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      addToast({ type: 'error', message: 'Pop-up blocked — please allow pop-ups and try again' });
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
    addToast({ type: 'success', message: 'PDF print dialog opened — save as PDF' });
  };

  const copyAllOutputs = async () => {
    const text = AGENT_KEYS
      .filter((k) => outputs[k]?.text)
      .map((k) => `${AGENT_LABELS[k]}\n${'='.repeat(40)}\n\n${outputs[k].text}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      addToast({ type: 'success', message: 'All research copied to clipboard' });
    } catch {
      addToast({ type: 'error', message: 'Failed to copy' });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!loaded) return <Preloader onDone={() => setLoaded(true)} />;
  if (showIntro) return <CrystalIntro onComplete={() => setShowIntro(false)} />;

  return (
    <>
      <ParticleCanvas />
      <ScrollTrack target="window" />
      {showConfetti && <Confetti />}
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div ref={mainRef} style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '56px 48px 80px' }}>
          {phase === 'input' && (
            <div className="phase-enter" key="input">
              <InputPhase
                topic={topic} setTopic={setTopic}
                role={role} setRole={setRole}
                allPerspectives={allPerspectives}
                selected={selected}
                hasCustom={hasCustom}
                loadingCustom={loadingCustom}
                onToggle={togglePerspective}
                onCustom={generateCustomPerspectives}
                onNext={startResearch}
                history={history}
                showHistory={showHistory}
                onToggleHistory={() => setShowHistory((v) => !v)}
                onLoadHistory={(entry) => { setTopic(entry.topic); setShowHistory(false); addToast({ type: 'success', message: `Loaded: ${entry.topic.slice(0, 40)}` }); }}
                onDeleteHistory={(id) => { deleteFromHistory(id); setHistory(loadHistory()); }}
              />
            </div>
          )}

          {(phase === 'running' || phase === 'done') && (
            <div className="phase-enter" key="running">
              <RunningPhase
                topic={topic} outputs={outputs}
                currentLoop={currentLoop}
                finalGrade={finalGrade} totalLoops={totalLoops}
                qualityThreshold={qualityThreshold}
                phase={phase} error={error}
                onCancel={cancel} onReset={reset}
                onExport={exportPDF}
                onCopyAll={copyAllOutputs}
                onToast={addToast}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Input Phase ─────────────────────────────────────────────────────────────

function InputPhase({
  topic, setTopic, role, setRole,
  allPerspectives, selected, hasCustom, loadingCustom,
  onToggle, onCustom, onNext,
  history, showHistory, onToggleHistory, onLoadHistory, onDeleteHistory,
}) {
  const canProceed = topic.trim().length >= 3;
  const canStart = canProceed && selected.size === 5;
  const { displayed: titleText, done: titleDone } = useTypewriter('STORM', 140, 200);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && canStart) {
      e.preventDefault();
      onNext();
    }
  };

  const stormPerspectives = allPerspectives.filter((p) => p.group === 'storm');
  const customPerspectives = allPerspectives.filter((p) => p.group === 'custom');

  return (
    <div>
      <div className="fade-in-up" style={{ marginBottom: 56, textAlign: 'center' }}>
        <h1 style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontSize: 'clamp(44px, 7vw, 64px)',
          fontWeight: 400,
          letterSpacing: '-0.04em',
          lineHeight: 1,
          marginBottom: 14,
        }}>
          <StormText text={titleText} fontSize={64} />
          {!titleDone && <span className="typewriter-cursor" />}
        </h1>
        <p style={{
          color: 'var(--muted)',
          fontSize: '14px',
          letterSpacing: '0.06em',
          opacity: titleDone ? 1 : 0,
          transition: 'opacity 0.6s ease',
        }}>
          Stanford's Research Methodology
        </p>
      </div>

      {history.length > 0 && (
        <div className="fade-in-up" style={{ marginBottom: 24 }}>
          <button
            onClick={onToggleHistory}
            style={{
              background: 'none', border: 'none', color: 'var(--muted-dim)',
              fontSize: '12px', cursor: 'pointer', display: 'flex',
              alignItems: 'center', gap: 6, padding: 0,
              transition: 'color 0.2s ease',
            }}
          >
            <span style={{ fontSize: '14px' }}>↻</span>
            Research History ({history.length})
            <span style={{ fontSize: '10px', color: 'var(--muted-dim)', marginLeft: 4 }}>Ctrl+H</span>
            <span style={{ fontSize: '11px', marginLeft: 4 }}>{showHistory ? '▲' : '▼'}</span>
          </button>

          {showHistory && (
            <div style={{
              marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6,
              maxHeight: 240, overflowY: 'auto',
            }}>
              {history.map((h) => (
                <div key={h.id} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '10px 14px',
                  display: 'flex', alignItems: 'center', gap: 12,
                  cursor: 'pointer', transition: 'border-color 0.2s ease',
                }}
                  onClick={() => onLoadHistory(h)}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <span style={{
                    fontFamily: "'Instrument Serif', Georgia, serif",
                    fontSize: '20px', color: h.grade >= 8.5 ? 'var(--accent)' : 'var(--muted-dim)',
                    flexShrink: 0, width: 36, textAlign: 'center',
                  }}>
                    {h.grade?.toFixed(1)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {h.topic}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted-dim)' }}>
                      {new Date(h.date).toLocaleDateString()} · {h.loops} loop{h.loops !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteHistory(h.id); }}
                    style={{
                      background: 'none', border: 'none', color: 'var(--muted-dim)',
                      cursor: 'pointer', fontSize: '14px', padding: '2px 6px',
                      borderRadius: 4, transition: 'color 0.2s ease',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--danger)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--muted-dim)'}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="fade-in-up" style={{ marginBottom: 32 }}>
        <label style={labelStyle}>Research Topic</label>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What do you want to research deeply?"
          rows={3}
          style={textareaStyle}
        />
      </div>

      <div className="fade-in-up" style={{ marginBottom: 32 }}>
        <label style={labelStyle}>
          Your Role <span style={{ color: 'var(--muted-dim)', fontWeight: 400 }}>(optional)</span>
        </label>
        <input
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. product manager, PhD researcher, policy analyst…"
          style={inputStyle}
        />
      </div>

      <div className="fade-in-up" style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Analytical Perspectives</label>
            <span style={{ fontSize: '12px', color: selected.size === 5 ? 'var(--accent)' : 'var(--muted-dim)', fontWeight: 500, transition: 'color 0.2s ease' }}>
              {selected.size}/5 selected
            </span>
          </div>
          {!hasCustom && (
            <button
              onClick={canProceed ? onCustom : undefined}
              disabled={!canProceed || loadingCustom}
              style={{
                padding: '5px 12px', borderRadius: 999,
                border: '1px solid #0A4A30',
                background: '#001A14',
                color: '#5CE7C0',
                fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em',
                cursor: !canProceed || loadingCustom ? 'not-allowed' : 'pointer',
                opacity: !canProceed || loadingCustom ? 0.5 : 1,
                transition: 'all 0.2s ease',
              }}
            >
              {loadingCustom ? 'Generating…' : '+ Generate Custom'}
            </button>
          )}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: hasCustom ? '1fr 1fr' : '1fr',
          gap: hasCustom ? 20 : 0,
        }}>
          {/* STORM defaults column */}
          <div>
            {hasCustom && (
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', color: '#81D4FA', marginBottom: 8, textTransform: 'uppercase' }}>
                Storm Defaults
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {stormPerspectives.map((p) => {
                const isSelected = selected.has(p.id);
                const atLimit = selected.size >= 5 && !isSelected;
                return (
                  <div
                    key={p.id}
                    onClick={() => !atLimit && onToggle(p.id)}
                    style={{
                      padding: '10px 14px',
                      background: isSelected ? 'rgba(79, 195, 247, 0.08)' : 'var(--surface)',
                      border: `1px solid ${isSelected ? 'rgba(79, 195, 247, 0.35)' : 'var(--border)'}`,
                      borderRadius: 8,
                      cursor: atLimit ? 'not-allowed' : 'pointer',
                      opacity: atLimit ? 0.4 : 1,
                      transition: 'all 0.2s ease',
                      display: 'flex', flexDirection: 'column', gap: 3,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                        border: `1.5px solid ${isSelected ? '#4FC3F7' : 'var(--muted-dim)'}`,
                        background: isSelected ? '#4FC3F7' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '10px', color: '#0A0A0F', fontWeight: 700,
                        transition: 'all 0.2s ease',
                      }}>
                        {isSelected && '✓'}
                      </span>
                      <span style={{ color: 'var(--accent)', fontSize: '12px', fontWeight: 600, letterSpacing: '0.04em' }}>
                        {p.name.toUpperCase()}
                      </span>
                    </div>
                    <span style={{ color: 'var(--muted)', fontSize: '12px', lineHeight: 1.4, paddingLeft: 24 }}>{p.description}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Custom column */}
          {hasCustom && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', color: '#5CE7C0', marginBottom: 8, textTransform: 'uppercase' }}>
                Topic-Specific
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {customPerspectives.map((p) => {
                  const isSelected = selected.has(p.id);
                  const atLimit = selected.size >= 5 && !isSelected;
                  return (
                    <div
                      key={p.id}
                      onClick={() => !atLimit && onToggle(p.id)}
                      style={{
                        padding: '10px 14px',
                        background: isSelected ? 'rgba(92, 231, 192, 0.08)' : 'var(--surface)',
                        border: `1px solid ${isSelected ? 'rgba(92, 231, 192, 0.35)' : 'var(--border)'}`,
                        borderRadius: 8,
                        cursor: atLimit ? 'not-allowed' : 'pointer',
                        opacity: atLimit ? 0.4 : 1,
                        transition: 'all 0.2s ease',
                        display: 'flex', flexDirection: 'column', gap: 3,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                          border: `1.5px solid ${isSelected ? '#5CE7C0' : 'var(--muted-dim)'}`,
                          background: isSelected ? '#5CE7C0' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '10px', color: '#0A0A0F', fontWeight: 700,
                          transition: 'all 0.2s ease',
                        }}>
                          {isSelected && '✓'}
                        </span>
                        <span style={{ color: '#5CE7C0', fontSize: '12px', fontWeight: 600, letterSpacing: '0.04em' }}>
                          {p.name.toUpperCase()}
                        </span>
                      </div>
                      <span style={{ color: 'var(--muted)', fontSize: '12px', lineHeight: 1.4, paddingLeft: 24 }}>{p.description}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="fade-in-up" style={{ textAlign: 'center' }}>
        <button className="pill-btn" onClick={onNext} disabled={!canStart}>
          Begin Research Loop ↗
        </button>
        {!canStart && canProceed && (
          <p style={{ color: 'var(--muted-dim)', fontSize: '11px', marginTop: 10 }}>
            Select exactly 5 perspectives to continue
          </p>
        )}
        {canStart && (
          <p style={{ color: 'var(--muted-dim)', fontSize: '11px', marginTop: 10 }}>
            or press Enter ↵
          </p>
        )}
      </div>
    </div>
  );
}


// ── Pipeline Visualization ──────────────────────────────────────────────────

function PipelineViz({ outputs }) {
  return (
    <div className="pipeline" style={{ justifyContent: 'center', marginBottom: 8 }}>
      {AGENT_KEYS.map((key, i) => {
        const s = outputs[key]?.status;
        const isActive = s === 'streaming';
        const isDone = s === 'done';
        const stateClass = isActive ? 'active' : isDone ? 'done' : '';

        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center' }}>
            <div className="pipeline-node">
              <div className={`pipeline-dot ${stateClass}`}>
                {isDone ? '✓' : AGENT_ICONS[key]}
              </div>
              <span className={`pipeline-label ${stateClass}`}>{AGENT_LABELS[key]}</span>
            </div>
            {i < AGENT_KEYS.length - 1 && (
              <div
                className={`pipeline-connector ${isDone ? 'done' : outputs[AGENT_KEYS[i + 1]]?.status === 'streaming' ? 'active' : ''}`}
                style={{ marginBottom: 22 }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Running Phase ───────────────────────────────────────────────────────────

function RunningPhase({
  topic, outputs, currentLoop, finalGrade, totalLoops,
  qualityThreshold, phase, error, onCancel, onReset,
  onExport, onCopyAll, onToast,
}) {
  const isDone = phase === 'done';
  const passed = finalGrade !== null && finalGrade >= qualityThreshold;
  const hasOutput = AGENT_KEYS.some((k) => outputs[k]?.text);

  return (
    <div>
      <div className="fade-in-up" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: 'clamp(24px, 4vw, 32px)',
              fontWeight: 400, letterSpacing: '-0.03em', marginBottom: 6,
            }}>
              {isDone ? 'Research Complete' : 'Running Research Loop'}
            </h2>
            <p style={{ color: 'var(--muted-dim)', fontSize: '13px' }}>
              <em style={{ color: 'var(--lavender)', fontStyle: 'normal' }}>{topic}</em>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isDone && hasOutput && (
              <>
                <button className="ghost-btn" onClick={onCopyAll}>Copy All</button>
                <button className="ghost-btn" onClick={onExport}>Export PDF</button>
              </>
            )}
            {!isDone && <button className="ghost-btn" onClick={onCancel}>Cancel <span style={{ fontSize: '10px', color: 'var(--muted-dim)', marginLeft: 4 }}>Esc</span></button>}
            {isDone && <button className="pill-btn" onClick={onReset} style={{ padding: '9px 20px', fontSize: '13px' }}>New Research</button>}
          </div>
        </div>

        {!isDone && (
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            {[1, 2, 3].map((n) => (
              <div key={n} style={{
                height: 3, flex: 1, borderRadius: 2,
                background: n < currentLoop ? 'var(--accent)' : n === currentLoop ? 'var(--lavender)' : '#1E1E2E',
                transition: 'background 0.4s ease',
              }} />
            ))}
            <span style={{ fontSize: '12px', color: 'var(--muted-dim)', flexShrink: 0 }}>
              Loop {currentLoop}/3
            </span>
          </div>
        )}
      </div>

      <div className="fade-in-up">
        <PipelineViz outputs={outputs} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {AGENT_KEYS.map((key) => (
          <OutputPanel
            key={key}
            agentKey={key}
            output={outputs[key]?.text}
            status={outputs[key]?.status}
            loop={outputs[key]?.loop}
            onToast={onToast}
          />
        ))}
      </div>

      {isDone && !error && finalGrade !== null && (
        <div className="fade-in-up" style={{
          marginTop: 24, padding: '24px',
          background: passed ? 'rgba(79, 195, 247, 0.08)' : 'rgba(107,114,128,0.08)',
          border: `1px solid ${passed ? 'rgba(79, 195, 247, 0.35)' : 'var(--border)'}`,
          borderRadius: 10,
          display: 'flex', alignItems: 'center', gap: 20,
        }}>
          <div style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: '48px', fontWeight: 400, lineHeight: 1,
            color: passed ? 'var(--lavender)' : 'var(--muted-dim)',
          }}>
            {finalGrade?.toFixed(1)}
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
              {passed ? 'Quality Threshold Achieved ✓' : 'Maximum Loops Reached'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted-dim)' }}>
              Final grade {finalGrade?.toFixed(1)}/10 · {totalLoops} loop{totalLoops !== 1 ? 's' : ''} · Threshold {qualityThreshold}/10
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small UI pieces ─────────────────────────────────────────────────────────

function PillBadge({ children, active, onClick, variant = 'storm', disabled }) {
  const colors = variant === 'storm'
    ? { bg: '#0A1A2A', color: '#81D4FA', border: '#1A3A5A' }
    : { bg: '#001A14', color: '#5CE7C0', border: '#0A4A30' };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '3px 10px', borderRadius: 999,
        border: `1px solid ${active ? colors.border : 'var(--border)'}`,
        background: active ? colors.bg : 'transparent',
        color: active ? colors.color : 'var(--muted-dim)',
        fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em',
        cursor: disabled ? 'not-allowed' : onClick ? 'pointer' : 'default',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.2s ease',
      }}
    >
      {children}
    </button>
  );
}

// ── Shared styles ───────────────────────────────────────────────────────────

const labelStyle = {
  display: 'block', fontSize: '12px', fontWeight: 600,
  letterSpacing: '0.08em', color: 'var(--muted)',
  marginBottom: 10, textTransform: 'uppercase',
};

const inputBase = {
  width: '100%', background: 'var(--surface)',
  border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text)', fontSize: '15px',
  fontFamily: "'Inter', system-ui, sans-serif",
  outline: 'none', transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
};

const textareaStyle = { ...inputBase, padding: '14px 16px', resize: 'vertical', lineHeight: 1.6 };
const inputStyle = { ...inputBase, padding: '12px 16px' };

const perspectiveRowStyle = {
  padding: '12px 16px', background: 'var(--surface)',
  border: '1px solid var(--border)', borderRadius: 8,
  display: 'flex', flexDirection: 'column', gap: 4,
};

function ScrollTrack({ target }) {
  const trackRef = useRef(null);
  const thumbRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const el = target === 'window' ? document.documentElement : document.querySelector(target);
    if (!el || !trackRef.current || !thumbRef.current) return;

    const scroller = target === 'window' ? window : el;

    const update = () => {
      const scrollTop = target === 'window' ? window.scrollY : el.scrollTop;
      const scrollHeight = el.scrollHeight;
      const clientHeight = target === 'window' ? window.innerHeight : el.clientHeight;
      const maxScroll = scrollHeight - clientHeight;
      if (maxScroll <= 0) {
        trackRef.current.style.opacity = '0';
        return;
      }
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

    scroller.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [target]);

  return (
    <div ref={trackRef} style={{
      position: 'fixed', right: 8, top: '50%',
      transform: 'translateY(-50%)',
      width: 2, height: '18vh',
      background: 'rgba(79, 195, 247, 0.08)',
      borderRadius: 2, zIndex: 110,
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
