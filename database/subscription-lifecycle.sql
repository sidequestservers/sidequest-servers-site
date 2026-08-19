-- Apply once to existing D1 databases after schema.sql and capacity-reservations.sql.
ALTER TABLE orders ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE orders ADD COLUMN lifecycle_state TEXT NOT NULL DEFAULT 'active';
ALTER TABLE orders ADD COLUMN grace_expires_at INTEGER;
CREATE INDEX IF NOT EXISTS orders_subscription_lifecycle_idx ON orders (provider_subscription_id, lifecycle_state, grace_expires_at);
CREATE INDEX IF NOT EXISTS orders_customer_email_idx ON orders (customer_email);

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
