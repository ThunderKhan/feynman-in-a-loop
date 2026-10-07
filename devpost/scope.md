---
doc: scope
status: approved
approved: 2026-10-07
---

# Feynman-in-a-Loop

A voice-first web app where you teach an AI student, and the AI's misunderstandings are the exam.

## The Unique Kernel

The inversion, backed by a hidden evaluator that actually measures you.

A generic chatbot can role-play a student. What it can't do is *hold an evidence standard*. Feynman-in-a-Loop runs the student as a front end for a structured learning evaluator: the student asks, misunderstands, and probes, but a separate hidden role decides what you demonstrated, picks the one misconception worth testing, decides when to stop and move to transfer, and emits dimension-level mastery state that gets validated before it's persisted. The student's confusion is not improvised — it's selected against your specific gap.

If you deleted the evaluator and just prompted "you are a student who misunderstands things," you'd have a gimmick. That invisible part is the core differentiator. It is what makes this more than role-play — but it is not a claim of business defensibility, only the mechanism this PoC actually demonstrates.

## Who It's For

A self-directed learner who just finished studying something — a student after binary search, a developer after recursion, a researcher after reading a paper — and wants to know whether they actually understand it or just recognize it.

Today, that check is: reread the notes, ask a chatbot, or take it on faith. ChatGPT will happily tell you that your explanation was excellent. That's the failure this replaces.

## The Core Loop

You name a concept, hit **Teach**, and explain it out loud. The Student Orb listens and the transcript fills in. The AI student asks a short follow-up, then adopts one plausible misconception tied to something you actually said or failed to justify. You repair it. It asks a nearby but unfamiliar case. You answer. A result screen tells you what you successfully taught, where your explanation broke, and what to revisit — with evidence quoted from the session.

You come back because the result is uncomfortable. A fluency score would tell you nothing; being told your explanation never justified *why* one half can be discarded is the entire reason to return.

## Inspiration & Identity

> **a beautiful room where you are teaching another mind**

Reference qualities: Figma Docs (editorial spacing, understated), Claude (calm conversational surfaces, typography), Perplexity (hierarchy, contextual navigation), ChatGPT (familiar sidebar conventions). Do not copy any of them pixel-for-pixel.

The **Student Orb** is the signature object — not a mascot, a state visualization: Ready, Listening, Thinking, Confused, Corrected, Testing, Understanding, Mastered, Error. Motion maps to meaning (amplitude → listening, instability → confusion, settling → understanding, brief expansion → mastery) and respects `prefers-reduced-motion`.

Dark calm neutral base, one accent, editorial typography that renders long transcripts well. The transcript reads as a teaching notebook, annotated at Misconception / Correction / Transfer Test / Mastery Evidence — not as a chat wall.

Avoid: neon AI SaaS, excessive glassmorphism, gratuitous gradients, cartoon robots, dashboard clutter.

## Why This Matters to the Learner

From you:

> "turn the Feynman Technique into an interactive loop for testing actual understanding rather than passive familiarity."

Familiarity is mistaken for understanding constantly, and nothing in the current workflow catches it. You want to finish this able to explain and defend the technical decisions yourself — not hand over generated code and call it a project.

## What "Working" Looks Like

A judge opens the deployed app, signs in, types **Binary Search**, hits Teach, and speaks for about forty seconds while the orb listens and the transcript fills in. The student interrupts with a question that shows it was listening, then:

> "So if I check the middle, I can discard either half even if the list isn't sorted?"

You correct it by voice. The orb settles into Corrected. The student asks whether the same logic finds a word in an alphabetically sorted list. You answer. The result screen reads:

```text
YOU TAUGHT ME
Binary Search
MASTERED
✓ Core idea   ✓ Mechanism   ✓ Misconception repair   ✓ Transfer
Evidence: "Explained why sorted order lets one half be discarded."
```

Then the sidebar shows it saved, and they can reopen it.

**The "oh, that's cool" beat:** the student's misconception is *specific to something you got wrong or glossed over* — and the result screen quotes your own words back as evidence. That's when it stops feeling like a chatbot and starts feeling like it was measuring you.

## The POC Boundary

**In — one vertical slice:**

- Voice-first teaching room, with **"Type instead"** as a recoverable fallback feeding the identical engine.
- AI Student role (in-character, never tutors).
- Hidden Learning Evaluator with structured, schema-validated output.
- One targeted misconception per session, selected against a real gap.
- At least one transfer question.
- Four mastery dimensions, categorical states only: `untested` / `weak` / `partial` / `mastered`.
- Session persistence in three small tables; email auth; RLS on user-owned rows.
- Minimal server-side request limits and injection boundaries.
- One polished teaching screen plus minimal session history.
- Public deployment.

**Rule for cuts:** simplify the supporting layers, never weaken the loop.

## Later

- Optional verifier/critic pass if testing shows the evaluator is too permissive.
- Limits/edge-cases as a fifth mastery dimension.
- Bringing prior weaknesses back in later sessions.
- TTS for student responses (cut first).
- Richer orb animation (cut second).
- OAuth, detailed analytics, mobile-specific polish.
- Equal misconception quality across every domain. The architecture is topic-agnostic — a user can enter an arbitrary topic — but the PoC does not claim uniform quality there. **Binary Search** is the deterministic demo/test topic; several additional topics are tested to show the mechanism generalizes, not to prove parity.

## Explicitly Cut

- **Arbitrary percent mastery scores** — a number like 91% implies precision the evidence doesn't support. Categorical states with quoted evidence instead.
- **Prerecorded or mocked AI output for the demo** — if a dependency fails during recording, switch to the typed fallback or the local model. Faking it would invalidate the one thing the demo exists to prove.
- **Multi-provider failover system** — provider adapter, one hosted provider, one local dev fallback. Abstraction yes, failover engineering no.
- **Spaced repetition, notifications, streak mechanics** — the product is a single session done honestly.
- **Multi-agent orchestration** — one model, multiple logical roles. Role separation without runtime complexity.
- **Vector DB, embeddings, RAG, fine-tuning** — the misconception is generated on the fly against the learner's own words, not retrieved.
- **Chat-style composer as the primary UI** — text is an accessibility fallback, not the product.
- **Native apps, classrooms, payments, certificates, social features** — different product.
