import { useState, useRef, useEffect } from 'react';

const AGENT_META = {
  agent0: { icon: '◎', label: 'Perspective Generator', short: 'Perspectives' },
  agent1: { icon: '◈', label: 'Multi-Perspective Research', short: 'Research' },
  agent2: { icon: '◇', label: 'Contradiction Mapper', short: 'Contradictions' },
  agent3: { icon: '◆', label: 'Research Synthesizer', short: 'Synthesis' },
  agent4: { icon: '★', label: 'Peer Reviewer', short: 'Review' },
};

export default function OutputPanel({ agentKey, output, status, loop, onToast }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef(null);
  const meta = AGENT_META[agentKey] || { icon: '○', label: agentKey, short: agentKey };

  useEffect(() => {
    if (status === 'streaming') setOpen(true);
  }, [status]);

  useEffect(() => {
    if (status === 'streaming' && bodyRef.current && open) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [output, status, open]);

  const isEmpty = !output;
  const isStreaming = status === 'streaming';
  const isDone = status === 'done';

  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      onToast?.({ type: 'success', message: `${meta.short} copied to clipboard` });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast?.({ type: 'error', message: 'Failed to copy' });
    }
  };

  return (
    <div
      className="fade-in-up"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${isDone ? 'var(--accent)' : isStreaming ? 'var(--lavender)' : '#1E1E2E'}`,
        borderRadius: '8px',
        overflow: 'hidden',
        transition: 'all 0.3s ease',
        opacity: isEmpty && !isStreaming ? 0.45 : 1,
      }}
    >
      <button
        onClick={() => !isEmpty && setOpen((o) => !o)}
        disabled={isEmpty}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: isEmpty ? 'default' : 'pointer',
          color: 'inherit',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: isDone ? 'var(--accent)' : isStreaming ? 'var(--lavender)' : '#1E1E2E',
            flexShrink: 0,
            boxShadow: isStreaming ? '0 0 8px rgba(79, 195, 247, 0.6)' : 'none',
            animation: isStreaming ? 'pulse-dot 1.2s ease-in-out infinite' : 'none',
            transition: 'background 0.3s ease',
          }}
        />

        <span style={{ fontSize: '15px', color: 'var(--accent)', flexShrink: 0 }}>
          {meta.icon}
        </span>

        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', flex: 1 }}>
          {meta.label}
        </span>

        {loop > 1 && (
          <span style={{
            fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em',
            color: 'var(--muted-dim)', background: '#1E1E2E',
            padding: '2px 7px', borderRadius: '4px',
          }}>
            LOOP {loop}
          </span>
        )}

        {isStreaming && (
          <span style={{ fontSize: '11px', color: 'var(--lavender)', flexShrink: 0 }}>
            Writing…
          </span>
        )}

        {isDone && output && (
          <button className="copy-btn" onClick={handleCopy}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        )}

        {!isEmpty && (
          <span style={{ color: 'var(--muted-dim)', fontSize: '13px', flexShrink: 0 }}>
            {open ? '▲' : '▼'}
          </span>
        )}
      </button>

      {/* Skeleton state */}
      {isEmpty && !isStreaming && (
        <div style={{ padding: '0 18px 14px' }}>
          <div className="skeleton" style={{ height: 10, width: '80%', marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 10, width: '55%' }} />
        </div>
      )}

      {open && !isEmpty && (
        <div
          ref={bodyRef}
          style={{
            padding: '0 18px 18px',
            borderTop: '1px solid var(--border)',
            maxHeight: '420px',
            overflowY: 'auto',
          }}
        >
          <pre
            className={isStreaming ? 'streaming-cursor' : ''}
            style={{
              margin: '14px 0 0',
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: '13px',
              lineHeight: '1.75',
              color: '#C8C8D8',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}
