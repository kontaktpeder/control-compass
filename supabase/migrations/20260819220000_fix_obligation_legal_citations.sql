-- Correct five obligation legal citations/URLs and Bokføringsloven source reference

UPDATE public.sources SET
  reference = 'LOV-2004-11-19-73',
  url = 'https://lovdata.no/dokument/NL/lov/2004-11-19-73'
WHERE reference = 'LOV-2004-07-02-73';

UPDATE public.obligations SET
  legal_citation = 'Aksjeloven § 3-1, § 2-12',
  legal_url = 'https://lovdata.no/dokument/NL/lov/1997-06-13-44/%C2%A73-1',
  why = 'The Companies Act §3-1 requires minimum share capital of NOK 30 000; payment must be completed under §2-12.'
WHERE title = 'Share Capital Confirmation';

UPDATE public.obligations SET
  legal_citation = 'Bokføringsloven § 6',
  legal_url = 'https://lovdata.no/dokument/NL/lov/2004-11-19-73/%C2%A76',
  why = 'A separate business bank account is required to keep company funds separate from private funds and satisfy traceability requirements under the Bookkeeping Act §6.'
WHERE title = 'Business Bank Account';

UPDATE public.obligations SET
  legal_citation = 'Bokføringsloven § 7',
  legal_url = 'https://lovdata.no/dokument/NL/lov/2004-11-19-73/%C2%A77',
  why = 'The Bookkeeping Act §7 requires bookkeeping from day one — transactions must be recorded chronologically.'
WHERE title = 'Accounting System Active';

UPDATE public.obligations SET
  legal_citation = 'Aksjeloven § 5-5',
  legal_url = 'https://lovdata.no/dokument/NL/lov/1997-06-13-44/%C2%A75-5',
  why = 'The Companies Act §5-5 requires an ordinary general meeting within six months of the financial year end.'
WHERE title = 'Annual General Meeting Minutes';

UPDATE public.obligations SET
  legal_citation = 'Regnskapsloven § 8-2',
  legal_url = 'https://lovdata.no/dokument/NL/lov/1998-07-17-56/%C2%A78-2',
  why = 'The Accounting Act §8-2 requires annual accounts to be submitted to Regnskapsregisteret after adoption.'
WHERE title = 'Annual Accounts Submitted';

-- Re-apply corrected seed function (matches 20260819213000 after fix)
CREATE OR REPLACE FUNCTION public.seed_incorporate_playbook(_org uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  fw_corp uuid; fw_acct uuid; fw_gov uuid;
  src_asa uuid; src_reg uuid; src_book uuid; src_bok uuid; src_mva uuid; src_aml uuid;
  pb uuid;
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid;
begin
  insert into public.frameworks(org_id, name, description) values
    (_org, 'Corporate Law', 'Formation, shares, governance under the Companies Act (Aksjeloven).') returning id into fw_corp;
  insert into public.frameworks(org_id, name, description) values
    (_org, 'Accounting', 'Bookkeeping and reporting under the Accounting Act.') returning id into fw_acct;
  insert into public.frameworks(org_id, name, description) values
    (_org, 'Governance', 'Board composition, resolutions, and internal controls.') returning id into fw_gov;

  insert into public.sources(org_id, framework_id, authority, reference, url) values
    (_org, fw_corp, 'Companies Act (Aksjeloven)', 'LOV-1997-06-13-44', 'https://lovdata.no/dokument/NL/lov/1997-06-13-44') returning id into src_asa;
  insert into public.sources(org_id, framework_id, authority, reference, url) values
    (_org, fw_corp, 'Brønnøysund Register Centre', 'Company registration', 'https://www.brreg.no/') returning id into src_reg;
  insert into public.sources(org_id, framework_id, authority, reference, url) values
    (_org, fw_acct, 'Accounting Act (Regnskapsloven)', 'LOV-1998-07-17-56', 'https://lovdata.no/dokument/NL/lov/1998-07-17-56') returning id into src_book;
  insert into public.sources(org_id, framework_id, authority, reference, url) values
    (_org, fw_acct, 'Bookkeeping Act (Bokføringsloven)', 'LOV-2004-11-19-73', 'https://lovdata.no/dokument/NL/lov/2004-11-19-73') returning id into src_bok;
  insert into public.sources(org_id, framework_id, authority, reference, url) values
    (_org, fw_acct, 'VAT Act (Merverdiavgiftsloven)', 'LOV-2009-06-19-58', 'https://lovdata.no/dokument/NL/lov/2009-06-19-58') returning id into src_mva;
  insert into public.sources(org_id, framework_id, authority, reference, url) values
    (_org, fw_gov, 'Working Environment Act (Arbeidsmiljøloven)', 'LOV-2005-06-17-62', 'https://lovdata.no/dokument/NL/lov/2005-06-17-62') returning id into src_aml;

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

  insert into public.obligations (org_id, framework_id, source_id, playbook_step_id, title, why, responsible, evidence_requirements, is_required, legal_citation, legal_url) values
    (_org, fw_corp, src_asa, s1, 'Articles of Association (Vedtekter)',
      'Required by the Companies Act §2-2. Defines the company name, purpose, share capital, and board structure.',
      'Founders', array['Signed Articles of Association PDF'], true,
      'Aksjeloven § 2-2', 'https://lovdata.no/dokument/NL/lov/1997-06-13-44/%C2%A72-2'),
    (_org, fw_corp, src_asa, s1, 'Incorporation Certificate (Stiftelsesdokument)',
      'Required by the Companies Act §2-1. Records that the company was formally founded, by whom, and on what date.',
      'Founders', array['Signed founding document'], true,
      'Aksjeloven § 2-1', 'https://lovdata.no/dokument/NL/lov/1997-06-13-44/%C2%A72-1'),
    (_org, fw_corp, src_asa, s1, 'Share Capital Confirmation',
      'The Companies Act §3-1 requires minimum share capital of NOK 30 000; payment must be completed under §2-12.',
      'Founders', array['Bank confirmation of paid-in capital'], true,
      'Aksjeloven § 3-1, § 2-12', 'https://lovdata.no/dokument/NL/lov/1997-06-13-44/%C2%A73-1'),
    (_org, fw_corp, src_asa, s1, 'Brønnøysund Registration (Foretaksregisteret)',
      'The company must be registered in Foretaksregisteret within three months of incorporation (Companies Act §2-18).',
      'Managing Director', array['Registration certificate (firmaattest)'], true,
      'Aksjeloven § 2-18', 'https://lovdata.no/dokument/NL/lov/1997-06-13-44/%C2%A72-18'),
    (_org, fw_gov, src_asa, s1, 'Managing Director & Board Appointment',
      'The Companies Act requires a duly appointed board and managing director for a limited company.',
      'Founders', array['Board resolution appointing MD', 'List of board members'], true,
      'Aksjeloven § 6-1, § 6-2', 'https://lovdata.no/dokument/NL/lov/1997-06-13-44/%C2%A76-1');

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

  insert into public.obligations (org_id, framework_id, source_id, playbook_step_id, title, why, responsible, evidence_requirements, is_required, legal_citation, legal_url) values
    (_org, fw_acct, src_bok, s2, 'Business Bank Account',
      'A separate business bank account is required to keep company funds separate from private funds and satisfy traceability requirements under the Bookkeeping Act §6.',
      'Managing Director', array['Bank account confirmation'], true,
      'Bokføringsloven § 6', 'https://lovdata.no/dokument/NL/lov/2004-11-19-73/%C2%A76'),
    (_org, fw_acct, src_bok, s2, 'Accounting System Active',
      'The Bookkeeping Act §7 requires bookkeeping from day one — transactions must be recorded chronologically.',
      'Accountant', array['Accounting system agreement or invoice'], true,
      'Bokføringsloven § 7', 'https://lovdata.no/dokument/NL/lov/2004-11-19-73/%C2%A77'),
    (_org, fw_corp, src_asa, s2, 'Shareholder Register (Aksjeeierbok)',
      'The Companies Act §4-5 requires the company to maintain a register of shareholders.',
      'Managing Director', array['Shareholder register document'], true,
      'Aksjeloven § 4-5', 'https://lovdata.no/dokument/NL/lov/1997-06-13-44/%C2%A74-5');

  insert into public.obligations (org_id, framework_id, source_id, playbook_step_id, title, why, responsible, evidence_requirements, is_required, legal_citation, legal_url) values
    (_org, fw_gov, src_asa, s3, 'First Board Minutes',
      'Board decisions must be recorded in minutes signed by attending members (Companies Act §6-29).',
      'Board', array['Signed board minutes PDF'], true,
      'Aksjeloven § 6-29', 'https://lovdata.no/dokument/NL/lov/1997-06-13-44/%C2%A76-29'),
    (_org, fw_gov, src_asa, s3, 'Equipment Purchase Resolution',
      'When founders sell privately owned equipment to the company, a documented board resolution and receipts protect against disputes and tax risk.',
      'Board', array['Board resolution', 'Original receipts or valuation'], true,
      'Aksjeloven § 6-29', 'https://lovdata.no/dokument/NL/lov/1997-06-13-44/%C2%A76-29');

  insert into public.obligations (org_id, framework_id, source_id, playbook_step_id, title, why, responsible, evidence_requirements, is_required, legal_citation, legal_url) values
    (_org, fw_gov, null, s4, 'Business Insurance',
      'Most operating companies need liability and content insurance from day one.',
      'Managing Director', array['Active insurance policy'], true,
      null, null),
    (_org, fw_acct, src_mva, s4, 'Tax Registrations (MVA if applicable)',
      'VAT registration is required once taxable turnover reaches NOK 50 000 in a 12-month period.',
      'Accountant', array['Registration confirmation'], true,
      'Merverdiavgiftsloven § 2-1', 'https://lovdata.no/dokument/NL/lov/2009-06-19-58/%C2%A72-1'),
    (_org, fw_gov, src_aml, s4, 'HSE Policy (Internkontroll)',
      'Companies with employees must have a written internal control system for health, safety and environment.',
      'Managing Director', array['Written HSE policy'], true,
      'Arbeidsmiljøloven § 3-1', 'https://lovdata.no/dokument/NL/lov/2005-06-17-62/%C2%A73-1');

  insert into public.obligations (org_id, framework_id, source_id, playbook_step_id, title, why, responsible, evidence_requirements, is_required, legal_citation, legal_url) values
    (_org, fw_gov, src_asa, s5, 'Annual General Meeting Minutes',
      'The Companies Act §5-5 requires an ordinary general meeting within six months of the financial year end.',
      'Board', array['Signed AGM minutes'], true,
      'Aksjeloven § 5-5', 'https://lovdata.no/dokument/NL/lov/1997-06-13-44/%C2%A75-5'),
    (_org, fw_acct, src_book, s5, 'Annual Accounts Submitted',
      'The Accounting Act §8-2 requires annual accounts to be submitted to Regnskapsregisteret after adoption.',
      'Accountant', array['Filed annual accounts'], true,
      'Regnskapsloven § 8-2', 'https://lovdata.no/dokument/NL/lov/1998-07-17-56/%C2%A78-2');
end $function$;
