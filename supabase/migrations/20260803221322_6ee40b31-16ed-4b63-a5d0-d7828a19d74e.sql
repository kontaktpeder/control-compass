-- Agreements: Control owns signing / version / archive. Nexus/Fortell only hands off drafts.
CREATE TYPE public.agreement_status AS ENUM (
  'draft',
  'review',
  'signing',
  'signed',
  'archived'
);

CREATE TYPE public.agreement_type AS ENUM (
  'shareholder',
  'nda',
  'employment',
  'contractor',
  'other'
);

CREATE TABLE public.agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  status public.agreement_status NOT NULL DEFAULT 'draft',
  agreement_type public.agreement_type NOT NULL DEFAULT 'other',
  counterparty_name text,
  version integer NOT NULL DEFAULT 1,
  source text NOT NULL DEFAULT 'manual',
  source_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agreements_org ON public.agreements(org_id);
CREATE INDEX idx_agreements_org_status ON public.agreements(org_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agreements TO authenticated;
GRANT ALL ON public.agreements TO service_role;

ALTER TABLE public.agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members agreements"
  ON public.agreements FOR ALL TO authenticated
  USING (public.is_member(org_id, auth.uid()))
  WITH CHECK (public.is_member(org_id, auth.uid()));

CREATE TRIGGER agreements_updated
  BEFORE UPDATE ON public.agreements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Domain scopes for Nexus handoff write path
ALTER TYPE public.api_scope ADD VALUE IF NOT EXISTS 'agreements:read';
ALTER TYPE public.api_scope ADD VALUE IF NOT EXISTS 'agreements:write';
