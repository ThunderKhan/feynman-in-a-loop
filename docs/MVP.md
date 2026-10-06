# Feynman-in-a-Loop — MVP

Status: **Active build boundary**  
Last updated: **7 October 2026**

## MVP statement

The MVP must prove one complete learning loop:

> A learner teaches a concept by voice to an AI student, the student exposes a plausible misunderstanding, the learner repairs it, the system tests transfer, and the session ends with an evidence-based mastery result that is saved to the learner's history.

If a feature does not improve that loop or make it demonstrable to a judge, it is probably not MVP.

## Primary user

A self-directed learner who has just studied a concept and wants to test whether they can actually explain and transfer it.

Examples:
- a student after learning binary search;
- a developer after learning recursion;
- a learner after studying gradient descent;
- a researcher after reading a technical concept.

## Primary job to be done

> "I think I understand this topic. Let me prove it by teaching someone who will challenge weak parts of my explanation."

## Golden path

1. User signs in.
2. User starts a new session.
3. User enters a topic name.
4. User presses **Teach**.
5. User explains the topic by voice.
6. Speech appears as a live or near-live transcript.
7. AI student responds as a learner, not a tutor.
8. AI student surfaces one targeted misconception or asks a diagnostic question.
9. User explains/corrects it.
10. AI student asks at least one transfer/follow-up question.
11. Evaluator updates structured mastery state.
12. Session ends with a clear result: **Mastered**, **Almost there**, or **Revisit**.
13. Session is saved.
14. User sees it in the sidebar/history and can reopen the result.

## MVP screens

### 1. Authentication
- Sign up
- Sign in
- Sign out
- Session persistence

### 2. Home / New Session
- Topic input
- Start session
- Recent learning sessions

### 3. Teaching Room
- Topic header
- Student Orb
- Voice visualizer
- Start/stop control
- Transcript
- AI student response
- Student state
- Current learning-stage indicator

### 4. Session Result
- Overall result
- Evidence by mastery dimension
- Misconception repaired
- Transfer result
- "Teach again" / "New topic"

### 5. Session History
- Previous topics
- Status
- Date
- Reopen result/session summary

## MVP mastery dimensions

The first version should evaluate a small, understandable set:

1. **Core idea** — can the learner state what the concept is?
2. **Mechanism** — can they explain how/why it works?
3. **Misconception repair** — can they correct a plausible wrong model?
4. **Transfer** — can they apply the idea to a slightly different case?

Optional fifth dimension if reliable:
5. **Limits / edge cases**

Do not expose fake precision. A score such as 91% is only acceptable if the UI makes clear how it is derived. Prefer a small number of evidence-backed states over arbitrary decimals.

## Definition of mastery for the PoC

The MVP may mark a topic **Mastered** only when:
- the learner gives a minimally coherent explanation;
- the learner repairs at least one relevant misconception or answers an equivalent diagnostic challenge;
- the learner passes at least one transfer question;
- the evaluator returns valid structured evidence for each required dimension.

The app must never mark mastery solely because the model says "good job."

## In scope

- Voice-first interaction
- Transcript
- AI student role
- Evaluator role
- Controlled misconception loop
- Transfer question
- Structured mastery state
- Supabase Auth
- Persistent sessions
- Supabase RLS
- Responsive desktop-first UI
- Vercel deployment
- Zero-dollar AI/inference strategy
- Basic rate limiting / quota protection
- Prompt-injection defenses
- Graceful model/voice failure states

## Explicitly out of scope

- Native mobile apps
- Teacher/classroom accounts
- Courses or curriculum authoring
- Social feeds
- Leaderboards
- Payments
- Certificates
- Long-term spaced repetition
- Large RAG system
- Vector database
- Fine-tuning
- Multi-agent orchestration for its own sake
- User-selectable model dropdown
- File uploads in the first MVP
- Rich text chat as the primary interaction
- Full academic validation of the mastery score

## MVP acceptance criteria

### Product
- [ ] A first-time user understands the inversion ("I teach the AI") without explanation from the developer.
- [ ] One complete session can be finished end to end.
- [ ] The AI behaves primarily as a student.
- [ ] The session contains a diagnostic misconception/challenge and a transfer test.
- [ ] The mastery result cites evidence from the session.
- [ ] Completed sessions persist and appear in history.

### Voice
- [ ] Microphone permission has a clear UX.
- [ ] Start and stop controls are obvious.
- [ ] Transcript visibly updates.
- [ ] Voice failure falls back gracefully rather than losing the session.

### Security
- [ ] Unauthenticated users cannot read another user's sessions.
- [ ] RLS is enabled on all exposed user-data tables.
- [ ] No service-role key or AI secret is shipped to the browser.
- [ ] Prompt-injection attempts cannot directly change authorization or privileged state.
- [ ] Invalid model JSON is rejected or repaired safely.

### Demo
- [ ] The golden path can be shown in under 2 minutes.
- [ ] A deterministic topic/demo path is prepared.
- [ ] A fallback recording or screenshots exist if a free AI/voice provider fails.

## Cut order if time gets tight

Cut in this order:

1. AI-spoken voice output — keep student response as text.
2. Advanced orb animation — keep state changes simple.
3. OAuth — keep email auth.
4. Detailed historical analytics.
5. Edge-case mastery dimension.
6. Multiple AI providers.
7. Mobile-specific polish beyond basic responsiveness.

Do **not** cut:
- student inversion;
- misconception/diagnostic step;
- transfer test;
- structured mastery evidence;
- session persistence;
- security boundaries;
- coherent demo.
