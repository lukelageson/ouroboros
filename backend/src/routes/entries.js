const { Router } = require('express');
const pool = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');

const router = Router();

router.use(requireAuth);

router.post('/', async (req, res) => {
  try {
    const { content, color, mood, entry_date, is_milestone, milestone_label } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }
    if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) {
      return res.status(400).json({ error: 'Color must be a 7-character hex string (e.g. #ff0000)' });
    }
    if (!entry_date || !/^\d{4}-\d{2}-\d{2}$/.test(entry_date)) {
      return res.status(400).json({ error: 'Entry date is required in YYYY-MM-DD format' });
    }
    if (mood !== undefined && mood !== null && (!Number.isInteger(mood) || mood < 1 || mood > 5)) {
      return res.status(400).json({ error: 'Mood must be an integer between 1 and 5' });
    }

    const result = await pool.query(
      `INSERT INTO entries (user_id, content, color, mood, entry_date, is_milestone, milestone_label)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        req.session.userId,
        content,
        color,
        mood ?? null,
        entry_date,
        is_milestone ?? false,
        milestone_label ?? null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create entry error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM entries WHERE user_id = $1 ORDER BY entry_date ASC',
      [req.session.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get entries error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
