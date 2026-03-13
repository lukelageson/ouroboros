CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  birthday DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  color VARCHAR(7) NOT NULL,
  mood INTEGER CHECK (mood >= 1 AND mood <= 5),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_milestone BOOLEAN DEFAULT FALSE,
  milestone_label VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  entry_ids UUID[] NOT NULL,
  run_at TIMESTAMP DEFAULT NOW()
);
