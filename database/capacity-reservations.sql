CREATE TABLE IF NOT EXISTS checkout_reservations (
  id TEXT PRIMARY KEY,
  allocation_id INTEGER NOT NULL UNIQUE,
  secondary_allocation_id INTEGER UNIQUE,
  node_id INTEGER NOT NULL,
  memory_mb INTEGER NOT NULL,
  disk_mb INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS checkout_reservations_expires_at_idx
  ON checkout_reservations (expires_at);

CREATE TABLE IF NOT EXISTS node_capacity_locks (
  node_id INTEGER PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0
);
