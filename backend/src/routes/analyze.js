const { Router } = require('express');
const pool = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');
const OpenAI = require('openai');

const router = Router();

router.use(requireAuth);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.post('/', async (req, res) => {
  try {
    const { category } = req.body;

    if (!category) {
      return res.status(400).json({ error: 'Category is required' });
    }

    // Fetch all entries for user
    const entriesResult = await pool.query(
      'SELECT id, entry_date, content, color, mood, is_milestone, milestone_label FROM entries WHERE user_id = $1 ORDER BY entry_date ASC',
      [req.session.userId]
    );

    const entries = entriesResult.rows;

    const systemPrompt = `You are an AI analyst for a journaling app. Analyze the user's entries for the category: ${category}.
If data is insufficient, return: { "insufficient": true, "reason": "explanation" }
If sufficient, return ONLY valid JSON (no markdown, no preamble):
{
  "category": "${category}",
  "summary": "One sentence insight",
  "description": "Two to four paragraph description of the pattern",
  "entry_ids": ["uuid1", "uuid2", ...]
}
Be honest. Do not fabricate patterns.`;

    const userMessage = JSON.stringify(
      entries.map(e => ({
        id: e.id,
        entry_date: e.entry_date,
        content: e.content,
        color: e.color,
        mood: e.mood,
        is_milestone: e.is_milestone,
        milestone_label: e.milestone_label,
      }))
    );

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const raw = completion.choices[0].message.content.trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error('Failed to parse OpenAI response:', raw);
      return res.status(502).json({ error: 'Invalid response from AI' });
    }

    // Insufficient data
    if (parsed.insufficient) {
      return res.json({ insufficient: true, reason: parsed.reason });
    }

    // Insert into analyses table
    const result = await pool.query(
      `INSERT INTO analyses (user_id, category, summary, description, entry_ids)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.session.userId, parsed.category, parsed.summary, parsed.description, parsed.entry_ids]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
