# Module Contract v1 — Control Core Compliance

Control Core implements Platform Module Contract v1.
Spec (frozen): `platform-nexus/docs/MODULE_CONTRACT.v1.md`

- contract_version: **1.0**
- module_slug: **control**
- key prefix: `cc_live_`

## Endpoints

| Endpoint | Method | Scope |
|----------|--------|-------|
| `/api/public/v1/module/health` | GET | — |
| `/api/public/v1/module/info` | GET | — |
| `/api/public/v1/module/organization` | GET | `platform:read` |
| `/api/public/v1/module/organization/{org_id}` | GET | `platform:verify` |
| `/api/public/v1/module/widgets?ids=...` | GET | `platform:read` |

Wrong `org_id` on verify → **404** (not 403).

## Deep links

| key | path |
|-----|------|
| `org_home` | `/o/{org_id}` |
| `org_workflows` | `/o/{org_id}/workflows` |
| `org_evidence` | `/o/{org_id}/evidence` |
| `org_tasks` | `/o/{org_id}/tasks` |
| `org_obligations` | `/o/{org_id}/obligations` |

## Widgets

`GET /module/info` registers widgets; live values via `/module/widgets`.

| id | title | deep_link |
|----|-------|-----------|
| `open_tasks` | Open tasks | `org_tasks` |
| `open_obligations` | Open obligations | `org_obligations` |

## Agreements (domain write — Nexus handoff)

Control owns agreements (draft → review → signing → signed → archived).
Nexus/Fortell may only **create drafts**; signing/version/archive stay in Control.

| Endpoint | Method | Scope |
|----------|--------|-------|
| `/api/public/v1/agreements` | POST | `agreements:write` or `platform:read` |
| `/api/public/v1/agreements/{id}` | GET | `agreements:read` or `platform:read` |

POST body: `{ title, body, agreement_type?, counterparty_name?, source?, source_ref?, metadata? }`  
Creates `status: draft`, `source: nexus_fortell` when called from Fortell.

## Capabilities

- `platform.health`
- `platform.organization.read`
- `platform.organization.verify`
- `control.obligations`
- `control.evidence`
- `control.tasks`
- `control.playbooks`
- `control.agreements`
- `control.agreements.write`

## Platform verify key

Org → Settings → create platform-verify key.
Scopes: `platform:read` + `platform:verify` only.

## curl

```bash
BASE="https://<control-deploy-url>"
KEY="cc_live_..."

curl -s "$BASE/api/public/v1/module/health" | jq .module_slug    # "control"
curl -s "$BASE/api/public/v1/module/info"   | jq .module_slug

ORG=$(curl -s "$BASE/api/public/v1/module/organization" \
  -H "Authorization: Bearer $KEY" | jq -r .organization.id)

curl -s "$BASE/api/public/v1/module/organization/$ORG" \
  -H "Authorization: Bearer $KEY" | jq .verified   # true

# Wrong org → 404
curl -s -o /dev/null -w "%{http_code}\n" \
  "$BASE/api/public/v1/module/organization/00000000-0000-4000-8000-000000000001" \
  -H "Authorization: Bearer $KEY"
```
