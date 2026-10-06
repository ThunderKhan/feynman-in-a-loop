# Feynman-in-a-Loop — Demo & Submission Plan

Status: **Working**  
Last updated: **7 October 2026**

## Constraint

Build With AI: Basics requires a public demo video of 1–3 minutes. Judges are not required to watch past three minutes.

The demo must therefore show the product, not merely describe it.

## Demo objective

Within the first 15–20 seconds, the judge should understand:

> **Most AI learning tools teach you. In Feynman-in-a-Loop, you teach the AI.**

By the end, the judge should have seen:
- voice input;
- transcript;
- AI student behavior;
- misconception repair;
- transfer test;
- mastery result;
- learning history.

## Recommended demo topic

Primary candidate:
**Binary Search**

Why:
- broadly understandable;
- easy to explain quickly;
- has a clear misconception around sorted input/search-space elimination;
- easy to create a transfer question;
- fits a short demo.

Prepare at least one backup topic.

## Target demo sequence

### 0:00–0:15 — Problem + inversion
Show the product immediately.

Narrative:
- "Reading something can make you feel like you understand it."
- "This app makes you prove it by teaching an AI student."

Do not spend 30 seconds on slides.

### 0:15–0:30 — Start session
- New Session
- Topic: Binary Search
- Start teaching

### 0:30–1:05 — Teach by voice
Speak a concise explanation.
Show:
- Student Orb listening;
- visualizer;
- transcript.

### 1:05–1:30 — Misconception
AI student asks something like:

> "So if I check the middle, I can discard either half even if the list isn't sorted?"

Correct it by voice.

Show the student state update.

### 1:30–1:55 — Transfer
Student asks a new case:
- alphabetically sorted words;
- or asks what property makes half-elimination valid.

Answer briefly.

### 1:55–2:15 — Mastery result
Show:
- overall state;
- four dimensions;
- evidence;
- repaired misconception.

### 2:15–2:30 — Persistence/history
Show sidebar/history.
Briefly state:
- Next.js;
- Supabase;
- zero-cost AI approach;
- prompt-injection/security boundaries.

### 2:30–2:45 — Close
One sentence:
> "Instead of letting AI do the learning for you, Feynman-in-a-Loop makes the AI your student."

Leave buffer under 3:00.

## Presentation priorities

Judging criteria include:
- Design
- Potential Impact
- Innovation / Idea
- Presentation

The demo should therefore explicitly prove all four.

### Design
Show the polished teaching room and visible state transitions.

### Impact
Explain the false-mastery problem in one sentence.

### Innovation
Emphasize the inversion + structured misconception/transfer loop, not merely "AI student."

### Presentation
One clean story. No feature tour.

## Recording rules

- Record at 1080p if practical.
- Keep browser zoom/readability appropriate.
- Use clear microphone audio.
- No copyrighted background music.
- Hide bookmarks/personal notifications.
- Use a clean demo account.
- Preload the app and confirm auth.
- Disable unrelated notifications.
- Keep cursor movement deliberate.

## Live dependency fallback

Free AI and voice services may fail.

Before recording:
- rehearse at least 3 times;
- have a backup provider/path if practical;
- preserve a deterministic text/debug path;
- capture screenshots of important states;
- do not depend on a first-ever live API call during final recording.

The submitted video itself should demonstrate real functioning behavior.

## Submission repository checklist

- [ ] Public repository
- [ ] Open-source license
- [ ] README with project overview
- [ ] Setup instructions
- [ ] `.env.example`
- [ ] Required Devpost Learn planning docs
- [ ] Clear technologies section
- [ ] Honest limitations
- [ ] External code/components disclosed as required
- [ ] No secrets
- [ ] Public deployment link
- [ ] Demo video link

## README sections to add before submission

- What it is
- Why it exists
- How it works
- Demo
- Core learning loop
- Tech stack
- Architecture
- Security
- Local setup
- Environment variables
- Known limitations
- Hackathon / Devpost Learn process
- License

## Final submission checks

On 26 October 2026:
- open the repo logged out;
- open deployment in incognito;
- confirm video visibility;
- confirm no broken relative images;
- confirm required docs exist;
- confirm deadline/timezone;
- submit with buffer.

Do not leave video upload or Devpost form completion to the final hour.
