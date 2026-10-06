# Feynman-in-a-Loop — Working PRD

> This is the project's **internal working PRD**. It is not a substitute for the hackathon-required `devpost/prd.md`, which must be generated through the official Devpost Learn Skill Pack.

Status: **Working**  
Last updated: **7 October 2026**

## 1. Product summary

Feynman-in-a-Loop is a voice-first learning web app where the learner teaches an AI student.

Instead of asking an AI to explain a topic, the user explains it. The AI student listens, asks questions, adopts or exposes targeted misconceptions, and challenges the learner to repair the student's understanding. A hidden evaluator tracks evidence of understanding and ends the session with a structured mastery result.

## 2. Problem

Learners often mistake familiarity for understanding.

Reading an explanation, watching a video, or recognizing the correct answer can create confidence without proving that the learner can:
- reconstruct the concept unaided;
- explain why it works;
- detect a wrong mental model;
- transfer it to a new case.

General-purpose chatbots can role-play this experience, but they do not automatically provide a persistent, structured teaching protocol with mastery evidence and learning history.

## 3. Product principle

> The learner should spend more time **explaining and correcting** than receiving explanations.

The AI may ask, challenge, misunderstand, or summarize its current model. It should not routinely take over and teach the concept back to the user.

## 4. Target audience

### Primary
Self-directed students and early-career learners studying technical or conceptual subjects.

### Secondary
Developers, researchers, and professionals checking whether they truly understand something they recently learned.

### Not targeted in the MVP
- classrooms and institutions;
- children requiring special education safeguards;
- formal exam grading;
- credentialing;
- clinical or regulated assessment.

## 5. Core user story

> As a learner who just studied a topic, I want to teach it to an AI student so that weak parts of my understanding are exposed before I move on.

## 6. User journey

### First visit
1. User lands on the product.
2. Value proposition explains: **You teach. The AI learns.**
3. User signs up/signs in.
4. User starts a new session.

### Start session
1. User names a topic.
2. Optional one-line prompt: "What did you just learn?"
3. App creates a learning session.
4. Student Orb enters **Ready** state.

### Teach
1. User starts microphone.
2. Orb enters **Listening**.
3. Transcript appears.
4. User stops speaking.
5. Orb enters **Thinking**.
6. Student responds with a learner-like question or misunderstanding.

### Repair
1. Learner explains again.
2. Evaluator tracks whether the missing concept was resolved.
3. Student's visible state changes.

### Transfer
1. Student presents a nearby but unfamiliar scenario.
2. Learner answers.
3. Evaluator scores transfer evidence.

### Finish
1. App presents result.
2. Result shows strengths, gaps, and evidence.
3. Session is persisted.
4. User can reteach or start another topic.

## 7. Functional requirements

### FR-1 Authentication
- User can sign up, sign in, sign out.
- Authenticated session persists across refreshes.
- User-specific data is isolated.

### FR-2 Session creation
- User can create a session with a topic.
- Session has a unique ID, owner, state, and timestamps.
- Empty/invalid topic input is rejected.

### FR-3 Voice input
- User can explicitly start/stop capture.
- App communicates microphone state clearly.
- Recognized speech becomes transcript text.
- Permission denial has a clear recovery path.

### FR-4 AI Student
- Student responds from a learner role.
- Student does not immediately supply the full correct explanation.
- Student asks questions based on the learner's actual explanation.
- At least one diagnostic misconception/challenge occurs.

### FR-5 Evaluator
- Evaluator receives structured session context.
- Evaluator returns validated structured output.
- Output includes mastery dimensions, evidence, gaps, next action, and confidence/reliability metadata where appropriate.
- Invalid output does not directly mutate persistent mastery state.

### FR-6 Transfer
- System generates at least one transfer question not identical to the learner's original example.
- Evaluator records whether the learner applied the concept correctly.

### FR-7 Mastery result
- App shows a human-readable overall state.
- App shows dimension-level evidence.
- Result never relies solely on a generic model compliment.

### FR-8 Persistence
- Session metadata is saved.
- Transcript/turns are saved.
- Final mastery state is saved.
- User can list and reopen previous sessions.

### FR-9 Sidebar
- New Session action
- Recent sessions
- Status indicator per session
- Profile/account area

### FR-10 Failure handling
App must handle:
- AI provider unavailable/quota exhausted;
- malformed model output;
- speech recognition unavailable;
- microphone permission denied;
- network interruption;
- auth session expiry.

The user should not silently lose their completed transcript/session.

## 8. Non-functional requirements

### Usability
- Primary path should be understandable without onboarding documentation.
- Voice controls must be keyboard accessible where feasible.
- Status must not rely only on color.

### Performance
- UI state changes should be immediate.
- Slow AI/voice operations require visible loading/thinking states.
- Avoid blocking the UI on persistence when optimistic handling is safe.

### Security
See [SECURITY.md](./SECURITY.md).

### Privacy
- Store only data needed for the proof of concept.
- Clearly distinguish browser-safe public keys from server secrets.
- Do not claim voice data is private/offline unless the chosen provider actually guarantees that behavior.

### Cost
- AI/voice path must have a zero-dollar route for the hackathon.

## 9. Session state model

Suggested high-level states:

`draft → ready → listening → evaluating → student_response → listening → transfer → assessing → completed`

Error/recovery states:
- `voice_error`
- `ai_error`
- `quota_limited`
- `auth_required`

Student-visible cognitive states are separate from application workflow state.

## 10. Mastery states

Prefer understandable categories:

- **Mastered**
- **Almost there**
- **Revisit**

Supporting dimensions:
- Core idea
- Mechanism
- Misconception repair
- Transfer
- Optional: limits/edge cases

## 11. UX requirements

- Main workspace must not look like a conventional text-chat composer.
- Student Orb is the signature visual element.
- Transcript is a teaching record, not a chat bubble wall.
- Sidebar is learning history, not generic chat history.
- Animations must communicate state.
- The final mastery transition should be visually memorable but restrained.

See [DESIGN.md](./DESIGN.md).

## 12. Success criteria for the hackathon

A judge should be able to say after the demo:

> "I taught the AI, it misunderstood something important, I corrected it, it tested me on a new case, and the app used that interaction to decide what I actually understood."

## 13. Product risks

| Risk | Consequence | Response |
|---|---|---|
| AI student becomes a tutor | Product loses its core inversion | Strict role/state prompts + tests |
| Misconceptions are random/wrong | Learning experience becomes misleading | Evaluator validates relevance before presenting |
| Mastery feels arbitrary | Trust collapses | Show dimension evidence; avoid fake precision |
| Voice stack is unreliable | Demo fails | Text fallback + deterministic demo |
| Free API quota fails | Public demo breaks | Provider adapter + fallback/demo mode |
| UI becomes generic chatbot | Innovation is visually hidden | Voice-first center + Student Orb |
| Prompt injection | User can manipulate grading or leak instructions | Defense in depth; see security plan |

## 14. Open product decisions

- Exact zero-cost AI provider/model
- Exact speech recognition path
- Whether student speaks responses aloud in MVP
- Exact mastery scoring formula
- Exact misconception selection algorithm
- Whether transcript is fully visible during teaching or progressively summarized
- Final dark/light theme behavior
