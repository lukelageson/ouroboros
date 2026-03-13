const { Router } = require('express');
const pool = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');

const router = Router();

router.use(requireAuth);

router.post('/', async (req, res) => {
  try {
    const { category, summary, description, entry_ids } = req.body;

    if (!category) {
      return res.status(400).json({ error: 'Category is required' });
    }
    if (!summary) {
      return res.status(400).json({ error: 'Summary is required' });
    }
    if (!description) {
      return res.status(400).json({ error: 'Description is required' });
    }
    if (!Array.isArray(entry_ids) || entry_ids.length === 0) {
      return res.status(400).json({ error: 'Entry IDs must be a non-empty array' });
    }

    const result = await pool.query(
      `INSERT INTO analyses (user_id, category, summary, description, entry_ids)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.session.userId, category, summary, description, entry_ids]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create analysis error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM analyses WHERE user_id = $1 ORDER BY run_at DESC',
      [req.session.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get analyses error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM analyses WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.session.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Delete analysis error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
