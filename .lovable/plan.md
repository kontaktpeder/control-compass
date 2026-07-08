# Control Core — v1 Plan

Build one complete vertical slice around the **Incorporate a Company** playbook that demonstrates the full loop: Organization → Playbook → Obligations → Evidence → AI Assessment → Tasks → Dashboard. Multi-org from day one. Cool slate design. Real persistence via Lovable Cloud and real AI via Lovable AI.

## Scope (in)

- Auth (email/password + Google) via Lovable Cloud
- Multi-organization model with membership + role; org switcher in the shell
- Playbook: "Incorporate a Company" with 5 steps and seeded obligations
- Evidence upload to Cloud Storage, linked to obligations
- AI document classification (Gemini vision on PDF/image) that suggests which obligation(s) an uploaded file supports
- AI assessment per obligation: `satisfied | partially_satisfied | missing | needs_review | unknown` + confidence + reasoning + missing-evidence list
- Auto-generated tasks from obligations that are not yet satisfied
- Dashboard: playbook progress, counts by status, upcoming/expiring, tasks, per-obligation confidence
- "Are we in control?" summary card that honestly shows unknowns

## Scope (out, deferred)

- Other playbooks (Hire Employee, AGM, GDPR, Food Safety)
- Full Agreements object with clause conflict detection
- Governance history / versioning graph
- Morning Brief, integrations with Finance/Work Core
- Roles beyond `owner` / `member`

## Data model (Lovable Cloud / Postgres, RLS on everything)

```text
profiles(id → auth.users, full_name)
organizations(id, name, org_number, kind: holding|operating|sole_prop|other, created_by)
memberships(org_id, user_id, role: owner|member)  — org scoping
user_roles(user_id, role app_role)                — platform-level admin (per user-roles rule)

frameworks(id, org_id, name, description)         — seeded per org: Corporate Law, Accounting, Governance
sources(id, org_id, framework_id, authority, reference, effective_date)

playbooks(id, org_id, slug, name, status)         — one per org: incorporate_company
playbook_steps(id, playbook_id, order_index, title, description)

obligations(id, org_id, framework_id, source_id, playbook_step_id,
            title, why, responsible, due_at, status derived,
            evidence_requirements text[])
evidence(id, org_id, obligation_id nullable, uploaded_by,
         file_path, file_name, mime_type, size, ai_summary, ai_confidence)
evidence_links(evidence_id, obligation_id, relevance, ai_reasoning)   — many-to-many

assessments(id, obligation_id, status, confidence, reasoning,
            missing_evidence text[], created_at)
tasks(id, org_id, obligation_id, title, description,
      status: open|done|dismissed, due_at, generated_by: ai|user)
```

RLS: every row scoped by `org_id` and gated through `memberships`. Roles table separate from profiles (per platform rule). GRANTs added in every migration.

## Screens / routes

```
/auth                       — sign in / up
/                           — org picker or redirect to last org
/_authenticated/
  o/$orgId/                 — Dashboard: control summary + progress + tasks
  o/$orgId/playbook         — Incorporate a Company: steps, obligations, progress
  o/$orgId/obligations      — All obligations, filter by status
  o/$orgId/obligations/$id  — Detail: why, evidence, assessment, history
  o/$orgId/evidence         — All evidence, upload, AI-suggested links
  o/$orgId/tasks            — Tasks list
  o/$orgId/settings         — Org info, members
/new-organization           — create + seed frameworks + playbook
```

Shell: left sidebar with org switcher, sections; header shows current org and "Confidence: X%" honest indicator.

## AI (Lovable AI Gateway, server-side only)

Server functions in `src/lib/ai.functions.ts`:

- `classifyEvidence(evidenceId)` — sends the file (image/PDF as base64) + list of obligation titles + step context to `google/gemini-2.5-flash`; returns structured JSON `{ summary, suggestedObligationIds[], reasoning, confidence }`. Persists `evidence_links` as suggestions.
- `assessObligation(obligationId)` — sends obligation (title, why, requirements) + linked evidence summaries to `openai/gpt-5.5` with structured output → `{ status, confidence, reasoning, missing_evidence[] }`. Persists an `assessments` row.
- `generateTasks(orgId)` — for every obligation whose latest assessment is not `satisfied`, upsert a task with a clear title (e.g. "Upload Articles of Association").

Trigger: after evidence upload → classify → assess touched obligations → regenerate tasks. Also a manual "Re-run assessment" button on each obligation.

Every AI result stores reasoning + confidence and is shown verbatim. Never displays "100% compliant" — dashboard uses the honest status vocabulary.

## Seeded content (on org creation)

Frameworks: Corporate Law, Accounting, Governance.
Playbook steps + obligations for **Incorporate a Company**:

1. Register Holding Company — Articles of Association, Incorporation Certificate, Share Capital Confirmation, Board Info, MD appointment
2. Register Operating Company — same set
3. Establish Company Structure — Bank confirmation, Accounting setup, Shareholder Register, Initial Board Minutes (per entity)
4. First Board Resolution — Signed board resolution (equipment purchase example)
5. Operational Readiness — Insurance, Tax registration, Contracts, HSE policy

Each obligation has `why` copy citing the relevant source.

## Design (Cool slate)

Tokens in `src/styles.css`:
- Background `oklch(0.985 0.003 250)` / foreground `oklch(0.15 0.03 260)`
- Primary `oklch(0.55 0.15 255)` (muted navy-blue)
- Muted `oklch(0.96 0.006 255)`, border `oklch(0.9 0.01 255)`
- Status: satisfied slate-green, partial amber, missing muted red, unknown gray — all desaturated, never alarming
- Inter for body, Inter tight for headings; generous whitespace, thin borders, small caps section labels
- No progress bars claiming 100%; use `12 known · 7 satisfied · 3 partial · 2 missing · confidence 68%`

## Build order

1. Enable Lovable Cloud + provision LOVABLE_API_KEY
2. Migrations: schema + RLS + GRANTs + seed function `seed_incorporate_playbook(org_id)`
3. Auth pages + `_authenticated` shell + org switcher + create-org flow (calls seed)
4. Design system tokens + core layout primitives (Sidebar, PageHeader, StatusPill, ConfidenceBadge)
5. Playbook + Obligations + Obligation detail screens
6. Evidence upload (Cloud Storage bucket `evidence`, private, RLS on `storage.objects` scoped by org)
7. AI server functions: classify → assess → generate tasks
8. Dashboard + Tasks
9. Verify end-to-end: sign up → create org → open playbook → upload a PDF → see AI classify + assess + create tasks → dashboard updates

## Verification

After build, run Playwright to: sign up, create "Gold of Sicily Holding AS", open playbook, upload a sample PDF, confirm evidence links + assessment + a generated task appear, and screenshot the dashboard.
