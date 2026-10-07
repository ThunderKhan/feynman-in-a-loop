# Feynman-in-a-Loop — Testing Strategy

Status: **Working**  
Last updated: **7 October 2026**

## Test objective

Prove that:
1. the product works end to end;
2. the AI behaves like a student rather than a tutor;
3. mastery is not arbitrary;
4. user data is isolated;
5. voice/provider failure does not destroy the session;
6. the demo path is reliable.

## Test layers

## 1. Unit tests

### State machine
Test legal/illegal transitions:
- ready → listening;
- listening → evaluating;
- evaluating → student_response;
- repair → transfer;
- transfer → assessing;
- assessing → completed.

Reject impossible jumps such as:
- explain → completed without required evidence.

### Evaluator schema
Test:
- valid output;
- missing dimension;
- invalid enum;
- malformed JSON;
- oversized/unexpected fields.

### Mastery reducer
Given observations, verify deterministic internal state updates.

### Rate/input guards
Test topic/transcript/session limits.

## 2. Integration tests

### Supabase
- create a user-owned session through the approved RPC;
- list/read own sessions and turns through RLS;
- reject direct table mutations from authenticated clients;
- reject browser invocation of server-only evaluator/quota RPCs;
- prove the server-only RPC path still enforces row ownership;
- prove idempotent turn insert, one-live-claim, quota accounting, retry recovery, atomic apply, and completed-attempt immutability;
- deny cross-user access.

### AI provider adapter
Use a fake provider for deterministic tests.

Verify:
- student turn mapping;
- evaluator mapping;
- timeout handling;
- quota error mapping;
- malformed response mapping.

### Persistence
A validated turn should:
- save transcript;
- save student response;
- update session state;
- not duplicate on retry.

## 3. AI behavior evaluation

Create a small fixed evaluation corpus.

Topics:
1. Binary Search
2. Recursion
3. Gradient Descent
4. Photosynthesis / non-programming concept
5. A topic with a known common misconception

For each topic, prepare:
- weak explanation;
- partially correct explanation;
- strong explanation;
- deliberate misconception;
- successful correction;
- failed transfer answer;
- successful transfer answer;
- prompt-injection attempt.

### Pass conditions
The AI system should:
- not immediately teach the answer;
- identify a meaningful gap;
- ask a relevant diagnostic question;
- recognize a correct repair;
- ask a real transfer question;
- not mark weak explanation as mastered;
- resist direct grading manipulation.

AI behavior tests will not be perfectly deterministic; record failures and tune prompts/state rules based on recurring patterns.

## 4. Voice tests

Cases:
- permission granted;
- permission denied;
- microphone unavailable;
- start → speak → stop;
- silence;
- very short utterance;
- long utterance;
- recognition interruption;
- network loss if provider-dependent.

Verify:
- UI state is accurate;
- partial transcript does not duplicate final transcript;
- stopping does not lose text;
- user can recover without reloading.

## 5. End-to-end golden path

From logged-out state:

1. Sign up/sign in.
2. Start Binary Search session.
3. Teach concept.
4. See transcript.
5. Receive diagnostic misconception.
6. Correct it.
7. Answer transfer question.
8. Receive result.
9. See session in history.
10. Refresh.
11. Reopen result.
12. Sign out.

This is the most important E2E test.

## 6. Security tests

See [SECURITY.md](./SECURITY.md).

Must include:
- cross-user access;
- prompt injection;
- malformed model JSON;
- raw HTML/script content;
- unauthenticated API calls;
- repeated AI requests / duplicate submission;
- client secret audit.

## 7. Accessibility tests

Manual:
- keyboard-only navigation;
- visible focus;
- screen-reader labels on microphone controls;
- status not color-only;
- reduced motion;
- transcript readability;
- error announcement.

Automated accessibility tooling may be added if it fits the stack/time budget.

## 8. Responsive/browser tests

Priority:
1. Chrome/Chromium desktop — demo target.
2. Edge desktop.
3. Safari/Firefox sanity check depending on chosen voice API.
4. Mobile responsive layout.

If speech recognition is browser-specific, document the supported browser honestly.

## 9. Production smoke test

Against the actual Vercel deployment:
- auth;
- create session;
- AI call;
- voice;
- persistence;
- logout/login;
- no console fatal errors;
- no exposed secrets;
- public URL works logged out.

## 10. Demo reliability test

Run the exact demo script at least three consecutive times.

If any external free service makes the flow unreliable:
- create a fallback path;
- preserve screenshots/video;
- document limitations.

## Bug severity

### P0
- cannot sign in;
- cannot complete session;
- cross-user data leak;
- secret leak;
- mastery bypass;
- production app unavailable.

### P1
- voice unreliable;
- AI consistently tutors instead of acting as student;
- session not persisted;
- major responsive/accessibility break;
- quota handling crashes app.

### P2
- minor animation/layout issue;
- copy polish;
- non-critical history metadata.

## Release gate

Before recording the final demo:
- [ ] Golden path passes.
- [ ] Cross-user RLS tests pass.
- [ ] Prompt-injection tests pass.
- [ ] AI evaluation corpus has no known P0/P1 behavior.
- [ ] Voice path succeeds repeatedly.
- [ ] Production deployment smoke test passes.
- [ ] No secrets are exposed.
- [ ] Final result explains its evidence.
