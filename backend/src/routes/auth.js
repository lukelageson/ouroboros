const { Router } = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');

const router = Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password, birthday } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, birthday) VALUES ($1, $2, $3) RETURNING id, email, birthday',
      [email, passwordHash, birthday || null]
    );

    const user = result.rows[0];
    req.session.userId = user.id;

    res.status(201).json({ id: user.id, email: user.email, birthday: user.birthday });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    req.session.userId = user.id;

    res.json({ id: user.id, email: user.email, birthday: user.birthday });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, birthday FROM users WHERE id = $1', [req.session.userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = result.rows[0];
    res.json({ id: user.id, email: user.email, birthday: user.birthday });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/users/birthday', requireAuth, async (req, res) => {
  try {
    const { birthday } = req.body;
    if (!birthday) {
      return res.status(400).json({ error: 'Birthday is required' });
    }
    const result = await pool.query(
      'UPDATE users SET birthday = $1 WHERE id = $2 RETURNING id, email, birthday',
      [birthday, req.session.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update birthday error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
