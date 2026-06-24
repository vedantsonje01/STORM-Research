import { useState, useRef, useEffect } from 'react';

const AGENT_META = {
  agent0: { icon: '◎', label: 'Perspective Generator' },
  agent1: { icon: '◈', label: 'Multi-Perspective Research' },
  agent2: { icon: '◇', label: 'Contradiction Mapper' },
  agent3: { icon: '◆', label: 'Research Synthesizer' },
  agent4: { icon: '★', label: 'Peer Reviewer' },
};

export default function OutputPanel({ agentKey, output, status, loop }) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef(null);
  const meta = AGENT_META[agentKey] || { icon: '○', label: agentKey };

  // Auto-open when streaming starts
  useEffect(() => {
    if (status === 'streaming') setOpen(true);
  }, [status]);

  // Auto-scroll while streaming
  useEffect(() => {
    if (status === 'streaming' && bodyRef.current && open) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [output, status, open]);

  const isEmpty = !output;
  const isStreaming = status === 'streaming';
  const isDone = status === 'done';

  return (
    <div
      className="fade-in-up"
      style={{
        background: '#13131A',
        border: '1px solid #1E1E2E',
        borderLeft: `3px solid ${isDone ? '#6C5CE7' : isStreaming ? '#A29BFE' : '#2A2A3E'}`,
        borderRadius: '8px',
        overflow: 'hidden',
        transition: 'border-color 0.3s ease',
        opacity: isEmpty && !isStreaming ? 0.45 : 1,
      }}
    >
      {/* Header */}
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
        {/* Status indicator */}
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: isDone
              ? '#6C5CE7'
              : isStreaming
              ? '#A29BFE'
              : '#2A2A3E',
            flexShrink: 0,
            boxShadow: isStreaming ? '0 0 8px rgba(162, 155, 254, 0.6)' : 'none',
            animation: isStreaming ? 'pulse-dot 1.2s ease-in-out infinite' : 'none',
            transition: 'background 0.3s ease',
          }}
        />

        <span style={{ fontSize: '15px', color: '#6C5CE7', flexShrink: 0 }}>
          {meta.icon}
        </span>

        <span style={{ fontSize: '13px', fontWeight: 500, color: '#E8E8F0', flex: 1 }}>
          {meta.label}
        </span>

        {loop > 1 && (
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.08em',
              color: '#6B7280',
              background: '#1E1E2E',
              padding: '2px 7px',
              borderRadius: '4px',
            }}
          >
            LOOP {loop}
          </span>
        )}

        {isStreaming && (
          <span style={{ fontSize: '11px', color: '#A29BFE', flexShrink: 0 }}>
            Writing…
          </span>
        )}

        {!isEmpty && (
          <span style={{ color: '#6B7280', fontSize: '13px', flexShrink: 0 }}>
            {open ? '▲' : '▼'}
          </span>
        )}
      </button>

      {/* Body */}
      {open && !isEmpty && (
        <div
          ref={bodyRef}
          style={{
            padding: '0 18px 18px',
            borderTop: '1px solid #1E1E2E',
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
