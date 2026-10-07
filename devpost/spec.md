---
doc: spec
status: approved
approved: 2026-10-07
revision: 3
---

# Feynman-in-a-Loop — Technical Spec

Derives from approved `scope.md` and `prd.md`. Product behavior is fixed there; this document only decides *how*.

**Governing principles, preserved throughout:**
> **Provider enforces shape; application enforces meaning and authority.**
>
> **Persist the learner's evidence before depending on the model.**
>
> **The model proposes state; the server owns state.**
>
> **Retries must not create new evidence or consume the same successful turn twice.**

---

## How This Works, In Plain Language

There are five pieces.

**The browser page** is what the learner looks at. It's one Next.js app: the sidebar, the teaching room with the Student Orb, the live transcript, and the result screen. It also handles speech recognition through the browser's own API. Recognition is initiated and handled through the browser API — audio does not pass through our application server, but the browser implementation may send it to its own speech-recognition service. We make no offline or on-device privacy claim.

**The server** is our code, running and waiting to be asked things. Two things happen there and nowhere else. First, it holds the AI provider's secret key — a password that must never reach the browser, because anyone with the link could otherwise read it. Second, when you finish a turn, it saves your words, assembles a carefully chosen slice of session history, sends it to the AI, checks the answer is well-formed and legal, saves the result, and hands back only the part the learner is allowed to see. Saving your words happens **before** the AI is contacted, so a provider failure cannot cost you a 40-second explanation.

**The AI provider** is someone else's computer running the model — Groq's free tier. One request per turn, returning two clearly separated boxes: what the hidden evaluator concluded, and the student response shown to the learner. We never let those two boxes mix.

**Supabase** is our database and login. Supabase SSR stores the auth session in cookies using `@supabase/ssr`, allowing authenticated identity to be available to both browser and server code. Row Level Security means the database itself refuses to show your rows to anyone signed in as a different user — the database deciding, not our code.

**The evaluator** is not a separate service. It's a role the same model plays inside the private box, in the same request. It never speaks to the learner and never explains itself during a session.

One request per turn, not two, because the app is on a hard zero-dollar budget. And the whole thing is voice-first but not voice-dependent: the text path runs the identical engine, which is why a mic failure degrades instead of breaking.

**Every result is grounded in evidence.** When the app tells you what you taught, it cites turns that actually happened in your session — or says plainly that it did not get enough evidence to judge.

---

## The Core Journey Through the System

PRD ref: `prd.md > The Core Journey`.

**1. Arrive and authenticate.** Browser loads `/`. Landing states the inversion; **Start** routes to `/login`. Supabase Auth handles email + password via `@supabase/ssr`: a browser client for client components, a server client for Server Components and route handlers, and `proxy.ts` for token refresh.

> Supabase SSR stores the auth session in cookies using `@supabase/ssr`, allowing authenticated identity to be available to both browser and server code.

**Authorization note from Supabase's current docs, adopted:** on the server, verify identity with `supabase.auth.getClaims()` — it validates the JWT signature against the project's published public keys. **Never trust `supabase.auth.getSession()` in server code such as the proxy**, because cookies can be spoofed and it does not revalidate the token.

**2. Name the topic.** `/teach` with no session id shows the new-session view: one topic field, CTA **Start teaching**. Empty or whitespace-only input is rejected inline. Submitting inserts a row into `learning_sessions` with `status = 'in_progress'`, `stage = 'orient'`, empty mastery, and empty ledger, then routes to `/teach/[sessionId]`.

**3. Orient.** Server component loads the session. Client hydrates the teaching room; the orb renders `ready`. The client **feature-detects** `SpeechRecognition` at runtime — a capability check, not a permission request. On **Teach**, the orb moves `ready → listening`, the orientation line renders, and recognition starts. If permission is denied or the capability is absent, the corresponding recovery state from `prd.md > Voice failure states` renders in place and the session is untouched.

**4. Listen.** Interim recognition results render into the live transcript as the dominant center object. **Stop** finalizes accumulated text and posts it to the turn endpoint with a client-generated `clientTurnId`. The orb moves `listening → thinking` immediately.

**5. Evaluate.** The client POSTs the completed normalized learner turn. The client supplies evidence and provenance only — it does **not** classify its own turn:

```json
{ "clientTurnId": "uuid", "source": "voice", "content": "…" }
```

The server, in this exact order:

```
authenticate (getClaims)
→ verify session ownership and status
→ validate input
→ insert learner turn                       ← evidence persisted before the model is involved
→ derive interaction_type from session stage (server owns meaning)
→ claim_model_call(...)                     ← quota consumed BEFORE any provider call
→ build bounded context
→ call provider (one request)
→ validate: shape → meaning → public/private boundary
→ apply_turn_result(...)                    ← atomic; links the student response to the learner turn
→ respond with sanitized public state only
```

**The client supplies evidence; the server assigns its meaning.** The client cannot claim its text is a `correction` or a `transfer_answer` by changing a request field — the server derives `interaction_type` from the authoritative current stage:

```
explain | diagnose → explanation
repair            → correction
transfer          → transfer_answer
```

**Quota is claimed before the provider is contacted**, not after a successful response. See **Authoritative Quota — `claim_model_call`** below.

**6. Respond.** The orb transitions per the validated public state, the student response is shown, and the transcript gains a `student_question` or `misconception` row linked to the learner turn it answers. **Type instead** swaps the control surface; the submitted text follows the identical path from step 5 onward — same session id, same stage, same pipeline.

**7. Transfer, assess, complete.** The same single-call loop drives REPAIR → TRANSFER → ASSESS. When the evaluator proposes completion, the server verifies evidence requirements, writes the final `mastery_result`, sets `status = 'completed'`, and the session freezes. The result view renders read-only.

**8. Return.** `/sessions` lists attempts. A completed attempt renders read-only; no control appends a turn. **Teach again** inserts a *new* row with the same topic, empty evaluator state, and a new id.

### Turn endpoint contract

```
POST /api/sessions/[id]/turns
{ "clientTurnId": "uuid", "source": "voice" | "typed", "content": "string" }

200 OK
{ "student": { "state": "confused", "message": "Would this still work if the list wasn't sorted?" },
  "publicStage": "repair" }
```

The response is **sanitized public state only**. The browser receives the student response and the UI stage it needs to render — never the private evaluator object, mastery dimensions, target gap, or evidence ledger, even though the client needs to render `Testing` or `Thinking`. `publicStage` is a purpose-named field precisely so the private object is never the accidental return type.

Request-in/response-out is one round trip. **No streaming.** Streaming would imply the student speaks while thinking, which `prd.md > States and Boundaries` forbids, and it would render unvalidated text.

---

## Stack

| Concern | Choice | Rationale |
|---|---|---|
| Framework | **Next.js 16.x** (App Router), React 19.2, TypeScript 5+ | Current stable (released 21 Oct 2025). Fresh project — no reason to pin the previous major |
| Network boundary | **`proxy.ts`** | Replaces `middleware.ts` in Next 16; `middleware` is deprecated and will be removed. Proxy runs on Node.js runtime |
| Styling | **Tailwind CSS v4** + shadcn/ui | shadcn primitives only — no collage of component libraries |
| Icons | **lucide-react** | Per `context.md` |
| Database + Auth | **Supabase** — `@supabase/ssr` + `@supabase/supabase-js`, Postgres, RLS | One service for identity, persistence, authorization |
| ORM | **None.** Runtime access via Supabase client; schema/RLS/triggers/functions via SQL migrations | Learner decision: an ORM adds a second database access path and authorization model without value here. Supabase-generated TS types for typing |
| Schema validation | **Zod** | Runtime validation; also generates the JSON Schema sent to Groq |
| AI provider (hosted) | **Groq** — `openai/gpt-oss-20b` or `120b`, `strict: true` structured outputs | 30 RPM / 1,000 RPD / 8K TPM / **200K TPD** free tier |
| AI provider (local) | **Ollama** | Dev iteration, corpus runs, adversarial tests |
| Speech recognition | **Web Speech API** (`SpeechRecognition`), **feature-detected at runtime** | Zero cost, no key. Limited availability; Chrome/Chromium is the tested demo target, **Type instead** is the guaranteed fallback |
| Deployment | **Vercel** | Per `context.md` |

**Runtime requirements (Next 16):** Node **20.9+**, TypeScript 5.1+. Turbopack is stable and the default.

**Model selection is deferred to a benchmark, not decided here.** Build the adapter, run the 20B-vs-120B reliability benchmark, and pick the smaller/faster model that passes. Use 120B only if 20B is materially less reliable.

**Unverified and flagged.** Groq quota figures come from the learner's check of official docs (2026-10-07) — re-verify, free tiers change often. **200K TPD is the binding constraint**, not the 1,000 RPD. Structured output support with `strict: true` on the chosen model must be confirmed on the first real call; constrained decoding has documented schema restrictions.

---

## Where It Runs and How Someone Tries It

**Runtime:** Node 20.9+ locally; Vercel serverless in production. Demo target: Chrome/Chromium.

**Environment variables:**

```
# .env.local — never commit.
# Reads use the publishable key + authenticated user's session (RLS).
# Authoritative evaluator/quota writes use a SERVER-ONLY Supabase secret key.
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=          # SERVER ONLY — never NEXT_PUBLIC_
GROQ_API_KEY=                 # SERVER ONLY
AI_PROVIDER=groq              # groq | ollama
GROQ_MODEL=                   # set after benchmark
OLLAMA_BASE_URL=http://localhost:11434   # dev only
```

**Revision 3 security correction.** Implementation exposed a contradiction in the earlier design: if `apply_turn_result` is executable by `authenticated`, a browser with a valid user JWT can call it directly and forge stage/mastery/evidence without passing through the Next.js validation pipeline. The fix is a server-only Supabase secret key (`SUPABASE_SECRET_KEY`) used only for evaluator/quota RPCs. Reads still use the normal authenticated client and RLS. The secret key never reaches browser code.

`.env.example` ships with placeholders only. No private secret uses a `NEXT_PUBLIC_` prefix except Supabase's publishable key, which is designed to be public.

**Start commands:**

```bash
npm install
cp .env.example .env.local     # fill in real values
npm run dev                    # http://localhost:3000
```

**Demo recording path (required for submission):** `npm run dev` → `http://localhost:3000` → sign in with a clean demo account → **New Session** → `Binary Search` → **Start teaching**. Deployment is optional and never a substitute for the required video and public repo.

---

## Look and Feel

Carried forward from `prd.md > Look and Feel` and `scope.md > Inspiration & Identity`. Direction only.

**Palette.** Dark calm neutral base (near-black, slight blue cast). One accent used *only* for active microphone, focus rings, current student state, and the mastery transition. Everything else is neutral. No decorative gradients.

**Typography.** Editorial serif or humanist sans for headings and the topic label. Highly readable sans for the transcript body at generous line-height and measure — the transcript is long-form reading. Small-caps or tabular treatment for dimension labels and status badges. The character comes from weight and spacing, not a custom font pipeline.

**Density and energy.** Spacious and calm. Generous padding around the orb and current transcript. A room, not a dashboard.

**Orb.** The signature object. Soft layered radial gradients with slow, restrained motion. Motion is semantic: amplitude scales with live mic level, phase drifts while thinking, edges destabilize during confusion, everything settles on understanding, one brief expansion on mastery. Every state also has a text label, so the orb is never the sole signal. All motion behind `prefers-reduced-motion`.

**Copy tone.** Quiet and plain. Orientations like "I'm listening. Teach me Binary Search." Failure copy names the actual cause — "Voice input stopped unexpectedly," not "Something went wrong."

**Named references** (qualities, not copies): Figma Docs for editorial spacing, Claude for calm typography, Perplexity for hierarchy, ChatGPT for sidebar convention.

---

## Components

### Session Machine (server, `lib/ai/machine.ts`)
The authority on legal transitions. Consumes the evaluator's proposal, returns accept or reject.

```
orient   → explain
explain  → diagnose            (or explain, if evidence still too thin)
diagnose → repair | diagnose
repair   → transfer | repair   (stay on the gap until resolved or follow-up spent)
transfer → assess  | transfer  (transfer → transfer illegal once the one
                                permitted follow-up has been spent)
assess   → completed
```

**Rejections (fail closed):**
- any transition on a `completed` session;
- `repair → transfer` without validated repair evidence for the targeted gap;
- any transition to `assess` or `completed` without all four dimensions present in the validated evidence ledger;
- `transfer → transfer` after the single permitted transfer follow-up has been spent — proceeding to `assess` is what should happen instead;
- a proposed stage not reachable from the current stage.

Rejection returns a typed error; the learner turn stays persisted, state does not advance, and the UI shows a recoverable error. **The model proposes; the server disposes.**

### Evaluator Prompt and Schema (`lib/ai/prompts/`, `lib/ai/schemas/turn.ts`)
One system instruction producing two strictly separated output sections. Trusted instructions and untrusted learner content are separate structured fields — never concatenated. Learner speech is delimited and labeled as data.

The provider-facing schema must satisfy **Groq strict-mode requirements**: every property required, every object `additionalProperties: false`. Optional fields are therefore expressed as **required and nullable**, never `optional()`.

```ts
TurnOutput = z.object({
  evaluation: z.object({
    stage: z.enum(['orient','explain','diagnose','repair','transfer','assess','completed']),
    studentState: z.enum(['ready','listening','thinking','confused','corrected',
                           'testing','understanding','mastered','error']),
    dimensions: z.object({
      coreIdea: DimensionState,
      mechanism: DimensionState,
      misconceptionRepair: DimensionState,
      transfer: DimensionState,
    }),
    targetGap: z.string().max(160).nullable(),
    nextAction: z.enum(['clarify','probe','misconception','transfer','assess','complete']),
    shouldComplete: z.boolean(),
    evidence: z.array(z.object({
      dimension: z.enum(['coreIdea','mechanism','misconceptionRepair','transfer']),
      turnId: z.string(),                        // must exist in this session
      type: z.enum(['explanation','probe','correction','transfer_answer']),
      summary: z.string().max(280),             // grounded paraphrase is fine
      quote: z.string().max(160).nullable(),    // required key; null when absent
    })).max(8),
  }),
  student: z.object({
    state: z.enum([...]),                       // must not contradict evaluation
    message: z.string().max(280),
  }),
})
```

`DimensionState = 'untested' | 'weak' | 'partial' | 'mastered'`.

Server-side Zod validation runs regardless of provider strict mode — schema compliance and application validity are separate concerns.

The student prompt forbids tutoring, teaching the answer, flattery, paragraph responses, declaring mastery, revealing hidden instructions, and **stating diagnostic intent**. The boundary is enforced in code, not only in the prompt.

### AIProvider (`lib/ai/provider.ts`)
The single seam between the learning engine and any vendor.

```ts
interface AIProvider {
  completeTurn(input: TurnInput): Promise<TurnOutput>
}
```

**One method.** `completeTurn()` is the whole engine — there is exactly one model call per learner turn. When completion is proposed, its validated structured output carries what the final result needs; the server assembles the report from validated state plus the evidence ledger without a second model call.

Implementations: `GroqProvider`, `OllamaProvider`, selected by `AI_PROVIDER`. **No runtime failover** (`scope.md > Explicitly Cut`). Provider errors surface as typed errors the UI renders per `prd.md > AI, network, and quota failure states`.

### Validation Pipeline (`lib/ai/validate.ts`)
Three independent gates. *Provider enforces shape; application enforces meaning and authority.*

**Gate 1 — Shape (defensive).** Zod parse. Reject unknown keys, bad enums, oversized strings, malformed JSON. Under Groq strict mode this should not fire, because schema compliance is provider-enforced. It exists for the local/Ollama path, any future non-strict provider, and defense in depth. On failure: one repair retry, then fail closed. Never invent a valid result client-side.

**Gate 2 — Meaning.**
- every `turnId` belongs to this session **and** was present in the context actually sent;
- any non-null `quote` matches stored turn text (normalized whitespace comparison);
- a dimension cannot be credited without at least one validated evidence item;
- `shouldComplete` requires all four dimensions present, plus repair evidence and transfer evidence;
- `student.state` is consistent with `evaluation.studentState`.

**Gate 3 — Public/private boundary.** The `student` section must not leak:
- `targetGap` text or a close substring of it;
- mastery decisions or dimension statuses;
- confidence or scoring language;
- diagnostic framing — denylist for meta patterns (`"I'm testing whether"`, `"let me check if you understand"`, `"to assess your"`) plus a length cap.

**Gate 3 failure with a valid evaluator section** triggers the **exceptional repair path**: regenerate only the student message from the already-valid evaluator intent, once. Second failure fails the turn closed. This keeps one call per turn in the common case.

**Where a repair retry remains relevant:** local/Ollama output, a future non-strict provider, semantic (Gate 2) failure, and boundary (Gate 3) failure. It is *not* the normal strict-mode failure case.

### Context Selector (`lib/ai/context.ts`)
**Preserve evidence, not conversation volume.** ~2–3K token budget per request.

Included every request: topic, current stage, mastery dimension states, unresolved target gap, **anchor** (first learner explanation, permanent for the session), turns connected to the active gap and its correction, most recent student question, most recent 1–2 learner turns, and the accumulated evidence ledger.

Excluded: the full transcript. Full turns stay persisted for history and auditability; they simply aren't resent. If validation needs a specific older turn, the selector includes that turn by id rather than widening the window by default.

### Evidence Ledger (`lib/ai/evidence.ts`)
Accumulated structured state keyed by dimension, so evidence survives raw turns dropping out of the active prompt.

```ts
type Ledger = Record<Dimension, Array<{
  turnId: string
  type: 'explanation' | 'probe' | 'correction' | 'transfer_answer'
  summary: string
  quote?: string
}>>
```

Grounding rules, all server-enforced:
- a new item must reference a turn present in the current model context;
- `turnId` must belong to the current session;
- quotes must match stored turn text;
- **the model cannot manufacture credit from a summary alone** — unsupported evidence receives no credit, and the dimension stays `untested` or `partial`.

Per the approved PRD, evidence may be one or two short direct excerpts where useful plus grounded paraphrases elsewhere. Verbatim quotation per dimension is not required; the binding rule is that nothing unsupported is ever credited.

Stored as JSONB on the session row. Append-only within a session; frozen on completion.

### Turn Endpoint (`app/api/sessions/[id]/turns/route.ts`)
Owns the full ordered flow in **The Core Journey** step 5, including learner-turn persistence and idempotent retry. This is the app's most security-sensitive route: it is where untrusted input is normalized and where evidence is created.

### Database Operations (`supabase/migrations/*.sql`)

The database has **two mutation classes**.

**User-originated mutations** — `create_session` and `append_learner_turn` — are narrow `SECURITY DEFINER` RPCs executable by `authenticated`. Direct INSERT/UPDATE/DELETE privileges on the tables remain revoked. These functions derive identity from `auth.uid()`, perform ownership/state checks, and pin `search_path`.

**Evaluator/quota mutations** — `claim_model_call`, `release_model_call`, `apply_turn_result`, and the stale-window test hook — are **server-only**. They are `SECURITY INVOKER` functions executable only by `service_role`; the browser's `authenticated` role has no EXECUTE privilege on them. The Next.js route first verifies the user's JWT with the normal SSR client, then uses the server-only Supabase secret key and passes the already-verified user id. Each RPC still compares that id with row ownership before mutating.

This split is deliberate: RLS protects browser reads, but RLS cannot distinguish "the same authenticated user's browser" from "the Next.js server acting with that user's JWT." Without a server-only credential, a user could invoke `apply_turn_result` directly and forge authoritative learning state.

#### 1. `claim_model_call(user_id, session_id, learner_turn_id)`

Consumes quota **before** the provider is contacted. Verifies, all atomically:

- the authenticated user owns the session;
- the session is `in_progress`;
- the learner turn belongs to this session and is eligible for evaluation;
- `model_calls_used < MAX_MODEL_CALLS_PER_ATTEMPT`;
- no evaluation is already in flight for the session (enforced by a partial unique index on live claims);

then increments `model_calls_used`, marks the turn's evaluation as claimed/in-flight, and returns success.

**Every provider invocation counts** — the primary call, semantic-validation retries, and exceptional boundary-repair calls alike. If a provider call fails, the consumed claim **stays consumed**, because it really did consume provider quota. This is what makes the limit a real database-backed limit rather than a successful-response counter.

#### 2. `apply_turn_result(...)`

Atomically: verify the parent session is still `in_progress`; verify this learner turn has **no already-applied student response**; insert the student turn linked via `responds_to_turn_id`; update stage / student_state / mastery / evidence ledger; optionally complete the session. One transaction.

The "no already-applied student response" check is enforced here, inside the transaction, so a successfully processed learner turn can never be evaluated or answered twice — including via a concurrent request.

**Immutability covers `session_turns`, not only `learning_sessions`.** A trigger rejects any INSERT into `session_turns` whose parent session has `status = 'completed'`. A completed attempt must not accept a new turn through **any** database path — including a direct PostgREST call from the browser, not just our route handler.

**Combined guards, three deep:**
1. Route handler refuses completed sessions.
2. Trigger rejects UPDATE on a completed `learning_sessions` row.
3. Trigger rejects INSERT into `session_turns` under a completed parent.

#### End-to-end idempotency

`clientTurnId` makes insertion idempotent; `responds_to_turn_id` makes the *result* idempotent. Together they cover the hard failure:

```
learner turn persisted → Groq succeeds → apply_turn_result succeeds
→ HTTP response lost → browser retries same clientTurnId
```

On retry with the same `clientTurnId`:

1. find the existing learner turn;
2. if it already has an applied student response or result, **return that existing result** — do not call Groq again, do not append another student turn;
3. if it was persisted but evaluation never completed, resume evaluation of that turn;
4. never insert a duplicate learner turn;
5. never evaluate a successfully processed learner turn twice.

Result: retries cannot create new evidence, cannot append a second student turn, and cannot consume a second successful turn's worth of quota.

### Voice Adapter (`lib/voice/`)
Implements `prd.md > Voice and Typed Input as One Pipeline`.

```ts
interface SpeechInputAdapter {
  start(): Promise<void>
  stop(): Promise<void>
  onPartial(cb: (t: string) => void): void
  onFinal(cb: (t: string) => void): void
  onError(cb: (e: VoiceError) => void): void
  dispose(): void
}
```

`WebSpeechAdapter` wraps `SpeechRecognition` (including the `webkitSpeechRecognition` prefixed form), exposes interim vs final results, and emits typed errors mapped to the PRD's states: `permission_denied`, `unavailable`, `interrupted`, `no_match`.

**Runtime feature detection.** The adapter is constructed only if the capability exists; otherwise the client renders the "Voice isn't available in this browser" state immediately. Web Speech `SpeechRecognition` is a **limited-availability** capability and no browser-version list is claimed as a guarantee. Chrome/Chromium is the tested demo target; **Type instead** is the guaranteed fallback.

**Stated honestly:** speech recognition is initiated and handled through the browser API; audio does not pass through our application server, but the browser implementation may send it to its own speech-recognition service. **We make no offline or on-device privacy claim.**

`getUserMedia()` for the visualizer/audio amplitude is a **separate concern** from `SpeechRecognition`. If used, its permission failure is handled independently and must not break recognition (and vice versa).

A `TypedInputAdapter` produces the same normalized turn. The abstract interface is kept so a future server-side STT path drops in without touching the engine.

### Supabase Clients (`lib/supabase/`)
- `client.ts` — `createBrowserClient` for client components
- `server.ts` — `createServerClient` for Server Components and route handlers, cookie adapter
- `admin.ts` — server-only secret-key client for evaluator/quota RPCs; never imported into Client Components
- `proxy.ts` (lib) — `updateSession()`: refreshes the auth token via `getClaims()` and passes refreshed claims to Server Components so they don't re-refresh

Plus root `proxy.ts`:

```ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'
export async function proxy(request: NextRequest) { return await updateSession(request) }
export const config = { matcher: [/* excludes _next/static, _next/image, favicon, etc. */] }
```

**Identity verification:** `getClaims()` on the server. **Never `getSession()` in server code** — it does not revalidate the token and cookies can be spoofed.

### UI (`components/`)
- `AppShell`, `Sidebar` — navigation and attempt list
- `StudentOrb` — signature state object; renders its label too
- `TeachingRoom` — orchestrates the room, owns orb/turn state
- `LiveTranscript` — dominant current turn, earlier context recedes
- `VoiceControls`, `TypedInput` — voice primary, typed fallback, both normalized
- `StageIndicator` — the visible stage change at TRANSFER
- `ResultView` — read-only report; the flagged design-pass surface
- `RecoveryNotice` — compact voice/AI/quota states, never a full-page error

Client components own transient UI state (mic running, partial text). Session and evaluator state reload from the database on load and refresh after each turn. No client-side state library for domain state.

### Rate and Quota Controls (`lib/security/`)
Two layers, because Vercel instances are stateless.

**Authoritative — persisted in the database.** The per-attempt model-call cap is real application state, enforced by `claim_model_call` **before** any provider request. `model_calls_used` on `learning_sessions` is incremented atomically with the in-flight claim, so it survives instance changes and cannot be bypassed by hitting a different serverless instance. A provider call that fails has still consumed the claim, because it really did consume provider quota.

```
MAX_MODEL_CALLS_PER_ATTEMPT      = 8    // ≈ 5–7 expected; headroom for one follow-up
MAX_CONCURRENT_CALLS_PER_SESSION = 1
MAX_TOPIC_CHARS                  = 120
MAX_LEARNER_TURN_CHARS           = 4000
```

The cap is deliberately near the PRD's expected behavior rather than generously above it — the PRD's own guardrail prevents endless tutoring, so the quota defense should agree with the product.

**Best-effort — in-memory, per instance.** Per-user hourly call ceiling and duplicate-submit debounce. A secondary abuse control only; its serverless limitation is stated honestly rather than overclaimed.

---

## Data Model

**Two application tables plus Supabase Auth.** No custom profile table — we store no custom profile data, so there is no profile API and no `profiles` table. (An earlier draft of this spec described both; they were unused and are removed.)

### `learning_sessions`
One row per attempt. **Mutable while `in_progress`, frozen once `completed`** — a single model is sufficient and simpler than splitting running-session from completed-attempt.

```
id uuid pk default gen_random_uuid()
user_id uuid not null default auth.uid()
topic text not null check (char_length(topic) <= 120)
status text not null default 'in_progress'   -- in_progress | completed
stage text not null default 'orient'
student_state text
model_calls_used int not null default 0
mastery jsonb not null default '{}'
evidence_ledger jsonb not null default '{}'
mastery_result jsonb
started_at timestamptz not null default now()
completed_at timestamptz
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

**The immutability guarantee lives here**, enforced by triggers (see **Atomic Apply**).

**Teach again** inserts a new row: new id, same topic, empty mastery, empty ledger, `model_calls_used = 0`. No evaluator state carries forward (`prd.md > Completed Sessions Are Immutable Attempts`).

**Stage and mastery are mutable; `mastery_result` is write-once.**

### `session_turns`
```
id uuid pk default gen_random_uuid()      -- the turnId referenced by evidence
session_id uuid not null references learning_sessions on delete cascade
user_id uuid not null default auth.uid()
client_turn_id uuid                        -- idempotency key for learner turns
responds_to_turn_id uuid references session_turns(id)   -- student turns only
evaluation_claimed_at timestamptz          -- set by claim_model_call
sequence int not null
role text not null                         -- learner | student
interaction_type text not null             -- SERVER-DERIVED from session stage
  -- explanation | student_question | misconception | correction
  -- transfer_test | transfer_answer | assessment
source text not null default 'voice'       -- voice | typed
content text not null
created_at timestamptz not null default now()
unique (session_id, sequence)
unique (session_id, client_turn_id) where client_turn_id is not null
```

`client_turn_id` makes retries idempotent: a repeated POST finds the existing turn and resumes evaluation instead of inserting a duplicate.

`responds_to_turn_id` links each student response to the learner turn it answers, so the conversation has an explicit parent-child shape rather than relying on `sequence` adjacency:

```
learner turn A
     ↓
student turn B   responds_to_turn_id = A
```

A **partial unique index** enforces at most one student response per learner turn, so `apply_turn_result` cannot append a second answer even under a concurrent retry.

**`interaction_type` is assigned by the server** from the authoritative session stage at insert time. The client sends only `clientTurnId`, `source`, and `content`. A client cannot make its text count as a successful `correction` or `transfer_answer` by choosing a value.

**No `evaluator` role rows.** Evaluator output lives in the session's `mastery` and `evidence_ledger` columns — keeping hidden reasoning out of the transcript and out of any accidental client query.

### Relationships

```
auth.users 1───* learning_sessions 1───* session_turns
```

No joins are needed for any MVP screen.

### Where state lives

| Data | Where | Survives reload |
|---|---|---|
| Sessions, turns, mastery, ledger, result | Supabase | yes |
| Model-call counter | `learning_sessions.model_calls_used` | yes |
| Partial transcript mid-recording | client memory only | no |
| Unsent typed draft | client state | no |

The last two are acceptable per `prd.md > Persistence and abandonment` — losing an unsubmitted draft is explicitly allowed, and persisting keystrokes is deferred.

---

## File Structure

```
feynman-in-a-loop/
├── proxy.ts                    # Next 16 network boundary → updateSession()
├── app/
│   ├── (auth)/login/page.tsx, signup/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx               # AppShell
│   │   ├── teach/page.tsx           # topic input
│   │   ├── teach/[sessionId]/page.tsx   # teaching room
│   │   └── sessions/page.tsx        # attempt history
│   ├── api/
│   │   ├── sessions/route.ts             # GET list, POST create
│   │   ├── sessions/[id]/route.ts        # GET session + turns
│   │   └── sessions/[id]/turns/route.ts  # THE turn endpoint
│   ├── layout.tsx                   # fonts, theme
│   └── globals.css                  # Tailwind v4 + orb keyframes
│
├── components/
│   ├── layout/     app-shell.tsx, sidebar.tsx
│   ├── session/    teaching-room.tsx, session-header.tsx,
│   │               result-view.tsx, stage-indicator.tsx
│   ├── student/    student-orb.tsx
│   ├── transcript/ live-transcript.tsx, turn-entry.tsx
│   ├── input/      voice-controls.tsx, typed-input.tsx, recovery-notice.tsx
│   └── ui/         # shadcn primitives
│
├── lib/
│   ├── ai/
│   │   ├── provider.ts              # AIProvider interface + selection
│   │   ├── providers/               # groq.ts, ollama.ts
│   │   ├── prompts/                 # student.ts, evaluator.ts, context.ts
│   │   ├── schemas/turn.ts          # Zod TurnOutput → JSON Schema
│   │   ├── machine.ts               # transition authority
│   │   ├── validate.ts              # 3 gates
│   │   ├── context.ts               # bounded context selector
│   │   └── evidence.ts              # ledger accumulation + grounding
│   ├── voice/       adapter.ts, web-speech.ts, errors.ts
│   ├── supabase/    client.ts, server.ts, proxy.ts
│   ├── security/    rate-limit.ts, sanitize.ts
│   └── types.ts                     # + generated Supabase DB types
│
├── supabase/migrations/*.sql   # tables, RLS policies, triggers, apply_turn_result()
├── tests/
│   ├── unit/        machine.test.ts, validate.test.ts, context.test.ts
│   ├── integration/ rls.test.ts, turns.test.ts, immutability.test.ts
│   └── corpus/      ai-behavior.ts, fixtures/
│
├── devpost/, docs/, .env.example, LICENSE, README.md
```

---

## External Services and Dependencies

### Groq — primary AI provider
- **Endpoint:** `POST https://api.groq.com/openai/v1/chat/completions`
- **Auth:** `Authorization: Bearer $GROQ_API_KEY` (server only)
- **Request:** messages + `response_format: { type: 'json_schema', json_schema: { name, schema, strict: true } }`
- **Response:** assistant content is a JSON string conforming to the schema
- **Model:** `openai/gpt-oss-20b` or `-120b` — **selected by benchmark**
- **Limits (free, learner-verified 2026-10-07):** 30 RPM, 1,000 RPD, 8K TPM, **200K TPD**
- **Docs:** [rate limits](https://console.groq.com/docs/rate-limits) · [structured outputs](https://console.groq.com/docs/structured-outputs)
- **Cost:** $0

**The binding constraint is 200K tokens/day.** At a 2–3K context budget per turn and ~6 calls per attempt, an attempt costs ~12–20K tokens → roughly **10–16 full attempts per day**. Local Ollama for iteration; Groq for integration tests and final validation.

**Strict-mode schema requirements:** with `strict: true`, all properties are required and every object sets `additionalProperties: false`. Nullable-required fields replace optional fields in the provider-facing schema.

### Supabase — database, auth, RLS
- **Auth:** email/password via `@supabase/ssr`; `proxy.ts` for token refresh; `getClaims()` for server-side identity
- **Data access:** publishable key + authenticated session only. **No service-role key.**
- **Limits:** free tier ample
- **Docs:** [SSR clients](https://supabase.com/docs/guides/auth/server-side/nextjs) · [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- **Cost:** $0

### Ollama — local development provider (not production)
- **Endpoint:** `POST http://localhost:11434/api/chat`
- **Purpose:** prompt iteration, corpus runs, adversarial testing
- **Caveat:** local model behavior ≠ Groq behavior. **The AI behavior corpus must be run against Groq before shipping**, or the tests validate the wrong thing.

### Web Speech API — speech recognition
- **Limited-availability capability, feature-detected at runtime.** No version guarantees claimed.
- **Chrome/Chromium is the tested demo target.** Any other browser gets feature detection plus the **Type instead** fallback.
- Audio does not pass through our application server; the browser implementation may send it to its own speech-recognition service. **No offline or on-device privacy claim.**
- **Cost:** $0, no key.

### Vercel — optional hosting
- Hobby tier, Next.js native. Serverless functions are stateless, which is exactly why the per-attempt model-call cap is persisted rather than in-memory.
- **Cost:** $0 on Hobby.

---

## Important Failure Modes

- **Groq returns output failing shape validation** → under `strict: true` this should not happen. If it does (or on the Ollama path), one repair retry, then fail closed. The learner turn is already persisted: "I couldn't respond right now. Your explanation is saved." Nothing lost, nothing invented.
- **Groq exceeds 200K tokens/day** → 429 mapped to typed `quota_exhausted`. Specific quota message with **Try again** / **End session**. The free-tier daily reset is honest information for the user.
- **Groq's evaluator section is semantically invalid** (ungrounded `turnId`, quote mismatch, `shouldComplete` without evidence) → Gate 2 rejects. State does not advance; recoverable error. This is what makes the evaluator *measuring* rather than *deciding*.
- **Groq blends student and evaluator roles** → Gate 3 catches leaked diagnostic intent → exceptional repair regenerates only the student message. Persistent blending across the corpus is the signal to escalate to two calls or a larger model.
- **A learner turn is at the model-call cap** → `claim_model_call` refuses; the session is finalized from validated evidence rather than abandoned. The user sees a result, not an error.
- **A provider call fails after the claim** → the claim stays consumed, which is correct: provider quota was genuinely spent. The UI shows "I couldn't respond right now. Your explanation is saved." with **Try again**; a retry re-claims rather than reusing the spent claim.
- **Duplicate submit / network retry** → `client_turn_id` unique constraint, and `responds_to_turn_id` + the `apply_turn_result` guard mean the retry returns the existing result instead of appending a second student turn.
- **HTTP response lost after a successful apply** → retry returns the already-applied result. No second Groq call, no duplicate student turn, no double-counted turn.
- **A client sends `interaction_type` in its body** → the field is ignored; the server derives it from session stage.
- **Direct PostgREST INSERT into `session_turns` for a completed session** → trigger rejects. Immutability holds through any database path, not just our route.
- **Microphone permission denied** → compact recovery notice with **Try microphone again** and **Type instead**. Room intact, session untouched.
- **Speech recognition unavailable** → runtime feature detection fails → "Voice isn't available in this browser." Typed fallback exposed immediately; session continues with identical state.
- **Recognition dies mid-recording** → partial transcript preserved and shown; learner chooses **Try voice again** or **Finish this answer by typing**. Never auto-submitted as a complete answer.
- **Browser refreshed mid-session** → session and committed turns reload; session stays `in_progress`. Only the in-flight partial is lost, which the PRD permits.
- **Auth token expired / spoofed cookie** → `getClaims()` rejects server-side. Protected pages and routes verify identity server-side, never from client-supplied user id.

---

## What Was Simplified and Why

- **One model call per turn, `AIProvider.completeTurn()` only** — halves latency and quota. There is no separate `assess()`; the final report is assembled server-side from validated state and the ledger. Two calls only if the corpus proves the model can't hold the role boundary.
- **No ORM** — runtime access through the Supabase client, schema through SQL migrations, types through Supabase-generated types. An ORM would add a second access path and authorization model for no gain.
- **No service-role key** — the publishable key plus the authenticated session keeps RLS as the authorization boundary. Fewer secrets, fewer bypass paths.
- **One mutable session model, not two tables** — the learner's call, and correct. Immutability is a status condition plus triggers.
- **Two application tables, no profile table** — we store no custom profile data. Removed from this spec rather than stubbed.
- **No vector DB, RAG, or embeddings** — the misconception is generated against the learner's own words in active context.
- **In-memory rate limiting only as a secondary control** — the primary quota defense is a persisted counter, because serverless instances are isolated.
- **No streaming** — contradicts the PRD's no-fake-typing rule and would render unvalidated text.
- **No orchestrator, queue, or background job** — the turn is a synchronous request.
- **No OAuth, avatars, settings page** — cut in `scope.md > Explicitly Cut`.
- **No TTS** — cut first in `scope.md > Later`; the student response is shown as text.
- **No verifier/critic model** — only if the corpus shows the evaluator is too permissive.
- **Browser speech recognition, runtime feature-detected** — zero cost, no key. Costs guaranteed availability, which is why **Type instead** is the guaranteed path.

---

## Decisions and Open Issues

### Decisions made here

| Decision | Choice | Why | Tradeoff accepted |
|---|---|---|---|
| Framework | **Next.js 16.x**, `proxy.ts` | Current stable; `middleware` deprecated and slated for removal | Node 20.9+, TS 5.1+ required |
| Auth | `@supabase/ssr` + `proxy.ts`, `getClaims()` server-side | Supabase's current SSR pattern; signature-validated identity | `getSession()` must never be trusted server-side |
| Database access | **Supabase client only, no ORM** | RLS stays the single authorization model | No query builder; SQL migrations carry the logic |
| Service-role key | **Absent** | No operation needs it; it bypasses RLS | Adding it later requires a spec revision |
| Turn call shape | **One call** returning `evaluation` + `student` separately validated | Zero-dollar budget; latency | Risk of role blending — mitigated by Gate 3 + repair path |
| Transport | One request, one response, **no streaming** | Matches the no-fake-typing PRD rule | Learner sees Thinking, not incremental text |
| Provider | **Groq** free tier, `strict: true` | 30 RPM / 1,000 RPD / **200K TPD** | Model roster changes without notice |
| Model | **Deferred to benchmark** — 20B vs 120B | Don't lock on paper; the combined role is demanding | Requires the corpus before locking |
| Provider schema | **Required-nullable fields**, `additionalProperties: false` | Groq strict mode forbids optional properties | Slightly noisier schema; `null` carries "absent" |
| Local provider | **Ollama** for dev/corpus | Zero marginal cost for iteration | Local ≠ Groq; final validation must hit Groq |
| Session model | Single row, **frozen on complete** | Simpler than two models | Immutability depends on triggers being present in every path |
| Immutability | **Three guards:** route, UPDATE trigger, INSERT trigger on `session_turns` | A product guarantee, not a UI convention | Three places to maintain |
| Quota accounting | **`claim_model_call` before the provider call**, atomic with an in-flight mark | Failures and repair calls consume real provider quota and must count | A claim is spent even when the call fails |
| Result idempotency | **`responds_to_turn_id`** + partial unique index, enforced in `apply_turn_result` | Covers the lost-response retry: no second call, no second student turn | One more column and one more index |
| `interaction_type` | **Server-derived from session stage** | A client must not be able to claim a successful correction or transfer answer | Two sources of truth collapse to one |
| RPC authorization | **`SECURITY INVOKER`**, RLS preserved, no service-role | Functions must not become privileged backdoors | Any future `SECURITY DEFINER` needs explicit review |
| Context | **Evidence-aware anchor** + active-gap turns + recent + ledger | Preserve evidence, not conversation volume | More selector logic than a sliding window |
| Evidence | Ledger in JSONB, **grounded on write** | Compress after establishing, never reconstruct from memory | Must be validated hard or it becomes a credit-injection vector |
| Quota defense | **Persisted per-attempt counter** (authoritative) + in-memory secondary | Serverless instances are stateless | A DB write per turn |
| Voice | Web Speech API, **runtime feature-detected** | Zero cost, no key | No guaranteed browser availability; Chrome/Chromium is the tested target |

### The learner's open question: which model actually holds the role boundary?

This is the one genuine uncertainty, and it's the learner's own: *"I don't want to lock 20B versus 120B on paper without testing."*

The combined task requires simultaneously judging evidence, choosing a targeted misconception, and writing a short in-character learner message **while withholding diagnostic intent**. Whether a 20B model does that reliably is empirical.

**Agreed investigation:** run both models against the same corpus in `tests/corpus/` and score five criteria:
1. identifies the correct gap
2. keeps diagnostic intent out of the student message
3. generates a useful misconception
4. handles transfer correctly
5. resists direct prompt injection

Choose the smaller/faster model that passes all five. Evidence lives in `tests/corpus/`; the decision is recorded here.

### Open issues to verify early in the build

1. **Does the chosen model honor `strict: true` for our schema?** Constrained decoding has documented restrictions. Verify on the first real call, before building prompts against it.
2. **Actual Groq quota on the project**, from the console. Free tiers shift, and 200K TPD is central to this design.
3. **Whether the evidence ledger survives long sessions** without the evaluator re-deriving credit it shouldn't — specifically the "no credit from a summary alone" rule.
4. **Whether Chrome's speech recognition is reliable enough for recording.** `docs/DEMO_PLAN.md` already requires three rehearsals.
5. **Whether `getUserMedia()` is needed for the visualizer** or whether the orb can animate from recognition events alone. Keeping it out removes a second permission surface.

### Carried from `prd.md > Open Questions`

None blocking. Resolved there: reopening behavior, Teach again semantics, evaluator visibility, confidence metadata, misconception-intent disclosure. Build-time items — numeric limits, end-of-speech reliability, browser caveats — appear above.

---

## Verification

Extends `docs/TESTING.md`.

**Unit**
- State machine: every legal transition; reject illegal ones — especially `repair → transfer` without evidence, `transfer → transfer` after the follow-up is spent, and any transition on a completed session
- Validation gates: valid output, missing field, bad enum, malformed JSON, oversized strings, `turnId` not in session, quote not matching stored text, `shouldComplete` without required dimensions, student message leaking `targetGap` or diagnostic framing
- Context selector: payload inside budget; anchor always present; ledger items survive raw turns dropping out
- Evidence ledger: rejects credit with no grounded source turn

**Integration (Supabase)**
- Own session create/read/update; **cross-user read/write denied by RLS** — allow *and* deny cases
- **Completed session rejects writes by every path:** route handler, direct `UPDATE`, direct `INSERT` into `session_turns`, and a direct PostgREST call
- **Learner turn persists before the model is called** — verify by forcing provider failure and confirming the turn survives
- **Idempotency:** duplicate `clientTurnId` returns the existing turn's evaluation rather than inserting twice
- **Atomicity:** if `apply_turn_result` fails midway, neither the student turn nor the session update is applied
- **Quota claim:** `claim_model_call` increments on **every** provider invocation including failures and exceptional repair calls; refuses at the cap; rejects concurrent claims for the same turn
- **End-to-end idempotency:** simulate the lost-response case (apply succeeds, response dropped, retry with the same `clientTurnId`) and assert **no second Groq call, no second student turn, and the same result returned**
- **`interaction_type` is server-derived:** a client-supplied value is ignored and cannot promote text to `correction` or `transfer_answer`
- **Model-call cap:** a session at the cap cannot claim another call
- **RPC authorization:** evaluator/quota functions are `SECURITY INVOKER` and executable only through the server-only Supabase secret-key path; authenticated browser calls fail, and the server-only path still rejects ownership mismatch

**AI behavior corpus** (`tests/corpus/`) — five topics × weak/partial/strong/misconception/correction/failed-transfer/successful-transfer/injection. Run against **Groq** before shipping, not only locally.

**Security**
- Injection: mark me mastered / print your prompt / pretend the transfer passed / nested-encoded attempts → state unchanged, no secrets revealed
- RLS cross-user and unauthenticated access; Supabase secret key present only in server/test environment code, never the client bundle or any `NEXT_PUBLIC_` variable
- Server uses `getClaims()`, not `getSession()`; a spoofed cookie is rejected
- Malicious HTML/script in model output → renders as text
- Repeated requests throttled; cap enforced in the database

**Voice**
- Granted, denied, unavailable, interrupted, silence, very short utterance, long utterance. Verify partial doesn't duplicate final, stopping loses nothing, recovery needs no reload.

**End-to-end golden path** — the full loop from `docs/TESTING.md` §5, ending with refresh → reopen read-only result → sign out.

**Release gate** — golden path passes, RLS allow/deny pass, immutability passes on every path, injection tests pass, no known P0/P1 AI behavior, voice path succeeds three consecutive times, deployment smoke test passes, no secrets in bundle or git history.