DO $$
BEGIN
  CREATE TYPE drive_item_kind AS ENUM ('folder', 'file');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS drive_items (
  id uuid PRIMARY KEY,
  parent_id uuid REFERENCES drive_items(id) ON DELETE CASCADE,
  kind drive_item_kind NOT NULL,
  name text NOT NULL,
  etag text NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  trashed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  object_key uuid,
  size_bytes bigint,
  content_type text,
  sha256 char(64),
  content_etag text,
  CONSTRAINT drive_items_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT drive_items_name_is_one_component CHECK (position('/' in name) = 0 AND position(chr(92) in name) = 0),
  CONSTRAINT drive_items_kind_storage CHECK (
    (kind = 'folder'
      AND object_key IS NULL
      AND size_bytes IS NULL
      AND content_type IS NULL
      AND sha256 IS NULL
      AND content_etag IS NULL)
    OR
    (kind = 'file'
      AND object_key IS NOT NULL
      AND size_bytes IS NOT NULL
      AND size_bytes >= 0
      AND content_type IS NOT NULL
      AND sha256 IS NOT NULL
      AND content_etag IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS drive_items_active_sibling_name_idx
  ON drive_items (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
  WHERE trashed_at IS NULL;

CREATE INDEX IF NOT EXISTS drive_items_parent_active_name_idx
  ON drive_items (parent_id, lower(name), id)
  WHERE trashed_at IS NULL;

CREATE INDEX IF NOT EXISTS drive_items_search_name_idx
  ON drive_items (lower(name), id);

INSERT INTO drive_items (id, parent_id, kind, name, etag)
VALUES (
  '00000000-0000-4000-8000-000000000001'::uuid,
  NULL,
  'folder',
  'My Drive',
  '"root"'
)
ON CONFLICT (id) DO NOTHING;
