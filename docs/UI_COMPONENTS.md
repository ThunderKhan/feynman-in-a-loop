# Feynman-in-a-Loop — UI Component Inventory

Status: **Working inventory**  
Last updated: **7 October 2026**

This is not a final design system. It identifies what we need so we can deliberately source, build, or adapt components later.

## Component strategy

Use:
- shadcn/ui for dependable primitives;
- 21st.dev as a component discovery source;
- Vercel AI Elements only where an AI-specific primitive helps;
- Magic UI / Aceternity sparingly for motion;
- custom components for the product's signature teaching interaction.

Do not mix five visual languages without restyling them into one system.

## App shell

### AppSidebar
Contains:
- logo/name;
- New Session;
- session list;
- compact status;
- profile menu.

Likely primitives:
- Sidebar
- ScrollArea
- DropdownMenu
- Avatar
- Button
- Tooltip

### MobileSidebarDrawer
For tablet/mobile navigation.

## Session navigation

### NewSessionButton
Primary sidebar action.

### SessionList
Properties:
- topic;
- status;
- updated time;
- active state.

### SessionListItem
States:
- active;
- mastered;
- almost-there;
- revisit;
- in-progress.

### ProfileMenu
- avatar/initials;
- account;
- sign out.

## Teaching Room

### SessionHeader
- topic;
- optional status;
- menu for rename/delete later.

### StudentOrb — CUSTOM
Signature component.

Inputs:
- state;
- audio level;
- reduced-motion preference.

States:
- ready;
- listening;
- thinking;
- confused;
- testing;
- understanding;
- mastered;
- error.

### VoiceVisualizer — CUSTOM / adapted
Driven by live microphone amplitude if possible.

Must:
- look alive;
- remain lightweight;
- have a reduced-motion/static alternative.

### VoiceControls
Primary controls:
- Start teaching
- Stop
- Retry/reconnect when needed

Optional:
- Mute student TTS

### LiveTranscript
- partial transcript;
- final transcript;
- scrolling/focus behavior;
- annotation support.

### StudentPrompt
Shows current learner-facing student response/question.

Must not look exactly like a generic assistant message bubble.

### StudentState
Compact indicator:
- Listening
- Thinking
- Confused
- Testing
- Understanding

### LearningStage
Shows where the session is:
- Explain
- Repair
- Transfer
- Assess

Keep subtle; do not gamify aggressively.

## Assessment

### MasteryCard
- overall result;
- dimensions;
- evidence;
- gaps;
- actions.

### MasteryDimension
- label;
- state;
- short evidence.

### EvidenceItem
Links assessment language to something actually demonstrated.

### SessionSummary
Readable history view.

## Authentication

### SignInForm
### SignUpForm
### AuthLayout
### AuthError

Keep auth intentionally boring and reliable.

## Feedback / system components

### PermissionPrompt
Microphone permission guidance.

### AIThinkingState
Do not fake a response that has not arrived.

### QuotaError
Specific message for free-provider rate/usage exhaustion.

### VoiceUnavailable
Clear fallback path.

### NetworkError
Retry without losing transcript.

### Toast
Only for brief secondary status—not core learning state.

### Skeletons
For sidebar/history/result loading.

## Dialogs

### DeleteSessionDialog
Potentially later.

### EndSessionDialog
Only if accidental exits become a problem.

## Component sourcing checklist

Before copying/adapting a community component:
- [ ] Verify source license.
- [ ] Record attribution/disclosure if required.
- [ ] Check package dependencies.
- [ ] Confirm Next.js compatibility.
- [ ] Confirm keyboard accessibility.
- [ ] Confirm reduced-motion behavior.
- [ ] Remove branding/provider-specific copy.
- [ ] Restyle to project tokens.
- [ ] Avoid unnecessary dependency for a trivial effect.

## Search terms for component libraries

Useful searches:
- audio visualizer
- voice orb
- waveform
- AI voice
- sidebar
- session history
- progress
- status
- command menu
- transcript
- microphone
- animated border
- radial animation
- pulse
- audio recorder

## Components that should remain custom

Do not outsource the product identity:

- StudentOrb
- TeachingRoom composition
- StudentState behavior
- LearningStage
- Misconception/Correction annotations
- MasteryCard
- Teaching-session transcript treatment

Those are where the product should look and feel original.
