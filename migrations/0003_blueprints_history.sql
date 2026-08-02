-- History sync: updated_at + nullable owner for future auth scoping
-- Idempotent (safe to re-run)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'blueprints' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE blueprints
      ADD COLUMN updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'blueprints' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE blueprints
      ADD COLUMN owner_id text NULL;
  END IF;
END $$;

-- Backfill updated_at from created_at where still default-equal (no-op if already set)
UPDATE blueprints
SET updated_at = created_at
WHERE updated_at IS NULL
   OR updated_at < created_at;

CREATE INDEX IF NOT EXISTS blueprints_updated_at_idx ON blueprints (updated_at DESC);
CREATE INDEX IF NOT EXISTS blueprints_owner_id_idx ON blueprints (owner_id);
