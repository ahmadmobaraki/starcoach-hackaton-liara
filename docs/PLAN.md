# راهبر — Liara Operations Copilot

**Implementation plan for the Liara hackathon MVP**

> A Persian, chat-first AI copilot that takes a non-technical website owner from “I have a project” to a live, monitored, healthy website on Liara — and explains or performs every step in between.
>
> The same Liara capabilities are exposed as a real MCP server so other agents (Claude Desktop, Cursor, custom agents) can use them.

---

## 1. Product intent

**One sentence:** A non-technical user talks to «راهبر» in Persian; the assistant inspects their real Liara account, recommends the right plan, deploys their project, watches health, diagnoses problems, and asks for explicit approval before any sensitive action.

**The scene:** A solo founder at 11 pm has a Next.js/Laravel/WordPress project and a Liara account. They do not know which plan to pick, how to package the source, why the site is slow, or why they see HTTP 500. They open one page and type: «سایتم رو راه بنداز» or «سایتم کند شده».

**What success feels like:** The assistant does the technical work, shows a clear plan and cost, pauses at a friendly approval card, streams progress, and ends with a URL plus a health summary. Anything it cannot do (paying, buying a domain at Irnic, KYC, code changes) becomes a short, exact checklist.

**Anti-goals:** A generic chatbot that invents Liara details. A dashboard full of raw metrics. A CLI-only tool. Silent high-risk actions. A generic AI-looking dark/neon admin panel.

---

## 2. Hackathon mapping

| Challenge criterion | How this MVP scores it |
|---|---|
| Liara API integration (100) | Real PaaS + IaaS + DNS calls; create app, upload source, deploy release, wait/verify, logs, metrics, restart, scale, plan change, envs, domains, VM create/power/resize |
| Intelligence (100) | Composite diagnostics engine: logs + releases + applets + metrics + domains + events → ranked hypotheses with evidence, confidence, and recommended action; post-action verification |
| UX (50) | Chat-first Persian/RTL panel, warm minimal design, plan cards, diagnosis cards, live operation rail, human approval cards, mobile-first |
| Stability / security (50) | Risk policy, approval store, audit log, secret redaction, no client-side Liara key, safe uploads, API limitation disclosure, MCP auth for HTTP |

---

## 3. Capability gradient (the core product rule)

Every step in the user journey falls into one of three buckets. The assistant must recognize the bucket and behave accordingly:

| Bucket | Examples | Behavior |
|---|---|---|
| **Agent can do it** | Read account/projects, recommend a plan, create app, upload source, deploy, restart, scale, change plan, update envs, add domain in Liara, check DNS/SSL, create/resize VM | Present 2–3 options, recommend the best one with reasons and live cost, then prepare the action and execute it after a human approval. It reports a before/after verification. |
| **User must do it, agent can verify** | Change DNS/NS at Irnic, pay/charge, KYC, SSH into a VM, change source code, install OS packages | Give a short, exact Persian runbook, say clearly why the agent cannot do it, and add an **«انجام دادم؛ بررسی کن»** action. When the user reports back, the agent calls a read tool (`liara_check_domain`, `liara_verify_project`, `liara_list_vms`, etc.) to verify and continues. |
| **User must do it, agent cannot verify** | KYC approval, registrar ownership changes, private SSH work | Give the best possible checklist, ask the user to report the result, and adapt the next steps based on that report. Never claim it verified something it cannot see. |

This is implemented in two places:

1. **Tool/schema behavior:** `liara_get_guide` returns `canAgentDo`, `cannotAgentDo`, `steps`, `verify` and `nextPrompt`. The Guide card renders the two lists and the “I did it; verify” button.
2. **Agent prompt:** the system prompt requires a capability check before each recommendation, an explicit limitation when applicable, and a read-tool verification after every user-reported manual step.

The UI never hides a manual step behind a fake “Done” state. It shows the exact records/steps and keeps the result open until the API confirms it.

---

## 3.1 MVP scope

### In scope

1. **Chat-first onboarding**
   - No setup wizard required. The first screen is a conversation.
   - Suggested starters: first deploy, slow site, HTTP 500, choose a plan, connect a domain.
   - Account and projects are read automatically from the server-side `LIARA_API_KEY`.

2. **Plan advisor**
   - Reads live plans from `GET /v1/me` (`plans.projects`, `plans.projectBundlePlans`).
   - Normalizes RAM, CPU, disk, monthly price, hourly price, availability.
   - Asks only the few questions that change the answer: framework, expected traffic, database/disk, budget.
   - Returns 2–3 options with why/why-not, monthly cost, and a recommended bundle plan.

3. **First deploy**
   - Detect platform (Next, Node, Laravel, PHP, Django, Flask, Python, React, Vue, Angular, static, Docker, Go, .NET).
   - Create app (`POST /v1/projects`).
   - Upload source archive (`POST /v2/projects/{app}/sources`).
   - Create release (`POST /v2/projects/{app}/releases`) with port, platform, envs, build args.
   - Poll release (`GET /v1/releases/{id}`, `GET /v2/releases/{id}/build-logs`).
   - Verify project status, release state, default URL, domains.
   - On failure: read build log tail, explain the failure, propose a fix.

4. **Monitoring**
   - Project list and detail.
   - Health summary: status, scale, plan, release state, CPU, RAM, disk, error count.
   - Logs with filters and redaction.
   - Metrics windows (1h / 6h / 24h) from summary + CPU + memory + network endpoints.
   - Background refresh on the UI (30s) for the active project.

5. **Diagnostics**
   - One composite MCP tool, `liara_diagnose_app`, gathers all evidence and returns a ranked diagnosis.
   - Deterministic heuristics, not an LLM guess:
     - failed/unhealthy release
     - app stopped (`scale = 0`)
     - OOM / memory pressure
     - CPU saturation
     - disk full
     - missing env / crash loop
     - database connection failures
     - port/health-check mismatch
     - TLS/domain issues
     - traffic spike
     - 5xx error burst
     - build failure
   - Each finding carries quoted evidence, a confidence score, and a recommended next step.
   - The agent explains the top 1–3 hypotheses and offers actions.

6. **Human-in-the-loop actions**
   - Every mutating tool is two-phase: `prepare` → user approval → `apply`.
   - Risk tiers: `low`, `medium`, `high`, `critical`.
   - The UI approval card shows: what will happen, affected resource, monthly/hourly cost delta, reversibility, and a plain-language reason.
   - Critical actions (delete app/VM) require typing the resource name.
   - The LLM can never approve its own action. Approval is a UI/REST decision, not an MCP tool.
   - Audit log for every prepared/approved/rejected/executed action.

7. **Approved remediation**
   - Restart app
   - Scale app on/off
   - Change plan (with cost preview from live plans)
   - Update env vars (values masked in UI, never echoed)
   - Toggle zero-downtime, default subdomain
   - Add a domain, enable SSL, check DNS
   - Rollback is *not* in MVP because the public OpenAPI does not document a rollback endpoint. The assistant explains how to redeploy a previous release/source instead.

8. **Manual-step handoff and verification**
   - Every guide card has an **«انجام دادم؛ بررسی کن»** action that sends the result back
     into the same chat/session.
   - The agent then calls a read tool (`liara_check_domain`, `liara_verify_project`,
     `liara_list_vms`, …) and either confirms the step or explains what is still missing.
   - This is the main UX difference between “AI gave me an article” and “AI is working with me”.

9. **Domains / Irnic guidance**
   - Create the domain in Liara and show the exact DNS records returned by Liara.
   - Explain the Irnic/registrar steps, nameserver changes, and propagation time.
   - Check DNS/SSL status by polling Liara.
   - Never claim it changed records at Irnic; the API cannot do that.

9. **VPS (IaaS)**
   - List live plans and operating systems.
   - List VMs, show power/state/IP/plan.
   - Create VM, power on/off/restart, resize, extend disk — all behind approval.
   - Explain that SSH and OS-level changes are outside the API and need the user/SSH.

10. **MCP surface**
    - Stdio server for Claude Desktop/Cursor (`npm run mcp`).
    - Streamable HTTP endpoint at `/api/mcp` for remote agents.
    - Tools, prompts, and resources (guides).
    - The web agent uses the *same* MCP server through an in-memory MCP transport; there is no second tool implementation.

11. **Guides for what AI cannot do**
    - Persian runbooks returned by `liara_get_guide` and rendered as cards.
    - Topics: first deploy, Irnic/domain, envs, Docker, database, VPS/SSH, billing, 500, slow site, logs, scale, limits.

### Out of scope (MVP)

- Real payment / wallet charging.
- Irnic API integration or registrar record changes.
- KYC/identity verification.
- SSH into VMs or arbitrary shell commands.
- File browser, mail, object storage (can be added later).
- Multi-user auth and per-user Liara keys (documented limitation; optional access code).
- Automatic rollback (no documented public endpoint).
- Full CI/CD GitHub App installation (only source upload and source ID reuse).

---

## 4. Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  Browser — Persian RTL chat panel                                  │
│  Next.js App Router · React 19 · Tailwind v4 · lucide icons        │
│  Chat timeline · approval cards · plan/diagnosis cards · health rail│
└───────────────▲───────────────────────────────┬────────────────────┘
                │ SSE (text, tool, artifact)     │ REST (approve/reject)
┌───────────────┴───────────────────────────────▼────────────────────┐
│  Next.js server                                                    │
│  /api/chat       agent loop (DeepSeek OpenAI-compatible)           │
│  /api/approvals  human decision → execute → resume                 │
│  /api/sources    safe upload/repack                                │
│  /api/projects   read-only dashboard data                          │
│  /api/mcp        Streamable HTTP MCP endpoint                      │
│                                                                    │
│  Agent ── MCP client (InMemoryTransport) ──┐                       │
│                                            │                       │
│  MCP server factory ◄──────────────────────┘                       │
│    tools · prompts · resources                                     │
│    ├── LiaraClient (PaaS / IaaS / DNS)                             │
│    ├── plans + recommender                                         │
│    ├── diagnostics engine                                          │
│    ├── guides                                                      │
│    ├── risk policy + approval store (file-backed)                  │
│    └── audit log                                                   │
└────────────────────────────────────────────────────────────────────┘
                │
                ▼
        Liara REST APIs
        api.liara.ir · iaas-api.liara.ir · dns-service.liara.ir
```

**Key decision:** one Next.js app, one MCP server factory. The panel's agent and external MCP clients use exactly the same tool definitions. No duplicated business logic.

### Repository layout

```
.
├── docs/
│   ├── PLAN.md                 ← this file
│   ├── DEMO.md                 ← 5-minute demo script
│   └── API-NOTES.md            ← verified endpoints and caveats
├── src/
│   ├── app/
│   │   ├── page.tsx            ← chat-first panel
│   │   ├── layout.tsx
│   │   ├── globals.css         ← fordi-inspired tokens
│   │   └── api/
│   │       ├── chat/route.ts
│   │       ├── approvals/[id]/route.ts
│   │       ├── projects/route.ts
│   │       ├── projects/[name]/route.ts
│   │       ├── sources/route.ts
│   │       ├── session/route.ts
│   │       ├── status/route.ts
│   │       └── mcp/route.ts
│   ├── components/
│   │   ├── chat/               ← timeline, composer, tool trace
│   │   ├── cards/              ← approval, plan, diagnosis, guide, deploy
│   │   └── shell/              ← header, health rail, project switcher
│   ├── lib/
│   │   ├── agent/              ← prompt, loop, stream, sessions
│   │   ├── mcp/                ← server factory, tools, prompts, resources
│   │   ├── liara/              ← client, types, plans, diagnostics
│   │   ├── guides/             ← Persian runbooks
│   │   ├── security/           ← redaction, risk policy, approval store, audit
│   │   └── utils/
│   └── mcp/stdio.ts            ← stdio entrypoint
├── tests/
├── .env.example
├── README.md
└── package.json
```

---

## 5. MCP tool catalog

### Read-only (`low` risk, auto-executable)

| Tool | Purpose |
|---|---|
| `liara_account` | Current user, team, available plans, balance-ish account summary. Never returns secrets. |
| `liara_list_projects` | All apps with status, plan, scale, deploy state. |
| `liara_get_project` | Full app detail, env **keys only**, network, plan, domains. |
| `liara_list_plans` | Normalized PaaS plans + bundle plans, optional framework filter. |
| `liara_recommend_plan` | Deterministic plan recommendation with reasons and costs. |
| `liara_app_logs` | Logs with window, release, severity filter, redaction, line cap. |
| `liara_app_metrics` | CPU/RAM/disk/network summary + series + threshold signals. |
| `liara_app_releases` | Releases, current release, states, git info, build log tail. |
| `liara_app_events` | Applets/events timeline. |
| `liara_diagnose_app` | Composite evidence gathering and ranked diagnosis. |
| `liara_list_domains` / `liara_check_domain` | Domains and DNS/SSL status. |
| `liara_list_vms` / `liara_vm_plans` / `liara_vm_os` | IaaS inventory. |
| `liara_get_guide` | Persian runbook for manual steps and limitations. |
| `liara_prepare_action` | Validate a mutation, compute risk/cost, return approval preview. |
| `liara_get_action` | Status of a prepared action. |

### Mutating (`medium`/`high`/`critical`, approval required)

| Action type | Risk | Liara calls |
|---|---|---|
| `create_app` | high | `POST /v1/projects` |
| `deploy_source` | high | `POST /v2/projects/{app}/sources`, `POST /v2/projects/{app}/releases` |
| `restart_app` | medium | `POST /v1/projects/{name}/actions/restart` |
| `scale_app` | high | `POST /v1/projects/{name}/actions/scale` |
| `change_plan` | high | `POST /v1/projects/{name}/resize` |
| `update_envs` | medium/high | `POST /v1/projects/update-envs` |
| `set_zero_downtime` | medium | `POST /v1/projects/{id}/zero-downtime/{status}` |
| `set_default_subdomain` | medium | `POST /v1/projects/{id}/default-subdomain/{status}` |
| `add_domain` | medium | `POST /v1/domains`, `POST /v1/domains/set-project` |
| `enable_ssl` | medium | `POST /v1/domains/provision-ssl-certs` |
| `create_disk` | high | `POST /v1/projects/{name}/disks` |
| `resize_disk` | high | `POST /v1/projects/{name}/disks/{dname}/resize` |
| `create_vm` | high | `POST /iaas /vm` |
| `vm_power` | high | `PATCH /vm/power/{id}` |
| `resize_vm` | high | `PATCH /vm/resize/{id}` |
| `delete_app` | critical | `DELETE /v1/projects/{name}` |
| `delete_vm` | critical | `DELETE /vm/{id}` |

### The two-phase action protocol

1. LLM calls `liara_prepare_action({ action, params, reason })`.
2. Server validates params, computes a **preview**, **risk**, **reversibility**, **cost impact**, and stores:
   `{ id, digest, action, params, risk, status: "pending", sessionId, expiresAt }`.
3. Tool returns:
   ```json
   {
     "status": "AWAITING_APPROVAL",
     "approvalId": "apr_...",
     "digest": "sha256...",
     "preview": { "title": "...", "changes": ["..."], "cost": {...} },
     "approveUrl": "/?approval=apr_..."
   }
   ```
4. The agent stops; UI renders an approval card.
5. User clicks **تأیید و اجرا** → `POST /api/approvals/{id}`.
6. Server verifies the approval is pending and not expired, marks it `approved`, calls
   `liara_apply_action({ approvalId, digest })` through MCP, and returns the result.
7. The agent resumes with a synthetic message: “این اقدام تأیید و اجرا شد؛ نتیجه: …”. It calls
   verification tools and explains the outcome.
8. If rejected, the agent receives “کاربر این اقدام را رد کرد” and must propose a safer alternative.

**Security property:** `liara_apply_action` refuses unless the approval store says `approved`.
The LLM cannot mark an approval as approved; there is no MCP tool for that. The approval ID/digest
alone is not enough.

### MCP prompts

- `deploy-new-app` — gather framework, source, budget; recommend; prepare deployment.
- `choose-plan` — ask only the questions that change the recommendation.
- `troubleshoot-500` — diagnose, rank causes, propose safe actions.
- `slow-site` — metrics + logs + plan pressure.
- `connect-domain` — Liara records + Irnic checklist.

### MCP resources

- `liara://guides/{topic}` — Persian runbooks.
- `liara://account/summary` — cached, redacted account summary.
- `liara://projects` — cached project list.

---

## 6. Agent design

**Model:** DeepSeek OpenAI-compatible endpoint from `.env`:
`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, optional `LLM_TEMPERATURE`.

**Loop:** OpenAI Chat Completions with tool calling. Max 8 tool rounds per user turn. Tool results are
truncated and summarized before being appended. The model never sees the Liara API key.

**Streaming events (SSE):**

```
event: meta        { sessionId, model }
event: status      { label: "در حال بررسی لاگ‌ها..." }
event: text        { delta: "..." }
event: tool_start  { id, name, displayName, risk }
event: tool_result { id, name, ok, summary, durationMs }
event: artifact    { kind: "diagnosis" | "plan" | "project" | "metrics" | "guide" | "deploy", data }
event: approval    { ...preview, approvalId, digest }
event: done        { messageId }
event: error       { message, code }
```

**System prompt rules (Persian):**

- You are «راهبر», a calm senior DevOps companion for Liara.
- Speak Persian, plain language, short paragraphs. No jargon unless you explain it.
- Use tools before making factual claims about the user’s account.
- Never invent plan names, prices, logs, or status. If data is missing, say so.
- Never expose secret values, full env values, API keys, or tokens.
- For any mutation: call `liara_prepare_action` and stop. Never ask the user to “confirm in chat” if
  an approval card is available. Never call `liara_apply_action` yourself.
- For incidents: gather evidence first, then give at most 3 ranked causes with confidence and one
  recommended next step. Offer to perform it if allowed.
- If the API cannot do something, say exactly what the user must do and call `liara_get_guide`.
- Ask at most one question at a time. Offer 2–3 concrete choices.
- After an action, verify the result with a read tool and report before/after.

**Session state:** `.data/sessions/{id}.json` with messages, artifacts, active project, pending
approval. Client stores only `sessionId` in `localStorage`.

**System prompt:** the editable source of truth is `prompts/raahbar-system.md`. It is loaded at
runtime with `{{active_project_line}}`, `{{date}}` and `{{active_project_details}}` placeholders.
`SYSTEM_PROMPT_PATH` can override the path; a minimal fallback keeps the app alive if the file is
missing.

**Why deterministic diagnostics:** the LLM is good at explaining; the engine is good at evidence.
The engine computes findings; the LLM prioritizes and communicates them. This avoids hallucinated
root causes and makes the demo repeatable.

---

## 7. Liara API integration notes (verified)

### Base URLs

| Service | Base URL |
|---|---|
| PaaS / DBaaS / account | `https://api.liara.ir` |
| IaaS | `https://iaas-api.liara.ir` |
| DNS | `https://dns-service.liara.ir` |
| Object Storage | `https://storage-service.liara.ir` |

Auth: `Authorization: Bearer <LIARA_API_KEY>`. Team requests add `?teamID=...`.

### Verified endpoints used

**Account / plans**
- `GET /v1/me` — user, versions, `plans.projects`, `plans.projectBundlePlans`,
  `plans.databases`, `plans.objectStorage`. This is the only public source of live plan data.
- `GET /v1/me/free-credit` — optional.
- `GET /v1/billing` — optional balance (check response shape before UI use).

**PaaS**
- `GET /v1/projects`
- `GET /v1/projects/{name}`
- `POST /v1/projects` body `{ name, planID, platform, bundlePlanID, network?, readOnlyRootFilesystem? }`
- `DELETE /v1/projects/{name}`
- `POST /v1/projects/{name}/actions/scale` body `{ scale: 0|1 }` (confirm shape with a real app)
- `POST /v1/projects/{name}/actions/restart`
- `POST /v1/projects/{name}/resize` body `{ planID }`
- `POST /v1/projects/update-envs` body `{ project, variables: [{ key, value }] }`
- `POST /v2/projects/{name}/sources` multipart `file` = `.tar.gz`
- `POST /v2/projects/{name}/releases` body:
  ```json
  {
    "build": { "cache": true, "args": {}, "dockerfile": null, "location": "iran" },
    "cron": null,
    "args": null,
    "port": 3000,
    "type": "next",
    "message": "deploy from راهبر",
    "disks": [],
    "envs": {},
    "gitInfo": null,
    "platformConfig": {},
    "sourceID": "..."
  }
  ```
- `GET /v1/releases/{id}` — release state, queue, failReason.
- `GET /v2/releases/{id}/build-logs?since=...` — build output.
- `GET /v2/projects/{name}/logs?start=<unix>&direction=forward&last_lines=true` — app logs.
- `GET /v1/projects/{name}/releases?page=1&count=50`
- `GET /v1/projects/{name}/applets`
- `GET /v1/projects/{name}/events`
- `GET /v1/projects/{name}/metrics/summary`
- `GET /v1/projects/{name}/metrics/cpu|memory|network-receive|network-transmit`
- `GET /v1/projects/{id}/disks`
- `POST /v1/projects/{name}/disks` body `{ name, size, mountTo? }` (verify)
- `POST /v1/projects/{name}/disks/{dname}/resize` body `{ size }` (verify)
- `GET /v1/domains` / `GET /v1/domains?project={app}`
- `POST /v1/domains` / `POST /v1/domains/set-project`
- `GET /v1/domains/{id}/check`
- `POST /v1/domains/provision-ssl-certs`
- `POST /v1/projects/{id}/zero-downtime/{status}`
- `POST /v1/projects/{id}/default-subdomain/{status}`

**IaaS**
- `GET /plans`, `GET /oss` on `https://iaas-api.liara.ir`
- `GET /vm`, `POST /vm`, `GET /vm/{id}`, `DELETE /vm/{id}`
- `PATCH /vm/power/{id}` body `{ action: "start" | "stop" | "restart" }` (verify exact values)
- `PATCH /vm/resize/{id}` body `{ plan }`
- `POST /vm/disk/{id}` body `{ size }`
- `GET /vm/disk/{id}`, `POST /vm/disk/{vmID}/{diskID}` body `{ newSize }`
- `GET /vm/operation/{id}`, `GET /vm/traffic-graph/{id}`, `GET /vm/traffic-volume/{id}`

**DNS**
- `GET /api/v1/zones`, `POST /api/v1/zones`, `GET /api/v1/zones/{zone}`
- `GET/POST /api/v1/zones/{zone}/dns-records`
- `PUT /api/v1/zones/{zone}/check`

### Platform values

`node`, `next`, `laravel`, `php`, `python`, `django`, `flask`, `dotnet`, `react`, `vue`,
`angular`, `static`, `docker`, `go`.

### Default ports

| Platform | Port |
|---|---|
| next | 3000 |
| react, vue, angular, static, php, laravel, django, flask, python | 80 |
| go | 8080 |
| dotnet | 80 |
| node, docker | 3000 (user can override) |

### Packaging

- Liara accepts a gzipped tar archive (`.tar.gz`) at the sources endpoint.
- Respect `.liaraignore`, `.dockerignore`, `.gitignore`; always exclude `node_modules`, `.git`,
  `.next`, `liara.json`, `.env` from the archive.
- 256 MB max source size.
- The web upload accepts `.zip`, `.tar`, `.tar.gz`; the server safely extracts to a temp dir,
  validates no path traversal/symlinks, then creates a `.tar.gz` with the project root at the
  archive root.

### Live plan data example (this account, for orientation only)

Available PaaS plans observed: `small-g2` (0.5 GB RAM / 0.5 CPU / 5 GB, 475,000 T/month),
`medium-g2` (1 / 1 / 10, 825,000), `standard-base-g2` (2 / 1 / 20, 1,475,000), up to
`express-g2`. Always read live values; never hardcode prices in the UI or prompt.

**Important price rule:** in `/v1/me`, the feature-bundle `displayPrice` is the **total** for the
hardware plan + bundle, not an add-on. The plan's own `displayPrice` corresponds to the standard
bundle. Do not add plan + bundle prices. The recommender and the approval preview both use the
bundle price as the total. See `src/lib/liara/plan-advisor.ts`.

**Balance:** `/v1/billing` returns a balance and minimum credit. The create-app preview compares the
monthly total with the balance and adds a warning; the agent must surface a 402 error as a billing
limitation, not a bug. The panel does not charge anything.

---

## 8. UX / visual direction (following fordi rules)

**Visitor mode:** Operate.

**Scene:** A solo founder at night, on a laptop, with a cup of tea, wanting the site to be live
before tomorrow. The interface should feel like a calm control desk, not a hacker terminal. Light
surface, warm paper tint, one confident blue-green accent, quiet motion.

**Direction name:** «مسیر» — the interface is organized as a route/rail. The signature moment is a
deployment rail that draws right-to-left as steps complete. The rest of the motion is feedback only.

**Palette (Restrained):**

| Role | Value | Use |
|---|---|---|
| bg | `#F5F3EE` | warm paper |
| surface | `#FFFFFF` | cards, composer |
| ink | `#18201D` | primary text |
| muted | `#66706B` | secondary text (4.5:1) |
| line | `#DDE1DA` | borders |
| accent | `#0F5C4E` | primary action, active rail |
| accent-soft | `#DCEEE8` | selected chips |
| accent-ink | `#FFFFFF` | text on accent |
| danger | `#B23A32` | destructive |
| warning | `#9A6414` | pending/risk |
| success | `#227A4B` | healthy |
| info | `#2E5A8A` | neutral info |

**Type:** Vazirmatn (body + display), fallback Tahoma. No letter-spacing, no italics on Persian.
Body line-height 1.8. Persian digits everywhere; inputs accept Latin and normalize. Currency: Toman,
thousands separators. Dates: Solar Hijri.

**Layout:**
- Desktop (RTL): right rail 300–320 px with brand, project switcher, health, quick actions;
  main chat column max 900 px; left-side context strip only on wide screens.
- Mobile first at 375 px: header with project chip; chat full width; composer fixed above safe area;
  health in a side drawer; approvals inline.
- Chat: welcome hero with 5 starter chips; assistant messages with a small route mark; tool trace
  as a compact expandable row; artifacts as cards; composer with attach, send, and a “secure”
  indicator.
- No nested cards. No hero-metric template. No gradient text. No glass. One icon library
  (lucide), 1.75 stroke.

**Signature rail:** a thin line with 5 nodes (ساخت → آپلود → بیلد → انتشار → دامنه) that fills
right-to-left only when real tool events arrive. On mobile it collapses to a single progress line.

**Accessibility:** focus-visible rings, 44 px controls, prefers-reduced-motion, ARIA live region for
streaming text, approval buttons have explicit labels, no color-only status.

**Persian copy principles:** verb-first buttons («تأیید و اجرا», «بررسی دوباره»), errors name the
problem and the way out, no machine-translated tone. Real project names and real numbers in demo
fixtures.

---

## 9. Security model

- Liara key stays server-side. Never included in client bundles, SSE, logs, or tool outputs.
- `redactSecrets` runs on logs, envs, errors, and tool results:
  - `LIARA_API_KEY`, `sk-...`, `Bearer ...`, `password=...`, connection strings, private keys.
- Env values are returned as `{ key, maskedValue: "••••1234" }`; update actions accept new values but
  never echo them.
- Approval store file-backed with 10-minute expiry, single-use, digest-bound.
- Critical actions require typed confirmation in the UI; the server also checks `confirmText`.
- MCP HTTP endpoint requires `MCP_AUTH_TOKEN` when set; otherwise binds to localhost in dev.
- Uploads: 50 MB request cap, 200 MB extracted cap, no symlinks, no `..`, allowed extensions.
- Audit log `.data/audit.jsonl` records action, risk, decision, result, timestamp, session hash.
- Rate limit: 20 chat turns/hour/session, 10 tool calls/turn.
- Production note: add real auth, per-user Liara keys, encrypted at rest, CSRF protection, and a
  proper database for approvals/sessions.

---

## 10. API limitations to disclose in the UI

1. **Irnic/registrar records** cannot be changed by Liara API. The assistant gives exact records and
   links; the user changes them.
2. **Payment, charging, invoices, KYC** are console-only.
3. **No documented rollback endpoint.** To revert, redeploy a known source/release; the UI explains.
4. **No SSH/shell** in this MVP. VPS OS-level operations need SSH.
5. **Some plan/feature data** is only in `GET /v1/me`; no dedicated public plans endpoint.
6. **Log retention and metrics windows** depend on the feature bundle (`maxLogsRetention`,
   `maxReportRetention`).
7. **Build limits** depend on bundle: deployments/day, source size, build timeout, zero-downtime.
8. **No per-user OAuth**: this demo uses one server-side API key. Production needs auth.
9. **Some OpenAPI fields are undocumented**; the client tolerates multiple response shapes and
   surfaces “not available via API” instead of guessing. Known codes such as
   `g2_plan_unavailable` and `402` are translated to actions (charge or choose another plan).
10. **The demo account may have low balance.** A create/deploy can return HTTP 402; the assistant
    explains how to charge in the Liara console and never claims the app was created.
11. **Rate limits are not documented**; the client retries GETs and backs off, and the agent is
    instructed to avoid bursts.
12. **Panel auth is intentionally minimal for the local MVP.** The Liara key remains server-side;
    production must add login, per-user keys, CSRF protection and an encrypted store.

---

## 11. Implementation order

1. **Foundation** — Next.js app, Tailwind tokens, Persian font, RTL shell, env validation.
2. **Liara client** — fetch wrapper, errors, types, plans, projects, logs, metrics, releases, IaaS.
3. **Intelligence** — plan recommender + diagnostics engine + guides (pure functions, unit-tested).
4. **Security** — redaction, risk policy, approval store, audit.
5. **MCP server** — tool registry, prompts, resources, stdio + HTTP.
6. **Agent** — system prompt, MCP client, tool loop, SSE streaming, session store.
7. **Approval flow** — prepare → UI card → approve → apply → verify → resume.
8. **UI** — chat timeline, composer, tool trace, artifacts, health rail, project switcher, onboarding.
9. **Deployment flow** — upload/repack, create app, deploy, poll, verify, error guidance.
10. **Polish** — empty/loading/error states, mobile 375, reduced motion, demo fixtures.
11. **Verification** — unit tests, mock integration tests, live read-only smoke test, build.
12. **Docs** — README, .env.example, demo script, API notes, limitations.

---

## 12. Acceptance criteria

- `npm run typecheck` and `npm run build` pass.
- `npm run mcp` starts a stdio MCP server; `npx @modelcontextprotocol/inspector` can list tools.
- `/api/mcp` exposes the same tools over Streamable HTTP (initialize + tools/list + tools/call).
- The UI loads in Persian/RTL at 375 px with no horizontal overflow.
- With the real key, the UI lists the real account and projects (currently zero projects).
- Asking «چه پلنی مناسب سایتم است؟» returns live plans and a reasoned recommendation.
- Asking «سایتم کند شده» on a project triggers `liara_diagnose_app`, shows evidence, and offers
  approval-gated remediation.
- No high-risk action executes without an approval record created by the UI.
- Approving a restart shows before/after status and a verification tool result.
- All API limitations are visible in a guide and in error messages.
- A 5-minute demo can show: onboarding → plan → deploy → monitor → diagnose → approve → verify,
  plus MCP tools in an external client.

---

## 13. Demo script (5 minutes)

1. **0:00–0:40 — Problem.** “A non-technical founder has a project, a Liara account, and no idea
   which plan or why the site is down.”
2. **0:40–1:30 — Chat-first onboarding.** Open the panel; the assistant reads the account and says
   there are no apps. User: «می‌خوام سایتم رو راه بندازم.» Assistant asks framework and traffic,
   then shows a live plan card with cost.
3. **1:30–2:40 — Deploy.** User approves creating the app and uploading the sample project. The
   operation rail fills; build logs stream; the assistant returns the URL and health summary.
   Show the exact approval card before creation (and the live total price from the bundle).
4. **2:40–3:40 — Incident.** User: «سایتم کند شده / خطای ۵۰۰ می‌ده.» Assistant calls diagnostics,
   shows CPU/RAM/error evidence, ranks causes, recommends a restart or plan change. User approves;
   the result is verified.
5. **3:40–4:30 — Domain + manual handoff.** User asks to connect a domain. Assistant creates the
   Liara domain, shows the records, and gives the Irnic checklist, explicitly saying it cannot
   change Irnic records. Click **انجام دادم؛ بررسی کن** and show the agent verifying with
   `liara_check_domain` and giving the next step.
6. **4:30–5:00 — MCP.** Show Claude Desktop/Cursor connected to `npm run mcp`, list tools, call
   `liara_diagnose_app` or `liara_recommend_plan`. End on the architecture slide: one MCP, one agent,
   one panel.

---

## 14. Environment

```dotenv
# Liara
LIARA_API_KEY=...
LIARA_TEAM_ID=                 # optional

# LLM (OpenAI-compatible; DeepSeek by default)
LLM_BASE_URL=https://api.deepseek.com
LLM_API_KEY=...
LLM_MODEL=deepseek-flash
LLM_TEMPERATURE=0.3

# App
APP_URL=http://localhost:3000
MCP_AUTH_TOKEN=                # required if /api/mcp is exposed
DATA_DIR=.data
APPROVAL_SECRET=               # optional; defaults to LIARA_API_KEY
LIARA_MCP_ALLOW_LOCAL_PATHS=false
LIARA_MCP_SOURCE_ROOT=
MAX_UPLOAD_MB=50
```

The existing `.env` contains `LIARA_API_KEY`, `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`,
`DEEPSEEK_MODEL`. The implementation accepts both naming schemes (`DEEPSEEK_*` and `LLM_*`).

---

## 15. Test plan

**Unit**
- plan recommender: small static site vs API vs DB-heavy vs high traffic; budget filter; unavailable
  plans excluded; price formatting.
- diagnostics: OOM, CPU, disk, 500 burst, DB refusal, stopped app, failed release, healthy.
- redaction: bearer tokens, sk- keys, env passwords, private keys.
- risk policy: every action type maps to the expected tier; critical requires confirmText.
- approval store: expiry, single-use, digest mismatch, rejection.

**Integration (mock Liara HTTP server)**
- MCP `tools/list` contains all tools.
- `liara_prepare_action` returns a preview and does not call Liara.
- `liara_apply_action` before approval returns `AWAITING_APPROVAL` and makes no mutation.
- After approval, apply calls the right endpoint exactly once.
- Deploy flow: create app → upload → release → poll → verify; build failure surfaced.
- Agent loop uses the in-memory MCP client and maps tool schemas correctly.

**Live read-only smoke**
- `GET /v1/me`, `/v1/projects`, `/v1/domains`, `/plans`, `/vm` with the provided key.
- No writes unless `LIARA_ALLOW_SPEND=true`.

**Manual UX**
- 375 px, 768 px, 1280 px; RTL; keyboard; reduced motion; empty/loading/error.

---

## 16. Future work

- Per-user Liara OAuth and encrypted key vault.
- Database provisioning and connection guidance.
- GitHub App / CI/CD integration.
- Rollback via release history.
- Background monitoring alerts (email/Telegram) and scheduled health checks.
- Full MCP elicitation support for approval in external clients.
- Object storage, mail, file browser.
- Multi-project “fleet” health view.
