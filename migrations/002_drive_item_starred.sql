ALTER TABLE drive_items
  ADD COLUMN IF NOT EXISTS starred boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS drive_items_active_starred_idx
  ON drive_items (starred, lower(name), id)
  WHERE trashed_at IS NULL;
