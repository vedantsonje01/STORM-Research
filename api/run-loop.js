import Groq from 'groq-sdk';

export const config = {
  maxDuration: 60,
};

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.3-70b-versatile';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { topic, role, perspectives, qualityThreshold = 8.5 } = req.body;
  if (!topic || !perspectives?.length) {
    return res.status(400).json({ error: 'topic and perspectives required' });
  }

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const send = (obj) => {
    res.write(JSON.stringify(obj) + '\n');
    if (typeof res.flush === 'function') res.flush();
  };

  const perspectiveList = perspectives.map((p) => `- ${p.name}: ${p.description}`).join('\n');
  const roleContext = role ? `You are assisting a ${role}.` : '';

  const AGENTS = {
    agent0: {
      buildPrompt: () => `${roleContext}
Topic: "${topic}"

The following analytical perspectives have been selected for this research:
${perspectiveList}

Briefly introduce each perspective (2-3 sentences each) and explain how it will contribute to understanding "${topic}". Be concise and analytical.`,
    },
    agent1: {
      buildPrompt: (prevFeedback) => `${roleContext}
Topic: "${topic}"
${prevFeedback ? `\nPrevious peer review feedback to address:\n${prevFeedback}\n` : ''}
Conduct thorough research on "${topic}" through each of these lenses:
${perspectiveList}

For each perspective, provide 3-5 key findings with evidence and examples. Be specific and substantive. Format with clear perspective headers.`,
    },
    agent2: {
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

  const streamAgent = async (agentKey, prompt, loop, maxRetries = 2) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      send({ type: 'agent_start', agent: agentKey, loop });
      let fullText = '';
      try {
        const stream = await groq.chat.completions.create({
          model: MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          stream: true,
        });
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || '';
          if (text) {
            fullText += text;
            send({ type: 'agent_chunk', agent: agentKey, chunk: text });
          }
        }
        send({ type: 'agent_done', agent: agentKey });
        return fullText;
      } catch (err) {
        if (attempt < maxRetries) {
          console.warn(`${agentKey} attempt ${attempt} failed, retrying: ${err.message}`);
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }
        send({ type: 'error', message: `${agentKey} failed after ${maxRetries} attempts: ${err.message}` });
        throw err;
      }
    }
  };

  try {
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
}
