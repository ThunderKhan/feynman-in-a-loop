# Feynman-in-a-Loop — Design

Status: **Working design direction**  
Last updated: **7 October 2026**

## Design goal

The product should feel like:

> **a beautiful room where you are teaching another mind**

Not:
- another chatbot;
- a generic AI SaaS dashboard;
- a neon voice assistant;
- a school LMS.

## Reference qualities

Draw inspiration from:
- Figma Docs — editorial spacing, clarity, understated interface;
- Claude — calm conversational surfaces and typography;
- Perplexity — strong hierarchy and contextual navigation;
- ChatGPT — familiar sidebar/navigation conventions.

Do not copy any product pixel-for-pixel.

## Core visual idea

The **AI Student Orb** is the signature object.

The orb is not a mascot. It is a state visualization.

Possible states:
- Ready
- Listening
- Thinking
- Confused
- Corrected
- Testing
- Understanding
- Mastered
- Error / Offline

Motion should communicate state rather than decorate the screen.

## Primary layout

Desktop:

```text
┌─────────────────┬─────────────────────────────────────────────┐
│ Feynman         │                                             │
│ in a Loop       │               Topic / Session               │
│                 │                                             │
│ + New Session   │                     ◉                       │
│                 │                 Student Orb                 │
│ Today           │                                             │
│ Binary Search ✓ │              Voice Visualizer               │
│ Recursion      △│                                             │
│ Gradient      ↺ │               Live Transcript               │
│                 │                                             │
│                 │            Student question/state           │
│                 │                                             │
│─────────────────│              Voice Controls                 │
│ Profile         │                                             │
└─────────────────┴─────────────────────────────────────────────┘
```

## Main-screen hierarchy

1. Topic/session identity
2. Student Orb
3. Voice state + visualizer
4. Current transcript
5. Student response / diagnostic question
6. Current learning state
7. Controls

Do not let the transcript grow into a conventional endless chat wall.

## Sidebar

Required:
- product identity;
- **New Session**;
- recent sessions;
- session state;
- profile menu.

Useful status language:
- Mastered
- Almost there
- Revisit
- In progress

Possible groupings:
- Today
- Recent
- Mastered
- Revisit

For MVP, grouping can remain simple.

## New Session experience

A new session should ask for the topic with minimal friction.

Possible copy:

> **What are you going to teach me?**

Input:
- topic name;
- optional one-line context later.

Primary CTA:
- **Start teaching**

Avoid model/provider controls.

## Teaching Room states

### Ready
- quiet orb;
- "I'm ready when you are.";
- primary Teach button.

### Listening
- microphone active;
- responsive visualizer;
- live transcript;
- clear Stop action.

### Thinking
- restrained orb motion;
- preserve transcript;
- no fake typing delay.

### Confused / diagnostic
- student question becomes focal;
- subtle visible state;
- learner is invited to clarify.

### Testing
- clearly distinguish transfer challenge from confusion.

### Mastered
- meaningful transition;
- evidence-based result;
- restrained celebration.

### Error
- explain whether problem is microphone, network, AI quota, auth, or service.
- never replace a technical error with vague "Something went wrong" if recovery can be specific.

## Transcript design

Transcript should feel like a teaching notebook.

Prefer:
- continuous readable text;
- timestamps only when useful;
- annotations for important learning moments;
- clear distinction between learner and student.

Potential annotations:
- Misconception
- Correction
- Transfer Test
- Mastery Evidence

Avoid:
- oversized chat bubbles for every sentence;
- avatar repetition;
- message chrome that competes with the teaching content.

## Mastery result

Result should answer:

1. What did I successfully teach?
2. Where did my explanation break?
3. What evidence caused the result?
4. What should I revisit?

Suggested structure:

```text
YOU TAUGHT ME
Binary Search

MASTERED

✓ Core idea
✓ Mechanism
✓ Misconception repair
✓ Transfer

Evidence
"Explained why sorted order lets one half be discarded."

Revisit
No critical gaps detected.
```

Avoid arbitrary percent scores unless their calculation is defensible.

## Visual system

### Color
Start with a dark, calm neutral base.

Use one primary accent for:
- active microphone;
- focus;
- important state;
- mastery transition.

Do not use multiple neon gradients as decoration.

### Typography
Priorities:
- highly readable;
- editorial;
- good long-form transcript rendering;
- clear hierarchy;
- restrained weights.

Exact typeface is open.

### Surfaces
- soft elevation;
- subtle borders;
- minimal glass effects;
- generous whitespace.

### Motion
Motion must map to meaning:
- amplitude → listening;
- pulse/phase → thinking;
- instability → confusion;
- settling → understanding;
- brief expansion → mastery.

Respect `prefers-reduced-motion`.

## Base UI adaptation

The Bolt-style React/Tailwind component is accepted as visual scaffolding.

Keep/adapt:
- strong centered composition;
- dark neutral foundation;
- responsive Tailwind patterns;
- polished controls;
- animation techniques.

Remove:
- ChatInput;
- ModelSelector;
- Build Now;
- Figma/GitHub import;
- coding assistant language;
- large blue-ray identity if it overwhelms the learning experience.

## Responsive design

### Desktop
Sidebar persistent.

### Tablet
Sidebar collapsible.

### Mobile
- drawer for sessions;
- Student Orb remains central;
- microphone control stays thumb-accessible;
- transcript remains readable;
- no tiny mastery grid.

The hackathon demo is desktop-first, but basic mobile usability should not break.

## Accessibility requirements

- Visible keyboard focus.
- Controls have accessible names.
- State is not communicated only by color.
- Provide transcript for voice content.
- Respect reduced motion.
- Sufficient contrast.
- Microphone start/stop is explicit.
- Do not auto-record on page load.
- Error messages are text, not animation only.

## Design review questions

Before accepting a screen:
- Can a new user tell that **they teach the AI**?
- Is voice obviously the primary interaction?
- Is the Student Orb conveying state rather than acting as decoration?
- Does the UI still work with animation disabled?
- Does it look like one product rather than several component libraries?
- Is the current learning state understandable within 3 seconds?
