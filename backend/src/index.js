const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const sessionMiddleware = require('./middleware/session');
const authRoutes = require('./routes/auth');
const entriesRoutes = require('./routes/entries');
const analysesRoutes = require('./routes/analyses');
const analyzeRoutes = require('./routes/analyze');

const app = express();
const PORT = process.env.PORT || 3001;

const isProduction = process.env.NODE_ENV === 'production';

// Trust Render's reverse proxy so req.secure is true over HTTPS
// Required for secure session cookies to be set correctly in production
if (isProduction) app.set('trust proxy', 1);

app.use(cors({
  origin: isProduction ? false : 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(sessionMiddleware);

if (isProduction) {
  const distPath = path.join(__dirname, '..', '..', 'frontend', 'dist');
  app.use(express.static(distPath));
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Auto-login as demo account and redirect to app — used for portfolio links
app.get('/demo', async (req, res) => {
  try {
    const pool = require('./db/pool');
    const result = await pool.query('SELECT id FROM users WHERE email = $1', ['demo@ouroboros.app']);
    if (result.rows.length === 0) {
      return res.status(404).send('Demo account not found. Run: node src/db/seedDemo.js');
    }
    req.session.userId = result.rows[0].id;
    req.session.save(() => res.redirect('/app.html'));
  } catch (err) {
    console.error('Demo login error:', err);
    res.status(500).send('Demo login failed');
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/entries', entriesRoutes);
app.use('/api/analyses', analysesRoutes);
app.use('/api/analyze', analyzeRoutes);

app.listen(PORT, () => {
  console.log(`Ouroboros backend running on port ${PORT}`);
});
