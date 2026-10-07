# Feynman-in-a-Loop

> **Do not ask AI whether you understand something. Prove that you understand it by teaching an AI student.**

Feynman-in-a-Loop is a voice-first learning proof of concept for **Build With AI: Basics** on Devpost.

Instead of using AI as the tutor, the learner becomes the teacher. The AI behaves like a deliberately imperfect student: it listens, asks questions, exposes plausible misconceptions, lets the learner repair them, and tests whether the concept transfers to a new case.

## Status

**Implementation in progress.**

Scope, PRD, and technical spec are approved. Slice 1 (Next.js + Supabase auth/session shell) is live-verified; Slice 2 is implementing and verifying the database invariants before the AI kernel is wired in. Groq is the selected hosted AI provider, with **GPT-OSS 120B** chosen by the Slice 3 benchmark; the text-learning kernel is now ready for live end-to-end verification.

## Core loop

```text
Learn
  ↓
Teach the AI student
  ↓
Student exposes a misconception / gap
  ↓
Learner repairs it
  ↓
Student tests transfer
  ↓
Evidence-based mastery result
  ↺
```

## Documentation

Start with:

- [Project context](./context.md) — authoritative decisions and constraints
- [Documentation index](./docs/README.md)
- [MVP](./docs/MVP.md)
- [Working PRD](./docs/PRD.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [AI system](./docs/AI_SYSTEM.md)
- [Implementation plan](./docs/IMPLEMENTATION_PLAN.md)
- [Design](./docs/DESIGN.md)
- [UI component inventory](./docs/UI_COMPONENTS.md)
- [Security](./docs/SECURITY.md)
- [Testing](./docs/TESTING.md)
- [Demo plan](./docs/DEMO_PLAN.md)

## Current technical direction

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS v4
- shadcn/ui
- Supabase Auth
- Supabase PostgreSQL + Row Level Security
- Vercel
- Groq free tier for hosted AI; Ollama for local development
- Web Speech API as the planned voice path, with typed fallback

## Hackathon planning documents

Build With AI: Basics requires the official Devpost Learn Skill Pack to generate:

- `devpost/scope.md`
- `devpost/prd.md`
- `devpost/spec.md`

Those files will be produced through the Skill Pack workflow rather than manually fabricated.

## Current MVP

A user should be able to:

1. sign in;
2. start a topic;
3. teach it by voice;
4. see a transcript;
5. receive a targeted student misunderstanding;
6. correct it;
7. answer a transfer question;
8. receive a structured mastery result;
9. see the session saved in learning history.

See [docs/MVP.md](./docs/MVP.md) for the full boundary.

## Security

AI input and output are treated as untrusted.

The project explicitly plans for:
- prompt injection;
- mastery manipulation;
- Supabase RLS and cross-user isolation;
- server-only secret handling;
- model-output schema validation;
- quota/rate abuse.

See [docs/SECURITY.md](./docs/SECURITY.md).

## License

An open-source license will be added before submission, as required by the hackathon.
