import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.3-70b-versatile';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { topic } = req.body;
  if (!topic) return res.status(400).json({ error: 'topic required' });

  const prompt = `You are a research strategist. For the topic "${topic}", generate exactly 5 distinct analytical perspectives that would produce the most comprehensive and insightful research.

CRITICAL CONSTRAINT: The following 5 default perspectives ALREADY EXIST and will be shown alongside yours. Your 5 perspectives must be COMPLETELY DIFFERENT — no overlap, no tangential relatedness, no rewording of the same angle:
1. Practitioner — real-world implementation, practical challenges, ground-level insights
2. Academic — theoretical frameworks, peer-reviewed research, scholarly analysis
3. Skeptic — assumptions, limitations, risks, counterarguments
4. Economist — incentives, resource allocation, market dynamics, economic impacts
5. Historian — historical context, precedents, evolution over time

Your perspectives must explore angles that NONE of the above cover. Think about dimensions like: cultural/social impact, ethical/philosophical implications, future forecasting, geopolitical factors, environmental sustainability, psychological/behavioral aspects, technological disruption, legal/regulatory landscape, design/user experience, etc. Pick whatever 5 are most relevant to the topic — just ensure zero overlap with the defaults.

Return ONLY a JSON array of 5 objects, each with:
- "id": a short camelCase identifier (e.g. "ethicist")
- "name": a 1-3 word perspective label (e.g. "Ethicist")
- "description": one sentence describing what this lens examines

Topic: ${topic}
Return ONLY the JSON array, no other text.`;

  try {
    const result = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    });
    let text = result.choices[0].message.content.trim();
    text = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const perspectives = JSON.parse(text);
    res.json({ perspectives });
  } catch (err) {
    console.error('perspectives error:', err);
    res.status(500).json({ error: err.message });
  }
}
