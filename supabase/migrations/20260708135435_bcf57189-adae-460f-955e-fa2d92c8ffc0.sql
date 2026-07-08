
ALTER TABLE public.evidence
  ADD COLUMN IF NOT EXISTS document_type text,
  ADD COLUMN IF NOT EXISTS document_type_confidence numeric,
  ADD COLUMN IF NOT EXISTS purpose text,
  ADD COLUMN IF NOT EXISTS classification_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS ai_alternatives jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_reasoning text;
