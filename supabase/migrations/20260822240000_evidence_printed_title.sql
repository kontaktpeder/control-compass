-- Printed heading from the first page, used as the suggested display name.
ALTER TABLE public.evidence
  ADD COLUMN IF NOT EXISTS printed_title text;
