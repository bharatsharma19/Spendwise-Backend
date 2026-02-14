-- Add a generated column for full-text search
-- This column combines description, category, and tags
ALTER TABLE expenses
ADD COLUMN fts tsvector GENERATED ALWAYS AS (
  to_tsvector('english',
    coalesce(description, '') || ' ' ||
    coalesce(category, '') || ' ' ||
    array_to_string(coalesce(tags, ARRAY[]::text[]), ' ')
  )
) STORED;

-- Create a GIN index for fast full-text search
CREATE INDEX expenses_fts_idx ON expenses USING GIN (fts);
