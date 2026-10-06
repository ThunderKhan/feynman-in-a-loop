# Feynman-in-a-Loop — Implementation Plan

Status: **Active**  
Plan date: **7 October 2026**  
Submission deadline: **27 October 2026, 2:30 AM IST**

## Principle

We have roughly three weeks, not an unlimited product cycle.

Build vertical slices. Get the learning loop working in text before spending too much time on realtime voice or animation.

## Phase 0 — Devpost planning and repo foundation
**7–8 October**

- [ ] Install the official Devpost Learn Skill Pack in the fresh project workspace.
- [ ] Run `1-start`.
- [ ] Run `2-scope` and approve `devpost/scope.md`.
- [ ] Run `3-prd` and approve `devpost/prd.md`.
- [ ] Run `4-spec` and approve `devpost/spec.md`.
- [ ] Confirm repository eligibility/new-project requirement.
- [ ] Add license.
- [ ] Add `.gitignore`.
- [ ] Add `.env.example`.
- [ ] Establish Next.js/TypeScript/Tailwind project.
- [ ] Confirm clean deployment path to Vercel.

**Exit condition:** required planning documents exist and the app boots locally.

## Phase 1 — Visual shell
**9–11 October**

Build with mock data:
- [ ] App layout
- [ ] Sidebar
- [ ] New Session button
- [ ] Session history mock
- [ ] Profile control
- [ ] Teaching Room
- [ ] Student Orb placeholder
- [ ] Voice visualizer placeholder
- [ ] Transcript panel
- [ ] Student-state panel
- [ ] Result screen

Adapt the Bolt-style visual base but remove:
- model selector;
- generic chat composer;
- import buttons;
- coding-assistant semantics.

**Exit condition:** a screen recording already communicates "I teach the AI."

## Phase 2 — Supabase auth and persistence
**12–14 October**

- [ ] Create Supabase project.
- [ ] Implement email sign-up/sign-in/sign-out.
- [ ] Create initial migrations.
- [ ] Create profiles.
- [ ] Create learning_sessions.
- [ ] Create session_turns.
- [ ] Enable RLS.
- [ ] Write select/insert/update/delete policies.
- [ ] Verify one user cannot read another user's rows.
- [ ] Load real session history into sidebar.

**Exit condition:** user can sign in, create a session, refresh, and still see it.

## Phase 3 — Text learning loop
**15–18 October**

Before voice, make the intellectual core work.

- [ ] Choose/test zero-cost model provider.
- [ ] Create provider adapter.
- [ ] Implement AI Student system prompt.
- [ ] Implement evaluator system prompt.
- [ ] Define structured evaluator schema.
- [ ] Build state machine.
- [ ] Implement diagnostic misconception step.
- [ ] Implement repair step.
- [ ] Implement transfer step.
- [ ] Implement final assessment.
- [ ] Persist validated turns/state.
- [ ] Test against multiple topics.

**Exit condition:** typed/debug input can complete the entire Feynman loop reliably.

## Phase 4 — Voice-first interaction
**19–21 October**

- [ ] Select simplest reliable speech path.
- [ ] Microphone permission UX.
- [ ] Start/stop controls.
- [ ] Partial/final transcript.
- [ ] Visualizer driven by actual microphone input if practical.
- [ ] Map voice state to Student Orb.
- [ ] Preserve text fallback for debugging/accessibility.
- [ ] Optional student TTS only after STT works.

**Exit condition:** golden path works by voice.

## Phase 5 — Product polish + AI state visualization
**22–23 October**

- [ ] Student Orb state transitions.
- [ ] Listening / thinking / confused / testing / mastered states.
- [ ] Transcript annotations.
- [ ] Result transition.
- [ ] Sidebar status badges.
- [ ] Empty states.
- [ ] Loading states.
- [ ] Error states.
- [ ] Responsive pass.
- [ ] Keyboard/focus pass.

**Exit condition:** design feels coherent, not like assembled components.

## Phase 6 — Security and reliability
**23–24 October**

- [ ] Prompt-injection tests.
- [ ] Invalid model output tests.
- [ ] Auth/RLS tests.
- [ ] Secrets audit.
- [ ] Rate/quota protection.
- [ ] Input length limits.
- [ ] Render sanitization where needed.
- [ ] Provider failure recovery.
- [ ] Network interruption recovery.
- [ ] Confirm no real secrets in Git history.

**Exit condition:** security checklist in `SECURITY.md` has no critical open items.

## Phase 7 — Demo hardening
**25 October**

- [ ] Choose deterministic demo topic.
- [ ] Rehearse complete path.
- [ ] Prepare fallback if live AI/voice fails.
- [ ] Record screenshots.
- [ ] Run cross-browser sanity check.
- [ ] Run production deployment smoke test.
- [ ] Run full acceptance suite.

**Exit condition:** clean demo works from a fresh account/session.

## Phase 8 — Submission
**26 October**

- [ ] README finalized.
- [ ] Setup instructions tested.
- [ ] License visible.
- [ ] Devpost required docs present.
- [ ] Demo video recorded (<3 min).
- [ ] Video uploaded publicly/unlisted as allowed.
- [ ] Devpost description completed.
- [ ] Public repo checked from logged-out browser.
- [ ] Deployment checked.
- [ ] Final submission made before deadline buffer.

Do not plan to finish at 2:29 AM on 27 October.

## Priority ladder

### P0 — cannot submit convincingly without it
- core AI-student inversion
- misconception/diagnostic turn
- transfer test
- mastery result
- voice input
- persistence
- auth
- polished main screen
- public deployment
- required Devpost planning docs

### P1 — strongly improves judging
- Student Orb state animation
- learning-history sidebar
- evidence-backed result card
- robust error handling
- security hardening
- responsive polish

### P2 — cut if needed
- AI speech output
- OAuth
- advanced analytics
- multiple AI providers
- complex animated backgrounds
- elaborate profile settings
- edge-case mastery dimension

## Branch/work strategy

Keep `main` deployable.

Suggested feature branches once coding begins:
- `feat/ui-shell`
- `feat/auth-supabase`
- `feat/learning-engine`
- `feat/voice`
- `feat/security-hardening`
- `feat/demo-polish`

For a solo hackathon, do not create process overhead that slows shipping.

## Definition of done

The project is done when:
- a new user can sign in;
- start a topic;
- teach by voice;
- see transcription;
- receive a targeted student misunderstanding;
- repair it;
- answer a transfer question;
- receive a structured mastery result;
- see that session saved;
- and a judge can understand the whole value proposition in under three minutes.
