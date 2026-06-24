
CREATE TABLE t_p18400856_casino_ai_agent.sessions (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(64) UNIQUE NOT NULL,
  casino_url TEXT,
  casino_id VARCHAR(128),
  login VARCHAR(256),
  balance NUMERIC(14,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'RUB',
  status VARCHAR(32) DEFAULT 'idle',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE t_p18400856_casino_ai_agent.game_rounds (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  round_num INT NOT NULL,
  bet NUMERIC(10,2),
  result VARCHAR(16),
  profit NUMERIC(10,2),
  strategy VARCHAR(32),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE t_p18400856_casino_ai_agent.chat_messages (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  role VARCHAR(16) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
