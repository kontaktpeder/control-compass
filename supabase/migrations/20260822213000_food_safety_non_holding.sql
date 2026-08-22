-- Food Safety belongs on every non-holding org (operating, sole_prop, other).
CREATE OR REPLACE FUNCTION public.seed_food_safety_playbook(_org uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  fw_food uuid;
  src_mat uuid; src_hyg uuid; src_merk uuid;
  pb uuid;
  s1 uuid; s2 uuid; s3 uuid;
begin
  if exists (
    select 1 from public.organizations
    where id = _org and kind = 'holding'
  ) then
    return;
  end if;

  if exists (select 1 from public.playbooks where org_id = _org and slug = 'food_safety') then
    return;
  end if;

  insert into public.frameworks(org_id, name, description) values
    (_org, 'Food Safety', 'Mattilsynet registration, IK-Mat, traceability, and labelling.')
    returning id into fw_food;

  insert into public.sources(org_id, framework_id, authority, reference, url) values
    (_org, fw_food, 'Food Act (Matloven)', 'LOV-2003-12-19-124',
     'https://lovdata.no/dokument/NL/lov/2003-12-19-124') returning id into src_mat;
  insert into public.sources(org_id, framework_id, authority, reference, url) values
    (_org, fw_food, 'Food Hygiene Regulation (Næringsmiddelhygieneforskriften)', 'FOR-2008-12-22-1623',
     'https://lovdata.no/dokument/SF/forskrift/2008-12-22-1623') returning id into src_hyg;
  insert into public.sources(org_id, framework_id, authority, reference, url) values
    (_org, fw_food, 'Food Information Regulation (Matinformasjonsforskriften)', 'FOR-2014-11-28-1497',
     'https://lovdata.no/dokument/SF/forskrift/2014-11-28-1497') returning id into src_merk;

  insert into public.playbooks(org_id, slug, name) values
    (_org, 'food_safety', 'Food Safety') returning id into pb;

  insert into public.playbook_steps(playbook_id, org_id, order_index, title, description) values
    (pb, _org, 1, 'Register with Mattilsynet',
     'Register the food business and document the production premises before start-up.')
    returning id into s1;
  insert into public.playbook_steps(playbook_id, org_id, order_index, title, description) values
    (pb, _org, 2, 'Establish IK-Mat',
     'Written hygiene procedures and temperature control based on HACCP.')
    returning id into s2;
  insert into public.playbook_steps(playbook_id, org_id, order_index, title, description) values
    (pb, _org, 3, 'Traceability and labelling',
     'Trace ingredients and finished goods; label allergens and storage conditions.')
    returning id into s3;

  insert into public.obligations (org_id, framework_id, source_id, playbook_step_id, title, why, responsible, evidence_requirements, is_required, legal_citation, legal_url) values
    (_org, fw_food, src_hyg, s1, 'Mattilsynet Food Business Registration',
      'A food business must be registered with Mattilsynet before starting production or sale. Implemented via the Food Hygiene Regulation (EU 852/2004 art. 6).',
      'Managing Director', array['Mattilsynet registration confirmation'], true,
      'Næringsmiddelhygieneforskriften, jf. forordning (EF) nr. 852/2004 art. 6',
      'https://lovdata.no/dokument/SF/forskrift/2008-12-22-1623'),
    (_org, fw_food, src_hyg, s1, 'Production Premises Hygiene',
      'Premises must be suitable for food production: layout, water, waste, pest control, and surfaces that can be cleaned (Food Hygiene Regulation Annex II).',
      'Managing Director', array['Premises description or layout', 'Photos or inspection notes'], true,
      'Næringsmiddelhygieneforskriften vedlegg II',
      'https://lovdata.no/dokument/SF/forskrift/2008-12-22-1623'),
    (_org, fw_food, src_hyg, s2, 'IK-Mat Procedures (HACCP)',
      'Food businesses must have procedures based on HACCP principles covering receipt, cooking, cooling, storage, and dispatch (EU 852/2004 art. 5).',
      'Managing Director', array['Written IK-Mat / HACCP procedures'], true,
      'Næringsmiddelhygieneforskriften, jf. forordning (EF) nr. 852/2004 art. 5',
      'https://lovdata.no/dokument/SF/forskrift/2008-12-22-1623'),
    (_org, fw_food, src_hyg, s2, 'Temperature Logging',
      'Cold chain and cooking temperatures must be controlled and recorded so unsafe food is not released.',
      'Managing Director', array['Temperature log (cool / freeze / cook / oil)'], true,
      'Næringsmiddelhygieneforskriften vedlegg II kap. IX',
      'https://lovdata.no/dokument/SF/forskrift/2008-12-22-1623'),
    (_org, fw_food, src_mat, s3, 'Traceability Records',
      'You must be able to trace ingredients one step back and finished goods one step forward (General Food Law art. 18).',
      'Managing Director', array['Batch / lot log', 'Supplier list'], true,
      'Matloven, jf. forordning (EF) nr. 178/2002 art. 18',
      'https://lovdata.no/dokument/NL/lov/2003-12-19-124'),
    (_org, fw_food, src_merk, s3, 'Allergen and Labelling Control',
      'Prepacked food must declare allergens and storage conditions (Food Information Regulation, EU 1169/2011).',
      'Managing Director', array['Label template', 'Allergen list'], true,
      'Matinformasjonsforskriften, jf. forordning (EU) nr. 1169/2011',
      'https://lovdata.no/dokument/SF/forskrift/2014-11-28-1497');
end
$function$;
