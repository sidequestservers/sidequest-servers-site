ALTER TABLE orders ADD COLUMN game TEXT NOT NULL DEFAULT 'palworld';
ALTER TABLE checkout_reservations ADD COLUMN secondary_allocation_id INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS checkout_reservations_secondary_allocation_id_idx
  ON checkout_reservations (secondary_allocation_id)
  WHERE secondary_allocation_id IS NOT NULL;
