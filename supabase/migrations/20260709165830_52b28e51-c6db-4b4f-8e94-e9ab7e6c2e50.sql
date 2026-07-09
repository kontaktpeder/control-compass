
-- 1. Add new columns
ALTER TABLE public.evidence_links
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'needs_review',
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS document_type text,
  ADD COLUMN IF NOT EXISTS purpose text,
  ADD COLUMN IF NOT EXISTS ai_document_type text,
  ADD COLUMN IF NOT EXISTS ai_document_type_confidence numeric,
  ADD COLUMN IF NOT EXISTS ai_purpose text,
  ADD COLUMN IF NOT EXISTS ai_purpose_confidence numeric,
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_reasoning_full text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- v1 status check: only two values
ALTER TABLE public.evidence_links
  DROP CONSTRAINT IF EXISTS evidence_links_status_check;
ALTER TABLE public.evidence_links
  ADD CONSTRAINT evidence_links_status_check
  CHECK (status IN ('needs_review', 'verified'));

-- 2. Collapse duplicates: keep highest-relevance row per obligation_id
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY obligation_id
           ORDER BY COALESCE(relevance, 0) DESC, created_at DESC
         ) AS rn
  FROM public.evidence_links
)
DELETE FROM public.evidence_links el
USING ranked r
WHERE el.id = r.id AND r.rn > 1;

-- 3. Backfill AI fields + status from evidence
UPDATE public.evidence_links el
SET
  ai_document_type = COALESCE(el.ai_document_type, e.primary_document_type),
  ai_document_type_confidence = COALESCE(el.ai_document_type_confidence, e.primary_document_type_confidence),
  ai_purpose = COALESCE(el.ai_purpose, e.primary_purpose),
  ai_purpose_confidence = COALESCE(el.ai_purpose_confidence, e.primary_purpose_confidence),
  ai_summary = COALESCE(el.ai_summary, e.ai_summary),
  ai_reasoning_full = COALESCE(el.ai_reasoning_full, e.ai_reasoning),
  document_type = CASE WHEN e.review_status = 'confirmed' THEN COALESCE(el.document_type, e.primary_document_type) ELSE el.document_type END,
  purpose = CASE WHEN e.review_status = 'confirmed' THEN COALESCE(el.purpose, e.primary_purpose) ELSE el.purpose END,
  status = CASE WHEN e.review_status = 'confirmed' THEN 'verified' ELSE 'needs_review' END,
  verified_at = CASE WHEN e.review_status = 'confirmed' THEN COALESCE(el.verified_at, now()) ELSE el.verified_at END
FROM public.evidence e
WHERE el.evidence_id = e.id;

-- 4. Add uniqueness (v1: one active assignment per obligation)
ALTER TABLE public.evidence_links
  DROP CONSTRAINT IF EXISTS evidence_links_evidence_id_obligation_id_key;
ALTER TABLE public.evidence_links
  DROP CONSTRAINT IF EXISTS one_active_assignment_per_obligation;
ALTER TABLE public.evidence_links
  ADD CONSTRAINT one_active_assignment_per_obligation UNIQUE (obligation_id);

-- 5. updated_at trigger
DROP TRIGGER IF EXISTS set_evidence_links_updated_at ON public.evidence_links;
CREATE TRIGGER set_evidence_links_updated_at
  BEFORE UPDATE ON public.evidence_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
