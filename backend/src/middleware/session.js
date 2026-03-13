const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const pool = require('../db/pool');

const sessionMiddleware = session({
  store: new pgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV !== 'development',
    httpOnly: true,
    sameSite: 'lax',
  },
});

module.exports = sessionMiddleware;
