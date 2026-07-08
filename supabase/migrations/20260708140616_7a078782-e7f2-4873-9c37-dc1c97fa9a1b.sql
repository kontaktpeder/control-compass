
ALTER TABLE public.evidence
  ADD COLUMN IF NOT EXISTS primary_document_type text,
  ADD COLUMN IF NOT EXISTS primary_document_type_confidence numeric,
  ADD COLUMN IF NOT EXISTS document_type_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS primary_purpose text,
  ADD COLUMN IF NOT EXISTS primary_purpose_confidence numeric,
  ADD COLUMN IF NOT EXISTS purpose_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'unknown';

-- Backfill: when document_type looks like a stringified JSON array of {type|document_type, confidence},
-- lift the first entry into primary_* and store the array as candidates.
UPDATE public.evidence e
SET
  document_type_candidates = CASE
    WHEN e.document_type IS NOT NULL AND e.document_type ~ '^\s*\[' THEN
      COALESCE((e.document_type::jsonb), '[]'::jsonb)
    ELSE e.document_type_candidates
  END,
  primary_document_type = CASE
    WHEN e.document_type IS NOT NULL AND e.document_type ~ '^\s*\[' THEN
      COALESCE(
        (e.document_type::jsonb -> 0) ->> 'document_type',
        (e.document_type::jsonb -> 0) ->> 'type'
      )
    ELSE e.document_type
  END,
  primary_document_type_confidence = CASE
    WHEN e.document_type IS NOT NULL AND e.document_type ~ '^\s*\[' THEN
      NULLIF(((e.document_type::jsonb -> 0) ->> 'confidence'), '')::numeric
    ELSE e.document_type_confidence
  END
WHERE e.primary_document_type IS NULL;

UPDATE public.evidence e
SET
  purpose_candidates = CASE
    WHEN e.purpose IS NOT NULL AND e.purpose ~ '^\s*\[' THEN
      COALESCE((e.purpose::jsonb), '[]'::jsonb)
    ELSE e.purpose_candidates
  END,
  primary_purpose = CASE
    WHEN e.purpose IS NOT NULL AND e.purpose ~ '^\s*\[' THEN
      COALESCE(
        (e.purpose::jsonb -> 0) ->> 'purpose',
        (e.purpose::jsonb -> 0) ->> 'type'
      )
    ELSE e.purpose
  END,
  primary_purpose_confidence = CASE
    WHEN e.purpose IS NOT NULL AND e.purpose ~ '^\s*\[' THEN
      NULLIF(((e.purpose::jsonb -> 0) ->> 'confidence'), '')::numeric
    ELSE NULL
  END
WHERE e.primary_purpose IS NULL;

-- Derive an initial review_status from the previous classification_status.
UPDATE public.evidence
SET review_status = CASE
  WHEN classification_status = 'needs_review' THEN 'needs_review'
  WHEN classification_status IN ('unknown', 'no_match') THEN 'unknown'
  ELSE 'needs_review'
END
WHERE review_status = 'unknown' AND classification_status IS NOT NULL;
