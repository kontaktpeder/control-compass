-- Library v2: category + ownership live on evidence, not evidence_links.
-- Obligation assignment stays an optional overlay. category NULL = uncategorized.

CREATE TYPE public.document_category AS ENUM (
  'operations',
  'finance',
  'contracts',
  'hr',
  'reference'
);

ALTER TABLE public.evidence
  ADD COLUMN IF NOT EXISTS category public.document_category,
  ADD COLUMN IF NOT EXISTS ai_category public.document_category,
  ADD COLUMN IF NOT EXISTS ai_category_confidence numeric,
  ADD COLUMN IF NOT EXISTS responsible_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_due_at date;

-- Default owner = uploader, but only if they are still an org member.
UPDATE public.evidence e
SET responsible_user_id = e.uploaded_by
WHERE e.responsible_user_id IS NULL
  AND e.uploaded_by IS NOT NULL
  AND public.is_member(e.org_id, e.uploaded_by);

CREATE INDEX IF NOT EXISTS idx_evidence_org_category
  ON public.evidence (org_id, category);
CREATE INDEX IF NOT EXISTS idx_evidence_org_owner
  ON public.evidence (org_id, responsible_user_id);
CREATE INDEX IF NOT EXISTS idx_evidence_org_review_due
  ON public.evidence (org_id, review_due_at)
  WHERE review_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_evidence_org_uncategorized
  ON public.evidence (org_id)
  WHERE category IS NULL;

-- New uploads inherit owner from uploader. Assigned owner must be a member.
CREATE OR REPLACE FUNCTION public.evidence_set_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.responsible_user_id IS NULL THEN
    IF NEW.uploaded_by IS NOT NULL AND public.is_member(NEW.org_id, NEW.uploaded_by) THEN
      NEW.responsible_user_id := NEW.uploaded_by;
    END IF;
  END IF;

  IF NEW.responsible_user_id IS NOT NULL
     AND NOT public.is_member(NEW.org_id, NEW.responsible_user_id) THEN
    RAISE EXCEPTION 'responsible_user_id must be an org member';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS evidence_set_owner ON public.evidence;
CREATE TRIGGER evidence_set_owner
  BEFORE INSERT OR UPDATE OF responsible_user_id, org_id, uploaded_by
  ON public.evidence
  FOR EACH ROW EXECUTE FUNCTION public.evidence_set_owner();

-- Org members can read coworker names (own-profile policy already exists; RLS ORs SELECT policies).
DROP POLICY IF EXISTS "members read coworker profiles" ON public.profiles;
CREATE POLICY "members read coworker profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.memberships me
      JOIN public.memberships them ON them.org_id = me.org_id
      WHERE me.user_id = auth.uid()
        AND them.user_id = profiles.id
    )
  );

-- Best-effort category backfill. Leave NULL when unsure — review in the library.
UPDATE public.evidence e
SET category = mapped.cat
FROM (
  SELECT
    e2.id,
    CASE
      WHEN e2.classification_status = 'operational_documentation'
        OR e2.primary_purpose ILIKE '%operat%'
        OR e2.primary_purpose ILIKE '%food safety%'
        OR e2.primary_purpose ILIKE '%supplier%'
        THEN 'operations'::public.document_category
      WHEN e2.primary_purpose ILIKE '%account%'
        OR e2.primary_purpose ILIKE '%invoice%'
        OR e2.primary_purpose ILIKE '%invest%'
        THEN 'finance'::public.document_category
      WHEN e2.primary_document_type ILIKE '%contract%'
        OR e2.primary_document_type ILIKE '%nda%'
        OR e2.primary_document_type ILIKE '%agreement%'
        THEN 'contracts'::public.document_category
      WHEN e2.primary_purpose ILIKE '%employ%'
        OR e2.primary_document_type ILIKE '%employment%'
        THEN 'hr'::public.document_category
      WHEN e2.classification_status IN ('internal_knowledge', 'historical_documentation')
        THEN 'reference'::public.document_category
      ELSE NULL
    END AS cat
  FROM public.evidence e2
) mapped
WHERE e.id = mapped.id
  AND e.category IS NULL
  AND mapped.cat IS NOT NULL;
