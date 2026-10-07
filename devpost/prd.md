---
doc: prd
status: approved
approved: 2026-10-07
---

# Feynman-in-a-Loop — Product Requirements

A voice-first learning web app where the learner teaches an AI student, and the student's misunderstandings are the assessment.

**Who it's for:** a self-directed learner who just finished studying a concept and wants to know whether they actually understand it or merely recognize it.
Source: `scope.md > Who It's For`.

Every requirement below stays inside the approved boundary in `scope.md > The POC Boundary`. The boundary rule holds: simplify supporting layers, never weaken the core loop.

---

## The Core Journey

Source: `scope.md > The Core Loop` and `scope.md > What "Working" Looks Like`.

1. **Arrive.** The landing page states the inversion in one line — most AI learning tools teach you; here you teach the AI. A **Start** action leads to sign-up or sign-in.
2. **Authenticate.** Email and password. No OAuth. The session persists across refreshes.
3. **Name the concept.** Minimal-friction topic entry. One text field, topic prefilled to empty. Primary CTA **Start teaching**.
4. **Orient.** The teaching room appears with the Student Orb in **Ready**. It moves to **Listening** and shows one short orientation line — *"I'm listening. Teach me Binary Search."* This is orientation only, not the start of a conversation. The microphone activates.
5. **Teach, unaided.** The learner speaks. Their live partial transcript is the visually dominant thing in the center. The student **does not interrupt and asks no preliminary questions** — an unaided first explanation is the cleanest evidence of what the learner actually understands. The orb reacts to audio level.
6. **Stop.** On Stop, the partial transcript locks into a finalized learner turn and stays visible in place. Orb moves **Listening → Thinking**. A subtle status like *"Thinking about what you said…"* appears. No fake typing indicators, no fabricated reasoning, no read-back step. If the call is slow, status may become *"Still thinking…"*.
7. **Evaluate and respond.** The evaluator assesses the completed turn and the student responds once. Behavior is evidence-driven, never a fixed script: **listen → evaluate available evidence → ask the smallest useful question → update the learner model → decide what evidence is missing → probe that → transfer only when appropriate → finish when enough evidence exists.**
8. **Diagnose and repair.** If the explanation is substantive, the evaluator picks its most important unproven, weak, or incorrect part and the student probes it. If the explanation is too vague or too short, the student pushes for missing reasoning instead of proceeding to a misconception. The misconception is selected *because the learner did not establish the relevant point*, never because a topic always uses the same scripted mistake. Orb goes **Thinking → Confused**.
9. **Repair, possibly repeated.** If the correction resolves the targeted gap: orb **Confused → Corrected**, and the student acknowledges briefly in one line without expanding into a lesson. If it does not, the student stays on the same conceptual gap rather than pretending to understand and moving on.
10. **Transfer.** Only after the targeted misconception is sufficiently repaired. The stage indicator changes to **Testing**, orb **Corrected → Testing**, and the student marks the semantic change before asking — *"Okay, I think I understand that. Let me try it somewhere else."* then the transfer question. Purpose has visibly changed; the wording need not be identical every session.
11. **Transfer response.** If the transfer answer is weak, the student asks **one** focused follow-up rather than failing the learner immediately. If still not demonstrated, the evaluator records the dimension as weak/partial and moves toward the result.
12. **Finish.** Orb passes through **Testing → Understanding → Mastered** only when mastery was actually demonstrated. With mixed evidence it settles into **Almost there** or **Revisit** instead — no fake mastery animation. One final short student line precedes the result: *"I think I get it now."* if mastered, *"I understand part of it, but I'm still unsure about something."* if not.
13. **Result.** **YOU TAUGHT ME — Binary Search**, overall state, four dimension rows, evidence quoting the learner's actual words, remaining gaps, revisit guidance.
14. **Persist and continue.** The attempt is saved and appears in the sidebar. The learner takes **New topic** or **Teach again**.
15. **Return.** The learner reopens previous attempts read-only from history.

---

## Screens and Layout

Source: `scope.md > Inspiration & Identity` and `docs/DESIGN.md > Primary layout`.

Four surfaces. Desktop-first, sidebar persistent; sidebar collapsible on tablet; on mobile a drawer for sessions with the orb still central and the mic control thumb-accessible.

1. **Landing.** Product statement of the inversion, single primary action.
2. **Auth.** Email + password. Sign up, sign in, sign out. Session persists across refresh.
3. **Teaching Room.** The core surface. Persistent left sidebar; center workspace.
4. **Result.** Replaces the active teaching state within the Teaching Room, not a separate page.

Plus **Session History** — the sidebar's session list, acting as a panel over the existing surfaces rather than a page of its own.

### Teaching Room layout

```text
┌─────────────────┬─────────────────────────────────────────────┐
│ Feynman         │              Binary Search                  │
│ in a Loop       │                                             │
│                 │                     ◉                       │
│ + New Session   │                 Student Orb                 │
│                 │                                             │
│ Today           │              Voice Visualizer               │
│ Binary Search   │                                             │
│   Mastered    ✓ │         ┌───────────────────────┐           │
│ Binary Search   │         │  (learner speaking)   │           │
│   Revisit     ↺ │         │   live transcript     │           │
│ Recursion       │         └───────────────────────┘           │
│   Almost there△ │              ~ student question ~           │
│                 │                                             │
│                 │              ◉  Teach   /   Stop             │
│─────────────────│              Type instead                    │
│ Profile         │                                             │
└─────────────────┴─────────────────────────────────────────────┘
```

### Vertical hierarchy inside the room

The current learner turn is the visually dominant object in the center. Working outward:

1. **Current learner turn** — live partial transcript, then locked finalized text that stays in place during evaluation.
2. **The student's most recent question** — stays visible so the learner knows what they're answering, but must not compete with the live transcript.
3. **Earlier context** — prior important turns remain above as lightweight context and visually recede.
4. **Student state** — orb plus stage indicator.
5. **Controls** — voice primary, typed fallback secondary.

This is explicitly **not** an alternating chat wall: no chat bubbles per sentence, no avatar repetition, no message chrome competing with teaching content.

### Transcript behavior

Reads as a teaching notebook rather than a message feed. Continuous readable text; timestamps only where useful; clear distinction between learner and student. Important moments may be annotated **Misconception**, **Correction**, **Transfer Test**, **Mastery Evidence**.

### Sidebar

Product identity, **New Session**, session list with status per attempt, profile area. Status language: **In progress**, **Mastered**, **Almost there**, **Revisit**. For the MVP a flat list under **Today** / **Recent** is sufficient; grouping by topic is not required.

The sidebar represents **learning attempts, not chat threads**. Repeated attempts on one topic each appear separately:

```text
Today
Binary Search    Mastered
Binary Search    Revisit
Recursion        Almost there
```

---

## Look and Feel

Source: `scope.md > Inspiration & Identity`, `docs/DESIGN.md`.

> **a beautiful room where you are teaching another mind** — not another chatbot, not a generic AI SaaS dashboard, not a neon voice assistant, not a school LMS.

**References** (qualities to draw from, never copy pixel-for-pixel): Figma Docs for editorial spacing and clarity; Claude for calm conversational surfaces and typography; Perplexity for hierarchy and contextual navigation; ChatGPT for familiar sidebar conventions.

**The Student Orb is the signature object** — a state visualization, not a mascot. States: Ready, Listening, Thinking, Confused, Corrected, Testing, Understanding, Mastered, Error / Offline.

**Motion carries meaning, never decoration.** Amplitude → listening. Pulse/phase → thinking. Instability → confusion. Settling → understanding. Brief expansion → mastery. All motion respects `prefers-reduced-motion`, and the UI remains fully usable with animation disabled.

**Color:** dark calm neutral base, one primary accent reserved for active microphone, focus, important state, and the mastery transition. No multiple decorative gradients.

**Typography:** highly readable, editorial, restrained weights, strong long-form transcript rendering, clear hierarchy. Exact typeface open at this stage.

**Surfaces:** soft elevation, subtle borders, minimal glass, generous whitespace.

**Avoid:** generic neon AI SaaS, excessive glassmorphism, gratuitous gradients, cartoon robot styling, dashboard clutter, animation everywhere, copying another company's interface.

**Accessibility:** visible keyboard focus; accessible names on controls; state never communicated by color alone; transcript provided for all voice content; reduced-motion respected; sufficient contrast; explicit mic start/stop; no auto-recording on page load; error states as text, not animation.

The mastery transition should feel meaningful and memorable but restrained.

---

## Features and Behavior

### Learner Turn Lifecycle

Source: `scope.md > The Core Loop`.

A learner turn is a **complete unit of evidence**. It ends on Stop, on reliable end-of-speech detection if that later proves dependable, or on typed submission. The student never interrupts while the learner is actively speaking. The evaluator runs **only after** a completed turn.

**Student turn length** is deliberately short: one or two sentences, usually one question, ideally 5–25 words, never a paragraph without exceptional reason. The student does not summarize the learner after every turn, and does not flatter.

> Good: *"Why can we safely discard that half?"*
> Good: *"I think I'm missing something. Would this still work if the list wasn't sorted?"*
> Not this: *"Great explanation! Binary search is an efficient searching algorithm with O(log n) complexity. However…"*

**Minimum length.** No requirement to speak for a fixed duration or produce a sentence count. The evaluator works from whatever evidence it receives.

### Evidence-Driven Stages

Source: `scope.md > The Unique Kernel` — the misconception is selected against the learner's specific gap.

The student may ask for clarification when the learner is vague rather than advancing the script. The learner may need **more than one explanation turn** before the evaluator has enough evidence to enter REPAIR. Stages are evidence-driven, not a fixed number of turns.

**Session length guardrail (PoC).** Roughly one initial explanation, one diagnostic/repair sequence, one transfer sequence, and at most **one** extra follow-up inside a stage when necessary. If understanding is still weak after that, the result records the gap instead of turning the session into an unbounded tutoring conversation.

### Voice and Typed Input as One Pipeline

Source: `scope.md > The POC Boundary` — voice is P0 for the experience, optional for the engine.

Voice and typing are **two input adapters producing the same normalized learner turn**. They are not separate modes and not separate products.

**Typed fallback presentation.** Typing is fallback, not product identity, so there is no permanent chat composer at the bottom of every screen. The primary CTA is normally the voice control. Choosing **Type instead** reveals a focused input area for that turn: multiline text area, **Submit explanation**, and an optional **Use microphone** action to switch back. After submission the text becomes a normal learner turn and the area collapses while the student evaluates.

**Mid-session switch.** If voice fails after four turns, everything carries forward unchanged: existing transcript, current student state, evaluator/mastery state, current stage, and the same session ID. The transition can be visibly reassuring — *"Continuing this session by text."* If microphone access returns later, the learner may switch back to voice without creating a new session.

### Completed Sessions Are Immutable Attempts

Source: `scope.md > What "Working" Looks Like` — the result is a report, not a thread.

A completed session is **read-only**. The learner can inspect topic, final outcome, mastery dimensions, evidence, remaining gaps, important transcript moments, the misconception/correction, and the transfer question and answer. The learner **cannot** append new turns to a completed attempt.

> If you can keep talking until the result improves, the assessment loses meaning.

**Teach again** creates a **new attempt at the same topic**. It never overwrites the previous one:

```text
Binary Search — Attempt 1: Revisit
Binary Search — Attempt 2: Almost there
Binary Search — Attempt 3: Mastered
```

A new explanation produces new evidence. Old attempts remain available.

**No carry-forward of evaluator state.** A repeat attempt starts mostly fresh so the learner gives another unaided explanation. The system may know at the product/data level that this is a repeat topic, but it must **not** open with *"Last time you failed the sorted invariant. Explain that first."* That would contaminate the fresh explanation. Intentionally revisiting prior weaknesses is deferred.

For the PoC the UI needs no sophisticated attempt timeline: a new session with the topic prefilled, optionally showing the previous result as lightweight context.

### Result Presentation

Source: `scope.md > What "Working" Looks Like` — the "oh, that's cool" beat.

```text
YOU TAUGHT ME
Binary Search

MASTERED

✓ Core idea
✓ Mechanism
✓ Misconception repair
✓ Transfer

EVIDENCE
You explained that sorted order lets you determine
which half cannot contain the target.

REVISIT
No critical gaps detected.
```

Every assessment claim must be grounded in evidence from the actual session. Where a direct excerpt helps, the result may use one or two short direct excerpts from the learner; the remaining dimensions may use concise grounded paraphrases of what the learner actually said.

The binding rule: **the evaluator must never invent evidence, and must never claim the learner demonstrated something the session does not support.** An unsupported dimension is marked `untested` or `partial` rather than credited.

**Three outcomes and their primary actions:**

| Outcome | Meaning | Primary | Secondary |
|---|---|---|---|
| **Mastered** | Required evidence demonstrated across all four dimensions | **New topic** | Teach again |
| **Almost there** | Most of the concept demonstrated; one meaningful dimension Partial/Weak, identified explicitly | **Teach again** | New topic |
| **Revisit** | Significant conceptual gap, or not enough understanding demonstrated to complete the loop | **Teach again** | New topic |

**Revisit** is direct but not punitive:

> **REVISIT**
> You explained what binary search does, but not why discarding half the search space is valid. Revisit the sorted-order invariant, then teach it again.

### The Result Screen Does Not Tutor

Source: `scope.md > The POC Boundary`.

The result says **what was weak**, not how to fix it. It must never become *"Here's the correct explanation of Binary Search…"* — that breaks the inversion. It may name what to revisit:

> Revisit: why the input ordering lets you eliminate one half.

The learner returns to their own source material, then teaches again. The loop stays intact: **learn elsewhere → teach → discover gap → return to material → teach again.**

---

## States and Boundaries

### Student-visible cognitive state vs. application workflow

Separate concerns. The Student Orb shows the *student's* apparent understanding; a distinct application state machine tracks *what the app is doing*. Confused is not the same thing as an error.

**Orb transitions:** Ready → Listening → Thinking → Confused → Corrected → Testing → Understanding → Mastered. Error / Offline available for provider or voice failure.

**Thinking state.** The orb is the primary processing feedback. Subtle status labels are acceptable (*"Thinking about what you said…"*, *"Still thinking…"*). No fake typing indicators, no fabricated intermediate reasoning, no transcript read-back step.

### Hidden vs. visible

**The evaluator stays hidden.** The learner sees the *results* of evaluation, never the mechanism.

*Visible to the learner:* mastery dimension, its status, evidence, a concise gap explanation, a recommendation to revisit something.

```text
Mechanism — Partial
You explained that binary search halves the search space, but did not
initially explain why sorted order makes one half impossible.
```

*Never visible:* evaluator prompts or instructions, raw evaluator JSON, hidden reasoning, model confidence numbers, system messages, internal scoring heuristics, and candidate misconceptions that were considered and rejected.

**No confidence percentages.** Showing *"82% confident you understand this"* would recreate exactly the false-precision problem percentage mastery scores were cut to avoid. If the evaluator is uncertain, behavior should **reflect** the uncertainty instead:

- ask one additional focused follow-up if the stage allows it;
- otherwise mark the dimension **Partial** rather than **Mastered**;
- or state plainly: *"I didn't get enough evidence to judge this part."*

### Diagnostic intent stays hidden until after the answer

Source: `scope.md > The Unique Kernel`.

During an active session the learner is **not** told why the evaluator selected a particular misconception. A label like *"I'm testing whether you understand the sorted invariant"* gives away the concept under test and turns the assessment into a hint. The misconception must feel like something the student genuinely misunderstood.

After completion, the result **may** explain the relationship retrospectively:

> **Misconception repaired** — the student challenged whether binary search still works without sorted input because your first explanation did not establish why ordering is necessary.

> **Rule:** do not expose diagnostic intent before the learner answers. Explain the evidence afterward.

### Voice failure states

**Microphone permission denied** — the session does not fail. The teaching room stays intact with a compact recovery state near the voice controls:

> **Microphone access is blocked**
> Allow microphone access in your browser settings, or continue by typing.
> **Try microphone again** · **Type instead**

No full-page error. Where permanent blocking is detectable, the copy is honest rather than repeatedly prompting.

**Speech recognition unavailable on the browser/device:**

> **Voice isn't available in this browser.**
> You can continue this same teaching session by typing.

The text fallback is exposed immediately. The app does not pretend the microphone can be fixed when the capability is genuinely unavailable, and browser-specific voice support is documented honestly.

**Voice fails mid-recording** — whatever partial transcript exists is preserved. Never silently discard the learner's words.

> **Voice input stopped unexpectedly.**
> We kept the transcript we received.
> **Try voice again** · **Finish this answer by typing**

An obviously incomplete partial is **not** auto-submitted to the evaluator as though the learner intentionally ended. The learner continues or explicitly submits it.

**Microphone returning later** — switching back to voice is available and does not create a new session.

### AI, network, and quota failure states

**AI provider fails after the learner completed a turn.** The turn is retained in session state and persisted before or independently of the AI response:

> **I couldn't respond right now. Your explanation is saved.**
> **Try again** · optionally **End session** if retries keep failing

The learner never repeats a 40-second explanation because a model request failed.

**Quota exhausted / provider unavailable.** Fails clearly and specifically without losing the session — never a vague *"Something went wrong"* when a specific recovery exists. The error states whether the problem is microphone, network, AI quota, auth, or service.

**Network interruption.** Triggers retry; committed turns and evaluator state remain persisted.

**Auth session expiry.** Auth-required state; the learner can sign back in and return to the session.

### Persistence and abandonment

**Committed turns and evaluator state are persisted.** The learner does not lose a completed transcript because a later AI call failed.

**Walking away mid-session.** No aggressive idle timeout. An abandoned session simply remains **In progress** with its state preserved, and the learner can continue when they return. It is never automatically completed, failed, or deleted.

Unsent typed draft text is kept client-side while the page stays open. Persisting every keystroke is not required. Losing an unsubmitted draft on reload is acceptable for the PoC; persisting it locally is nice-to-have if trivial.

A longer inactivity marker such as *"Session paused"* is deferred.

### The Continuity Rule

The defining behavior of the product, not merely error handling:

> **Failures should change the input/output mechanism, not destroy the learning state.**

Voice failure switches input to text. AI failure pauses evaluation. Network failure triggers retry. Permission failure exposes recovery. **None of these may silently create a new session or erase prior evidence.**

---

## Product Decisions

Decisions the learner made during this interview, with reasons.

- **Voice is P0 for the shipped experience but is not on the critical path for proving the engine.** The learning loop must not depend on voice technically. — From `2-scope`: *"Voice is still P0 for the shipped experience, but it should not be on the critical path for proving the learning engine."*
- **Voice and typing are two adapters over one normalized learner turn**, and typing resumes the exact same session, state, stage, and ID. — *"Failures should change the input/output mechanism, not destroy the learning state."* Continuity is product behavior, not error handling.
- **No preliminary quiz questions; the first explanation is unaided.** — *"I want the learner's first explanation to be as unaided as possible because that gives the evaluator better evidence of what they actually understand."*
- **The student never interrupts while the learner is actively speaking.** A turn ends only on Stop, reliable end-of-speech detection, or typed submission; the evaluator runs after a completed turn.
- **Sessions are evidence-driven, not scripted.** Smallest useful question each time; stay on the same conceptual gap if unresolved rather than moving on. — *"The AI student should speak as little as possible while still exposing the learner's thinking. The learner should be doing most of the talking."*
- **Session length guardrail:** about one initial explanation, one diagnostic/repair sequence, one transfer sequence, and at most one extra follow-up per stage; otherwise record the gap and finish.
- **No confidence percentages in the UI.** Uncertainty is expressed by asking one more focused follow-up, marking the dimension Partial, or saying evidence was insufficient. — *"Showing something like '82% confident you understand this' would recreate the same false-precision problem we're already avoiding with percentage mastery scores."*
- **Diagnostic intent is hidden until after the learner answers**, then explainable retrospectively. — *"If the UI says 'I'm testing whether you understand the sorted invariant' before asking the question, we've already given away the concept being tested and turned the assessment into a hint."*
- **Completed sessions are immutable, read-only attempts. Teach again creates a new attempt; it never overwrites.** — *"If I can keep talking until the result improves, the assessment loses meaning."*
- **Repeat attempts start fresh with no evaluator state carried forward** and no automatic coaching from prior weaknesses. — A fresh unaided explanation is required, and revisiting weaknesses is already in Later.
- **History is a list of attempts, not chat threads.** Repeated topics appear separately; grouping is deferred.
- **The result screen never reteaches.** It names what was weak and where to revisit, then sends the learner back to their own material. — *"That breaks the inversion again."*
- **Vague explanations do not advance the script.** The student pushes for missing reasoning instead.
- **Evidence must be grounded in the actual session.** One or two short direct excerpts where they help; concise grounded paraphrases elsewhere. Never invented evidence, and never a claim the session does not support.

---

## What We're Building

Everything the proof of concept must do to be complete, from `scope.md > The POC Boundary`.

- A learner can sign up, sign in, sign out, and stay signed in across refreshes.
- A learner can start a session by naming any topic.
- Voice-first teaching with live partial transcript as the dominant center object, and **Type instead** as an equal-pipeline fallback.
- The AI Student speaks as a student, in short turns, never tutoring.
- The hidden Learning Evaluator produces schema-validated structured output covering all four mastery dimensions.
- One targeted misconception selected against the learner's actual gap, and a repair loop that stays on that gap until resolved or recorded as unresolved.
- At least one transfer question, with one focused follow-up permitted.
- A structured result with overall state, four dimensions, quoted evidence, and revisit guidance.
- Sessions persisted with transcript, evaluator state, and result; listed in the sidebar as attempts; completed attempts reopenable read-only.
- RLS on user-owned data with no cross-user access.
- Prompt-injection boundaries that keep learner content from changing evaluator state or privileged actions.
- Minimal server-side request limits with clear quota-exhausted UX.
- One polished teaching room, deployment-ready.
- Text loop working end to end with no voice dependency, per the confirmed sequencing.

### Mastery dimensions

Four required, categorical states only: `untested` / `weak` / `partial` / `mastered`.

- **Core idea** — can the learner state what the concept is?
- **Mechanism** — can they explain how/why it works?
- **Misconception repair** — can they correct the targeted wrong model?
- **Transfer** — can they apply the idea to a nearby unfamiliar case?

### Acceptance criteria

**Product**
- [ ] A first-time user understands the inversion without developer explanation.
- [ ] One complete session runs end to end.
- [ ] The AI behaves primarily as a student and never gives the full correct explanation unprompted.
- [ ] The session contains a diagnostic misconception and at least one transfer test.
- [ ] Learner explanations are never interrupted mid-speech.
- [ ] Every result claim traces to real session evidence; no unsupported dimension is credited.
- [ ] Completed attempts persist and appear in history, read-only.

**Voice**
- [ ] Microphone permission has a clear UX with a recovery path.
- [ ] Start and stop controls are obvious.
- [ ] The transcript visibly updates live.
- [ ] **Type instead** resumes the same session with stage, state, and transcript intact.
- [ ] Voice failure preserves the partial transcript and never discards the learner's words.

**Evaluation**
- [ ] Mastery is never granted on a generic model compliment alone.
- [ ] No confidence percentages appear anywhere in the UI.
- [ ] Diagnostic intent is not exposed before the learner answers.
- [ ] Invalid evaluator output never directly mutates persisted mastery state.
- [ ] Mixed evidence yields Almost there or Revisit, never a fake mastery animation.

**Security**
- [ ] Unauthenticated users cannot read another user's sessions.
- [ ] RLS enabled on all exposed user-owned tables, with allow and deny cases tested.
- [ ] No service-role key or AI secret reaches the browser.
- [ ] Prompt-injection attempts cannot change authorization or privileged state.
- [ ] Untrusted transcript and model text render as escaped text, never raw HTML.

**Demo**
- [ ] The golden path is demonstrable in under two minutes.
- [ ] Binary Search is a prepared deterministic topic.
- [ ] Additional topics are tested to show the mechanism generalizes.
- [ ] No prerecorded or mocked AI output in the demo.

---

## Deferred From the POC

Named so they don't slip into the build unnoticed.

- **Grouping history by topic** — flat attempt list is enough now; the data model doesn't block it later.
- **Intentionally revisiting prior weaknesses across sessions** — needs attempt-level history analysis and risks contaminating unaided explanations.
- **A verifier/critic second pass** — only add if testing shows the evaluator is too permissive. Don't add it to look sophisticated.
- **Client-side draft persistence** — nice-to-have, not required; losing an unsubmitted draft on reload is acceptable.
- **A "Session paused" inactivity marker** — deferred; no auto-complete, fail, or delete.
- **Browser-specific voice paths beyond one working primary** — document what's supported honestly rather than polyfilling.
- **Precomputed speech audio for the student** — cut first; student responses stay text.
- **A dedicated design pass on the result screen** — flagged and agreed in `3-prd`, not a new feature. The result screen carries the most product weight (evidence, gaps, revisit guidance, retrospective misconception explanation), so it needs focused design attention to stay diagnostic rather than drifting back into tutoring. Watch it during build/polish; it adds no scope.

---

## Possible Later Enhancements

- A fifth mastery dimension for limits and edge cases, if reliability allows.
- Bringing a learner's prior weaknesses back into a later session deliberately.
- Student responses spoken aloud (TTS).
- Richer orb animation states and transitions.
- OAuth sign-in.
- Attempt timelines per topic, and historical progress across attempts.
- Mobile-specific polish beyond basic responsiveness.

---

## Non-Goals

From `scope.md > Explicitly Cut`, plus what will tempt during the build.

- **Arbitrary percent mastery scores** — precision the evidence doesn't support.
- **Model confidence percentages** — same false-precision problem.
- **Prerecorded or mocked AI output for the demo** — if a dependency fails, switch to the typed fallback or the local model rather than faking the loop.
- **Multi-provider failover engineering** — provider adapter, one hosted provider, one local dev fallback.
- **Exposing diagnostic intent mid-session** — it converts the assessment into a hint.
- **Explaining the concept on the result screen** — breaks the inversion.
- **Appending turns to a completed attempt** — would let the learner talk until the result improves.
- **Carrying evaluator state into a repeat attempt** — contaminates the unaided explanation.
- **Idle timeout that fails or deletes a session** — someone walking away is not a failure.
- **Auto-submitting an obviously incomplete partial transcript.**
- **A permanent chat composer as the primary UI** — text is an accessibility and fallback path.
- **Spaced repetition, notifications, streak mechanics** — the product is one session done honestly.
- **Multi-agent orchestration** — one model, multiple logical roles.
- **Vector DB, embeddings, RAG, fine-tuning** — the misconception is generated against the learner's own words, not retrieved.
- **Native apps, classrooms, payments, certificates, social features, leaderboards.**

---

## Open Questions

Product-level questions only. Stack, providers, and schema belong to `4-spec`.

- **None blocking `4-spec`.**

Resolved during this interview and recorded above: reopening behavior (read-only attempts), Teach again semantics (new attempt, no carry-forward), evaluator visibility (hidden mechanism, visible results), confidence metadata (none in UI), and why a misconception was chosen (hidden during, explained after).

Still to be settled during the build, by testing rather than by more product discussion:

- Exact student wording varies per session — semantic content is specified, literal phrasing is not.
- Whether end-of-speech turn detection is reliable enough to include; Stop is the guaranteed path.
- Numeric values for rate limits, turn caps, and input length limits.
- Whether the browser's chosen speech path needs documented browser-specific caveats.