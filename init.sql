CREATE TABLE IF NOT EXISTS miners_balance (
  id VARCHAR(255) PRIMARY KEY, 
  miner_id VARCHAR(255), 
  wallet VARCHAR(255),
  balance NUMERIC
);

CREATE TABLE IF NOT EXISTS wallet_total (
  address VARCHAR(255) PRIMARY KEY,
  total NUMERIC
);

CREATE TABLE IF NOT EXISTS last_metrics (
  id SERIAL PRIMARY KEY,
  metric_name VARCHAR(255),
  miner_id VARCHAR(255),
  wallet_address VARCHAR(255),
  value NUMERIC,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
