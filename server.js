import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// ── Perspectives endpoint ────────────────────────────────────────────────────

app.post('/api/perspectives', async (req, res) => {
  const { topic } = req.body;
  if (!topic) return res.status(400).json({ error: 'topic required' });

  const prompt = `You are a research strategist. For the topic "${topic}", generate exactly 5 distinct analytical perspectives that would produce the most comprehensive and insightful research.

Return ONLY a JSON array of 5 objects, each with:
- "id": a short camelCase identifier (e.g. "techOptimist")
- "name": a 1-3 word perspective label (e.g. "Tech Optimist")
- "description": one sentence describing what this lens examines

Example format:
[
  { "id": "techOptimist", "name": "Tech Optimist", "description": "Examines how emerging technologies create new possibilities and solutions." },
  ...
]

Topic: ${topic}
Return ONLY the JSON array, no other text.`;

  try {
    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();
    // Strip markdown code blocks if present
    text = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const perspectives = JSON.parse(text);
    res.json({ perspectives });
  } catch (err) {
    console.error('perspectives error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Run-loop streaming endpoint ──────────────────────────────────────────────

app.post('/api/run-loop', async (req, res) => {
  const { topic, role, perspectives, qualityThreshold = 8.5 } = req.body;
  if (!topic || !perspectives?.length) {
    return res.status(400).json({ error: 'topic and perspectives required' });
  }

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const send = (obj) => {
    res.write(JSON.stringify(obj) + '\n');
  };

  const perspectiveList = perspectives.map((p) => `- ${p.name}: ${p.description}`).join('\n');
  const roleContext = role ? `You are assisting a ${role}.` : '';

  const AGENTS = {
    agent0: {
      label: 'Perspective Generator',
      buildPrompt: () => `${roleContext}
Topic: "${topic}"

The following analytical perspectives have been selected for this research:
${perspectiveList}

Briefly introduce each perspective (2-3 sentences each) and explain how it will contribute to understanding "${topic}". Be concise and analytical.`,
    },
    agent1: {
      label: 'Multi-Perspective Research',
      buildPrompt: (prevFeedback) => `${roleContext}
Topic: "${topic}"
${prevFeedback ? `\nPrevious peer review feedback to address:\n${prevFeedback}\n` : ''}
Conduct thorough research on "${topic}" through each of these lenses:
${perspectiveList}

For each perspective, provide 3-5 key findings with evidence and examples. Be specific and substantive. Format with clear perspective headers.`,
    },
    agent2: {
      label: 'Contradiction Mapper',
      buildPrompt: (researchOutput) => `${roleContext}
Topic: "${topic}"

Research findings:
${researchOutput}

Identify and analyze the key tensions, contradictions, and disagreements between the perspectives above. For each contradiction:
1. Name the conflicting perspectives
2. Describe the core tension
3. Explain what's at stake
4. Suggest how they might be reconciled or why they cannot be

Focus on the most substantive and illuminating conflicts.`,
    },
    agent3: {
      label: 'Research Synthesizer',
      buildPrompt: (researchOutput, contradictions) => `${roleContext}
Topic: "${topic}"

Research findings:
${researchOutput}

Identified contradictions:
${contradictions}

Synthesize all perspectives and contradictions into a coherent, nuanced analysis of "${topic}". Your synthesis should:
1. Integrate insights from all perspectives
2. Acknowledge and navigate key tensions
3. Identify emergent patterns and meta-insights
4. Draw defensible conclusions
5. Highlight remaining open questions

Write a polished, publication-quality synthesis.`,
    },
    agent4: {
      label: 'Peer Reviewer',
      buildPrompt: (synthesis) => `${roleContext}
Topic: "${topic}"

Synthesized research:
${synthesis}

As a rigorous peer reviewer, evaluate this research synthesis on:
1. Comprehensiveness (coverage of key aspects)
2. Balance (fair treatment of all perspectives)
3. Analytical depth (insights beyond surface level)
4. Internal consistency (no logical contradictions)
5. Practical value (actionable conclusions)

Provide specific feedback on weaknesses and suggestions for improvement. Be direct and constructive.

End your response with exactly: GRADE: X.X/10`,
    },
  };

  const streamAgent = async (agentKey, prompt, loop) => {
    send({ type: 'agent_start', agent: agentKey, loop });
    let fullText = '';
    try {
      const result = await model.generateContentStream(prompt);
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          fullText += text;
          send({ type: 'agent_chunk', agent: agentKey, chunk: text });
        }
      }
    } catch (err) {
      send({ type: 'error', message: `${agentKey} failed: ${err.message}` });
      throw err;
    }
    send({ type: 'agent_done', agent: agentKey });
    return fullText;
  };

  try {
    // Agent 0 runs once (perspective intro)
    const agent0Out = await streamAgent('agent0', AGENTS.agent0.buildPrompt(), 0);

    let prevReviewFeedback = '';
    let finalGrade = 0;
    let loopsDone = 0;

    for (let loop = 1; loop <= 3; loop++) {
      send({ type: 'loop_start', loop });

      const agent1Out = await streamAgent('agent1', AGENTS.agent1.buildPrompt(prevReviewFeedback), loop);
      const agent2Out = await streamAgent('agent2', AGENTS.agent2.buildPrompt(agent1Out), loop);
      const agent3Out = await streamAgent('agent3', AGENTS.agent3.buildPrompt(agent1Out, agent2Out), loop);
      const agent4Out = await streamAgent('agent4', AGENTS.agent4.buildPrompt(agent3Out), loop);

      // Extract grade
      const gradeMatch = agent4Out.match(/GRADE:\s*(\d+\.?\d*)\/10/i);
      const grade = gradeMatch ? parseFloat(gradeMatch[1]) : 0;
      const passed = grade >= qualityThreshold;

      send({ type: 'loop_done', loop, grade, passed });

      finalGrade = grade;
      loopsDone = loop;
      prevReviewFeedback = agent4Out;

      if (passed) break;
    }

    send({ type: 'done', finalGrade, loops: loopsDone });
  } catch (err) {
    console.error('run-loop error:', err);
    send({ type: 'error', message: err.message });
  }

  res.end();
});

// ── Serve frontend in production ─────────────────────────────────────────────

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
