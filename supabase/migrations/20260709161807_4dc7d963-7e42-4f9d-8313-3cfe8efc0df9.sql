
-- 1. Add required/recommended flag
ALTER TABLE public.obligations
  ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT true;

-- 2. Backfill recommended company documents into existing orgs' step 1 (Register Company)
DO $$
DECLARE
  r RECORD;
  step1_id uuid;
  gov_fw uuid;
BEGIN
  FOR r IN SELECT id AS org_id FROM public.organizations LOOP
    SELECT ps.id INTO step1_id
      FROM public.playbook_steps ps
      JOIN public.playbooks p ON p.id = ps.playbook_id
      WHERE ps.org_id = r.org_id AND p.slug = 'incorporate_company' AND ps.order_index = 1
      LIMIT 1;
    IF step1_id IS NULL THEN CONTINUE; END IF;

    SELECT id INTO gov_fw FROM public.frameworks
      WHERE org_id = r.org_id AND name = 'Governance' LIMIT 1;

    -- Insert only if missing (by title)
    INSERT INTO public.obligations (org_id, framework_id, playbook_step_id, title, why, responsible, evidence_requirements, is_required)
    SELECT r.org_id, gov_fw, step1_id, t.title, t.why, t.responsible, t.reqs, false
    FROM (VALUES
      ('Founders'' Agreement',
       'Recommended internal agreement between founders covering roles, vesting, IP assignment, and dispute resolution. Not required by law, but protects the company against founder disputes.',
       'Founders', ARRAY['Signed Founders'' Agreement PDF']),
      ('Shareholder Agreement',
       'Recommended agreement between shareholders defining transfer restrictions, drag/tag-along, and governance rights beyond the Articles of Association.',
       'Founders', ARRAY['Signed Shareholder Agreement PDF']),
      ('Non-Disclosure Agreement (NDA) Template',
       'Recommended template for confidentiality with employees, contractors, and partners. Protects trade secrets and know-how.',
       'Managing Director', ARRAY['NDA template PDF']),
      ('Founder / Board Decisions Log',
       'Recommended internal log of significant early decisions (equipment purchases, delegations, spending limits) beyond formal board minutes. Provides an audit trail.',
       'Board', ARRAY['Decision log document'])
    ) AS t(title, why, responsible, reqs)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.obligations o
       WHERE o.org_id = r.org_id AND o.playbook_step_id = step1_id AND o.title = t.title
    );
  END LOOP;
END $$;

-- 3. Update seed function to include recommended company documents for new orgs
CREATE OR REPLACE FUNCTION public.seed_incorporate_playbook(_org uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  fw_corp uuid; fw_acct uuid; fw_gov uuid;
  src_asa uuid; src_reg uuid; src_book uuid;
  pb uuid;
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid;
begin
  insert into public.frameworks(org_id, name, description) values
    (_org, 'Corporate Law', 'Formation, shares, governance under the Companies Act (Aksjeloven).') returning id into fw_corp;
  insert into public.frameworks(org_id, name, description) values
    (_org, 'Accounting', 'Bookkeeping and reporting under the Accounting Act.') returning id into fw_acct;
  insert into public.frameworks(org_id, name, description) values
    (_org, 'Governance', 'Board composition, resolutions, and internal controls.') returning id into fw_gov;

  insert into public.sources(org_id, framework_id, authority, reference) values
    (_org, fw_corp, 'Companies Act (Aksjeloven)', 'LOV-1997-06-13-44') returning id into src_asa;
  insert into public.sources(org_id, framework_id, authority, reference) values
    (_org, fw_corp, 'Brønnøysund Register Centre', 'Company registration') returning id into src_reg;
  insert into public.sources(org_id, framework_id, authority, reference) values
    (_org, fw_acct, 'Accounting Act (Regnskapsloven)', 'LOV-1998-07-17-56') returning id into src_book;

  insert into public.playbooks(org_id, slug, name) values
    (_org, 'incorporate_company', 'Incorporate a Company') returning id into pb;

  insert into public.playbook_steps(playbook_id, org_id, order_index, title, description) values
    (pb, _org, 1, 'Register the Company', 'File incorporation documents and register in Brønnøysund.') returning id into s1;
  insert into public.playbook_steps(playbook_id, org_id, order_index, title, description) values
    (pb, _org, 2, 'Establish Company Structure', 'Bank account, accounting, and shareholder register in place.') returning id into s2;
  insert into public.playbook_steps(playbook_id, org_id, order_index, title, description) values
    (pb, _org, 3, 'First Board Resolution', 'Document early decisions such as equipment purchases and authority delegation.') returning id into s3;
  insert into public.playbook_steps(playbook_id, org_id, order_index, title, description) values
    (pb, _org, 4, 'Operational Readiness', 'Insurance, tax registrations, and core policies active.') returning id into s4;
  insert into public.playbook_steps(playbook_id, org_id, order_index, title, description) values
    (pb, _org, 5, 'Ongoing Governance', 'Board minutes, annual meeting, and shareholder register kept current.') returning id into s5;

  -- Step 1 obligations (required by law)
  insert into public.obligations (org_id, framework_id, source_id, playbook_step_id, title, why, responsible, evidence_requirements, is_required) values
    (_org, fw_corp, src_asa, s1, 'Articles of Association (Vedtekter)',
      'Required by the Companies Act §2-2. Defines the company name, purpose, share capital, and board structure.',
      'Founders', array['Signed Articles of Association PDF'], true),
    (_org, fw_corp, src_asa, s1, 'Incorporation Certificate (Stiftelsesdokument)',
      'Required by the Companies Act §2-1. Records that the company was formally founded, by whom, and on what date.',
      'Founders', array['Signed founding document'], true),
    (_org, fw_corp, src_asa, s1, 'Share Capital Confirmation',
      'The Companies Act §2-8 requires paid-in share capital of at least NOK 30 000 to be confirmed by a bank or auditor.',
      'Founders', array['Bank confirmation of paid-in capital'], true),
    (_org, fw_corp, src_reg, s1, 'Brønnøysund Registration (Foretaksregisteret)',
      'The company must be registered in Foretaksregisteret within three months of incorporation.',
      'Managing Director', array['Registration certificate (firmaattest)'], true),
    (_org, fw_gov, src_asa, s1, 'Managing Director & Board Appointment',
      'The Companies Act requires a duly appointed board and managing director for a limited company.',
      'Founders', array['Board resolution appointing MD', 'List of board members'], true);

  -- Step 1 recommended company documents (not legally required)
  insert into public.obligations (org_id, framework_id, playbook_step_id, title, why, responsible, evidence_requirements, is_required) values
    (_org, fw_gov, s1, 'Founders'' Agreement',
      'Recommended internal agreement between founders covering roles, vesting, IP assignment, and dispute resolution. Not required by law, but protects the company against founder disputes.',
      'Founders', array['Signed Founders'' Agreement PDF'], false),
    (_org, fw_gov, s1, 'Shareholder Agreement',
      'Recommended agreement between shareholders defining transfer restrictions, drag/tag-along, and governance rights beyond the Articles of Association.',
      'Founders', array['Signed Shareholder Agreement PDF'], false),
    (_org, fw_gov, s1, 'Non-Disclosure Agreement (NDA) Template',
      'Recommended template for confidentiality with employees, contractors, and partners. Protects trade secrets and know-how.',
      'Managing Director', array['NDA template PDF'], false),
    (_org, fw_gov, s1, 'Founder / Board Decisions Log',
      'Recommended internal log of significant early decisions beyond formal board minutes. Provides an audit trail.',
      'Board', array['Decision log document'], false);

  -- Step 2
  insert into public.obligations (org_id, framework_id, source_id, playbook_step_id, title, why, responsible, evidence_requirements, is_required) values
    (_org, fw_acct, src_book, s2, 'Business Bank Account',
      'A separate business bank account is required to keep company funds separate from private funds and to satisfy the Accounting Act.',
      'Managing Director', array['Bank account confirmation'], true),
    (_org, fw_acct, src_book, s2, 'Accounting System Active',
      'The Accounting Act requires a bookkeeping system from day one — transactions must be recorded chronologically.',
      'Accountant', array['Accounting system agreement or invoice'], true),
    (_org, fw_corp, src_asa, s2, 'Shareholder Register (Aksjeeierbok)',
      'The Companies Act §4-5 requires the company to maintain a register of shareholders.',
      'Managing Director', array['Shareholder register document'], true);

  -- Step 3
  insert into public.obligations (org_id, framework_id, source_id, playbook_step_id, title, why, responsible, evidence_requirements, is_required) values
    (_org, fw_gov, src_asa, s3, 'First Board Minutes',
      'Board decisions must be recorded in minutes signed by attending members.',
      'Board', array['Signed board minutes PDF'], true),
    (_org, fw_gov, src_asa, s3, 'Equipment Purchase Resolution',
      'When founders sell privately owned equipment to the company, a documented board resolution and receipts protect against disputes and tax risk.',
      'Board', array['Board resolution', 'Original receipts or valuation'], true);

  -- Step 4
  insert into public.obligations (org_id, framework_id, source_id, playbook_step_id, title, why, responsible, evidence_requirements, is_required) values
    (_org, fw_gov, null, s4, 'Business Insurance',
      'Most operating companies need liability and content insurance from day one.',
      'Managing Director', array['Active insurance policy'], true),
    (_org, fw_acct, src_book, s4, 'Tax Registrations (MVA if applicable)',
      'VAT registration is required once taxable turnover reaches NOK 50 000 in a 12-month period.',
      'Accountant', array['Registration confirmation'], true),
    (_org, fw_gov, null, s4, 'HSE Policy (Internkontroll)',
      'Companies with employees must have a written internal control system for health, safety and environment.',
      'Managing Director', array['Written HSE policy'], true);

  -- Step 5
  insert into public.obligations (org_id, framework_id, source_id, playbook_step_id, title, why, responsible, evidence_requirements, is_required) values
    (_org, fw_gov, src_asa, s5, 'Annual General Meeting Minutes',
      'The Companies Act requires an ordinary general meeting within six months of the financial year end.',
      'Board', array['Signed AGM minutes'], true),
    (_org, fw_acct, src_book, s5, 'Annual Accounts Submitted',
      'Annual accounts must be adopted and submitted to Regnskapsregisteret each year.',
      'Accountant', array['Filed annual accounts'], true);
end $function$;
