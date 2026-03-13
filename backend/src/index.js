const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const sessionMiddleware = require('./middleware/session');
const authRoutes = require('./routes/auth');
const entriesRoutes = require('./routes/entries');
const analysesRoutes = require('./routes/analyses');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(sessionMiddleware);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/entries', entriesRoutes);
app.use('/api/analyses', analysesRoutes);

app.listen(PORT, () => {
  console.log(`Ouroboros backend running on port ${PORT}`);
});
