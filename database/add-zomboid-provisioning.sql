ALTER TABLE orders ADD COLUMN game TEXT NOT NULL DEFAULT 'palworld';
ALTER TABLE checkout_reservations ADD COLUMN secondary_allocation_id INTEGER UNIQUE;
