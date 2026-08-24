-- Apply once to existing D1 databases after subscription-lifecycle.sql.
CREATE TABLE IF NOT EXISTS cancellation_archives (
  order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  pterodactyl_server_id INTEGER NOT NULL,
  pterodactyl_backup_uuid TEXT,
  r2_key TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'backup_pending', 'ready', 'failed', 'purged')) DEFAULT 'pending',
  server_delete_at INTEGER NOT NULL,
  server_deleted_at INTEGER,
  archive_purge_at INTEGER NOT NULL,
  archived_at INTEGER,
  emailed_at INTEGER,
  purged_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS cancellation_archives_cleanup_idx ON cancellation_archives (status, server_delete_at, archive_purge_at);

-- Existing cancelled orders predate R2 retention and may already have deleted servers.
INSERT OR IGNORE INTO cancellation_archives (order_id, pterodactyl_server_id, status, server_delete_at, server_deleted_at, archive_purge_at, purged_at)
SELECT id, pterodactyl_server_id, 'purged', unixepoch(), unixepoch(), unixepoch(), unixepoch()
FROM orders
WHERE provider = 'stripe' AND status = 'cancelled' AND pterodactyl_server_id IS NOT NULL;
