import { useState, useRef, useCallback } from "react";

const DEFAULT_PERSPECTIVES = [
  { id: "practitioner", label: "The Practitioner", desc: "Works with this daily — knows what academics miss", group: "storm" },
  { id: "academic", label: "The Academic", desc: "Peer-reviewed evidence over popular belief", group: "storm" },
  { id: "skeptic", label: "The Skeptic", desc: "Strongest counterarguments to mainstream views", group: "storm" },
  { id: "economist", label: "The Economist", desc: "Follows the money and financial incentives", group: "storm" },
  { id: "historian", label: "The Historian", desc: "Historical parallels and pattern recognition", group: "storm" },
];

const DEMO_CUSTOM = [
  { id: "custom_0", label: "The Technologist", desc: "How emerging tech reshapes the landscape", group: "custom" },
  { id: "custom_1", label: "The Ethicist", desc: "Moral implications and societal responsibilities", group: "custom" },
  { id: "custom_2", label: "The End User", desc: "Lived experience of people directly affected", group: "custom" },
  { id: "custom_3", label: "The Regulator", desc: "Policy frameworks and governance gaps", group: "custom" },
  { id: "custom_4", label: "The Futurist", desc: "Where this is heading in 5-10 years", group: "custom" },
];

const AGENT_LABELS = [
  { key: "agent0", name: "Perspective Generator", icon: "◎" },
  { key: "agent1", name: "Multi-Perspective Research", icon: "◈" },
  { key: "agent2", name: "Contradiction Mapper", icon: "◇" },
  { key: "agent3", name: "Research Synthesizer", icon: "◆" },
  { key: "agent4", name: "Peer Reviewer", icon: "★" },
];

function PerspectiveCard({ p, selected, onToggle, disabled }) {
  const isStorm = p.group === "storm";
  return (
    <button
      onClick={() => onToggle(p.id)}
      disabled={disabled && !selected}
      style={{
        display: "flex", flexDirection: "column", gap: 4,
        padding: "12px 14px", borderRadius: 10,
        border: selected ? "2px solid #6C5CE7" : "2px solid #E2E0EA",
        background: selected ? "#F0EEFA" : "#FAFAFE",
        cursor: disabled && !selected ? "not-allowed" : "pointer",
        opacity: disabled && !selected ? 0.4 : 1,
        textAlign: "left", transition: "all 0.15s ease", minHeight: 72,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
          color: isStorm ? "#5B4FC4" : "#0E8A6E",
          background: isStorm ? "#EEEAFC" : "#E3F8F1",
          padding: "2px 7px", borderRadius: 4,
        }}>
          {isStorm ? "STORM" : "CUSTOM"}
        </span>
        {selected && <span style={{ marginLeft: "auto", color: "#6C5CE7", fontSize: 16, fontWeight: 700 }}>✓</span>}
      </div>
      <span style={{ fontWeight: 600, fontSize: 13.5, color: "#1A1726", lineHeight: 1.3 }}>{p.label}</span>
      <span style={{ fontSize: 12, color: "#6E6B7B", lineHeight: 1.35 }}>{p.desc}</span>
    </button>
  );
}

function AgentStatus({ currentAgent, outputs }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
      {AGENT_LABELS.map((a) => {
        const done = !!outputs[a.key];
        const active = currentAgent === a.key;
        return (
          <div key={a.key} style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 500,
            background: active ? "#6C5CE7" : done ? "#E3F8F1" : "#F3F2F8",
            color: active ? "#fff" : done ? "#0E8A6E" : "#9895A7",
            transition: "all 0.2s ease",
          }}>
            <span style={{ fontSize: 14 }}>{a.icon}</span>
            <span>{a.name}</span>
            {active && <span className="pulse-dot" />}
          </div>
        );
      })}
    </div>
  );
}

function OutputPanel({ label, icon, content, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen || false);
  if (!content) return null;
  return (
    <div style={{ border: "1px solid #E2E0EA", borderRadius: 10, marginBottom: 10, overflow: "hidden", background: "#FAFAFE" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "12px 16px", background: "none", border: "none", cursor: "pointer",
          fontSize: 14, fontWeight: 600, color: "#1A1726", textAlign: "left",
        }}
      >
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ flex: 1 }}>{label}</span>
        <span style={{ fontSize: 12, color: "#6E6B7B", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
      </button>
      {open && (
        <div style={{
          padding: "0 16px 16px", fontSize: 13.5, lineHeight: 1.75,
          color: "#1A1726", whiteSpace: "pre-wrap", wordBreak: "break-word",
          maxHeight: 500, overflowY: "auto",
        }}>
          {content}
        </div>
      )}
    </div>
  );
}

export default function StormResearchLoop() {
  const [apiKey, setApiKey] = useState("");
  const [topic, setTopic] = useState("");
  const [role, setRole] = useState("");
  const [phase, setPhase] = useState("input");
  const [allPerspectives, setAllPerspectives] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [currentAgent, setCurrentAgent] = useState(null);
  const [outputs, setOutputs] = useState({});
  const [loopCount, setLoopCount] = useState(0);
  const [loopHistory, setLoopHistory] = useState([]);
  const [grade, setGrade] = useState(null);
  const [error, setError] = useState(null);
  const [showKey, setShowKey] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const togglePerspective = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 5 ? [...prev, id] : prev
    );
  };

  // Preview mode: simulate Agent 0 with demo data
  const runAgent0Preview = () => {
    if (!topic || !role) {
      setError("Please fill in all fields to preview the flow.");
      return;
    }
    setError(null);
    setAllPerspectives([...DEFAULT_PERSPECTIVES, ...DEMO_CUSTOM]);
    setSelectedIds(DEFAULT_PERSPECTIVES.map((p) => p.id));
    setOutputs({ agent0: `Generated 5 custom perspectives for "${topic}" (demo mode — live generation requires backend)` });
    setPhase("perspectives");
  };

  // Preview mode: simulate the research loop
  const runLoopPreview = () => {
    if (selectedIds.length !== 5) {
      setError("Please select exactly 5 perspectives.");
      return;
    }
    setError(null);
    setPhase("running");
    setCurrentAgent("agent1");
    setStatusMsg("Loop 1: Researching from 5 perspectives...");

    const selected = selectedIds.map((id) => allPerspectives.find((p) => p.id === id));
    const names = selected.map((p) => p.label).join(", ");

    // Simulate agents completing over time
    const steps = [
      { agent: "agent1", key: "agent1", delay: 1200,
        output: `Multi-perspective analysis of "${topic}" from: ${names}\n\nEach perspective provided:\n• Core position (2 sentences)\n• Strongest supporting evidence\n• Unique insight no other perspective offers\n\n[Full research output will appear here when connected to Gemini backend in Claude Code]` },
      { agent: "agent2", key: "agent2", delay: 2400,
        output: `Contradiction map for "${topic}":\n\n1. DIRECT CONTRADICTIONS: Identified conflicts between perspectives\n2. EVIDENCE STRENGTH: Ranked perspectives by evidence quality\n3. KEY QUESTION: The one question that resolves the biggest conflict\n4. CONSENSUS: What all perspectives agree on\n5. BLIND SPOTS: What nobody addressed\n\n[Full analysis will appear here when connected to Gemini backend]` },
      { agent: "agent3", key: "agent3", delay: 3600,
        output: `Research briefing on "${topic}" for role: ${role}\n\n1. CEO SUMMARY: One paragraph with nuance\n2. 5 KEY FINDINGS: Ranked by reliability\n3. HIDDEN CONNECTION: Non-obvious link across perspectives\n4. ACTIONABLE INSIGHT: What a ${role} should do differently\n5. FRONTIER QUESTION: The question that changes everything\n\n[Full synthesis will appear here when connected to Gemini backend]` },
      { agent: "agent4", key: "agent4", delay: 4800,
        output: `Peer review of research briefing:\n\n1. CONFIDENCE SCORES: Each finding rated 1-10\n2. WEAKEST LINK: Least confident claim identified\n3. BIAS CHECK: Perspective balance assessment\n4. MISSING PERSPECTIVE: Suggested 6th angle\n5. OVERALL GRADE: 8.7/10\n\n[Full peer review will appear here when connected to Gemini backend]` },
    ];

    steps.forEach(({ agent, key, delay: d, output }) => {
      setTimeout(() => {
        setCurrentAgent(agent);
        setStatusMsg(`Loop 1: Running ${AGENT_LABELS.find((a) => a.key === key)?.name}...`);
        setTimeout(() => {
          setOutputs((prev) => ({ ...prev, [key]: output }));
        }, 400);
      }, d);
    });

    setTimeout(() => {
      setCurrentAgent(null);
      setLoopCount(1);
      setGrade(8.7);
      setLoopHistory([{ loop: 1, grade: 8.7 }]);
      setStatusMsg("Quality threshold met!");
      setPhase("done");
    }, 5600);
  };

  const reset = () => {
    setPhase("input");
    setTopic("");
    setRole("");
    setAllPerspectives([]);
    setSelectedIds([]);
    setCurrentAgent(null);
    setOutputs({});
    setLoopCount(0);
    setLoopHistory([]);
    setGrade(null);
    setError(null);
    setStatusMsg("");
  };

  return (
    <div style={{
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      maxWidth: 780, margin: "0 auto", padding: "32px 20px",
      color: "#1A1726", minHeight: "100vh",
    }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .pulse-dot { width:7px;height:7px;border-radius:50%;background:currentColor;display:inline-block;animation:pulse 1.2s infinite; }
        .sinput {
          font-family:inherit;font-size:14px;padding:10px 14px;
          border:1.5px solid #E2E0EA;border-radius:8px;background:#F7F6FB;
          color:#1A1726;outline:none;width:100%;box-sizing:border-box;
          transition:border-color 0.2s;
        }
        .sinput:focus { border-color:#6C5CE7; }
        .sbtn {
          font-family:inherit;padding:12px 24px;border-radius:10px;border:none;
          color:#fff;font-weight:600;font-size:14px;cursor:pointer;
          transition:background 0.15s,opacity 0.15s;
        }
        .sbtn:disabled { opacity:0.45;cursor:not-allowed; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 28 }}>⚡</span>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>STORM Research Loop</h1>
        </div>
        <p style={{ fontSize: 13.5, color: "#6E6B7B", margin: "0 0 8px", lineHeight: 1.5 }}>
          Multi-agent research pipeline — 5 AI agents analyze your topic from multiple perspectives, map contradictions, synthesize findings, and self-grade until quality threshold is met.
        </p>
        {phase === "input" && (
          <div style={{
            padding: "8px 12px", borderRadius: 8, background: "#EEEAFC",
            fontSize: 12, color: "#5B4FC4", lineHeight: 1.45,
          }}>
            Preview mode — UI is fully interactive. Live AI calls activate in Claude Code with Gemini backend.
          </div>
        )}
      </div>

      {/* INPUT PHASE */}
      {phase === "input" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#6E6B7B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "block" }}>
              Research Topic
            </label>
            <textarea className="sinput" rows={2} value={topic} onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., The impact of remote work on innovation in tech companies"
              style={{ resize: "vertical", minHeight: 50 }} />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#6E6B7B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "block" }}>
              Your Role
            </label>
            <input className="sinput" type="text" value={role} onChange={(e) => setRole(e.target.value)}
              placeholder="e.g., Product Manager, Startup Founder, Student" />
          </div>

          {error && <div style={{ padding: "10px 14px", borderRadius: 8, background: "#FEF0F0", color: "#C0392B", fontSize: 13 }}>{error}</div>}

          <button className="sbtn" onClick={runAgent0Preview} disabled={!topic || !role}
            style={{ background: (!topic || !role) ? "#D5D3DE" : "#6C5CE7", marginTop: 4 }}>
            Generate Perspectives →
          </button>
        </div>
      )}

      {/* PERSPECTIVE SELECTION */}
      {phase === "perspectives" && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Select 5 Perspectives</h2>
            <p style={{ fontSize: 13, color: "#6E6B7B", margin: 0 }}>
              {selectedIds.length}/5 selected — mix STORM defaults with AI-generated custom perspectives
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginBottom: 20 }}>
            {allPerspectives.map((p) => (
              <PerspectiveCard key={p.id} p={p} selected={selectedIds.includes(p.id)}
                onToggle={togglePerspective} disabled={selectedIds.length >= 5} />
            ))}
          </div>

          {error && <div style={{ padding: "10px 14px", borderRadius: 8, background: "#FEF0F0", color: "#C0392B", fontSize: 13, marginBottom: 12 }}>{error}</div>}

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => { setPhase("input"); setError(null); }} style={{
              fontFamily: "inherit", padding: "10px 20px", borderRadius: 10, border: "1.5px solid #E2E0EA",
              background: "transparent", color: "#1A1726", fontWeight: 600, fontSize: 13, cursor: "pointer",
            }}>← Back</button>
            <button className="sbtn" onClick={runLoopPreview} disabled={selectedIds.length !== 5}
              style={{ flex: 1, background: selectedIds.length !== 5 ? "#D5D3DE" : "#6C5CE7" }}>
              Run Research Loop →
            </button>
          </div>
        </div>
      )}

      {/* RUNNING / DONE */}
      {(phase === "running" || phase === "done") && (
        <div>
          <div style={{
            display: "flex", alignItems: "center", gap: 16, padding: "12px 16px",
            borderRadius: 10, background: "#F7F6FB", marginBottom: 16, flexWrap: "wrap",
          }}>
            <div style={{ fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>Loop:</span> {loopCount || "..."} / 3
            </div>
            {grade !== null && (
              <div style={{ fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>Grade:</span>{" "}
                <span style={{ color: grade >= 8.5 ? "#0E8A6E" : "#E17055", fontWeight: 700 }}>
                  {grade}/10
                </span>
                {grade >= 8.5 ? " ✓ Threshold met" : " — below 8.5"}
              </div>
            )}
            {statusMsg && <div style={{ fontSize: 12, color: "#6E6B7B", fontStyle: "italic" }}>{statusMsg}</div>}
            {phase === "done" && (
              <button onClick={reset} style={{
                marginLeft: "auto", padding: "6px 14px", borderRadius: 6, border: "1.5px solid #6C5CE7",
                background: "transparent", color: "#6C5CE7", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
              }}>New Research</button>
            )}
          </div>

          <AgentStatus currentAgent={currentAgent} outputs={outputs} />

          <OutputPanel label="Perspective Generator" icon="◎" content={outputs.agent0} />
          <OutputPanel label="Multi-Perspective Research" icon="◈" content={outputs.agent1} />
          <OutputPanel label="Contradiction Mapper" icon="◇" content={outputs.agent2} />
          <OutputPanel label="Research Synthesizer" icon="◆" content={outputs.agent3} defaultOpen={phase === "done"} />
          <OutputPanel label="Peer Reviewer" icon="★" content={outputs.agent4} defaultOpen={phase === "done"} />

          {loopHistory.length > 1 && (
            <div style={{ marginTop: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "#6E6B7B" }}>Loop History</h3>
              {loopHistory.map((lh, i) => (
                <div key={i} style={{
                  padding: "8px 14px", borderRadius: 8, background: "#F7F6FB",
                  marginBottom: 6, fontSize: 13, display: "flex", alignItems: "center", gap: 10,
                }}>
                  <span style={{ fontWeight: 600 }}>Loop {lh.loop}</span>
                  <span style={{ color: lh.grade >= 8.5 ? "#0E8A6E" : "#E17055", fontWeight: 600 }}>
                    Grade: {lh.grade !== null ? `${lh.grade}/10` : "N/A"}
                  </span>
                  {lh.grade >= 8.5 && <span style={{ color: "#0E8A6E" }}>✓</span>}
                </div>
              ))}
            </div>
          )}

          {phase === "done" && (
            <div style={{
              marginTop: 20, padding: "16px 20px", borderRadius: 10,
              background: grade >= 8.5 ? "#E3F8F1" : "#FFF8E6",
              border: `1.5px solid ${grade >= 8.5 ? "#0E8A6E" : "#E1A948"}`,
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: grade >= 8.5 ? "#0E8A6E" : "#B57D14" }}>
                {grade >= 8.5
                  ? `Research complete — Grade ${grade}/10`
                  : `Research stopped after ${loopCount} loop${loopCount > 1 ? "s" : ""} — Best grade: ${grade ?? "N/A"}/10`}
              </div>
              <div style={{ fontSize: 13, color: "#6E6B7B" }}>
                {grade >= 8.5
                  ? "Quality threshold met. Open the Research Synthesizer and Peer Reviewer panels for your full briefing."
                  : "Max loops reached. The briefing above is the best result achieved."}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
