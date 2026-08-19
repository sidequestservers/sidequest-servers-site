CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT UNIQUE,
  provider_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  customer_email TEXT NOT NULL,
  game TEXT NOT NULL DEFAULT 'palworld',
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'provisioning', 'active', 'failed', 'cancelled')),
  lifecycle_state TEXT NOT NULL DEFAULT 'active',
  grace_expires_at INTEGER,
  pterodactyl_user_id INTEGER,
  pterodactyl_server_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS orders_subscription_lifecycle_idx ON orders (provider_subscription_id, lifecycle_state, grace_expires_at);
CREATE INDEX IF NOT EXISTS orders_customer_email_idx ON orders (customer_email);

CREATE TABLE IF NOT EXISTS webhook_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, event_id)
);

CREATE TABLE IF NOT EXISTS portal_magic_links (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS portal_magic_links_email_created_idx ON portal_magic_links (email, created_at);
CREATE INDEX IF NOT EXISTS portal_magic_links_expires_at_idx ON portal_magic_links (expires_at);
