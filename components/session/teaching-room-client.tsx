"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { Send, RotateCcw } from "lucide-react";
import { StudentOrb } from "@/components/student/student-orb";
import type { Stage, StudentState } from "@/lib/types";

type PublicTurn = {
  id: string;
  sequence: number;
  role: "learner" | "student";
  content: string;
};

type PublicResponse = {
  publicStage: Stage;
  student: {
    state: StudentState;
    message: string;
  };
};

type PendingTurn = {
  clientTurnId: string;
  content: string;
};

export function TeachingRoomClient({
  sessionId,
  topic,
  initialStage,
  initialStudentState,
  initialTurns,
  initialPending,
  completed,
}: {
  sessionId: string;
  topic: string;
  initialStage: Stage;
  initialStudentState: StudentState;
  initialTurns: PublicTurn[];
  initialPending: PendingTurn | null;
  completed: boolean;
}) {
  const [turns, setTurns] = useState(initialTurns);
  const [stage, setStage] = useState(initialStage);
  const [studentState, setStudentState] = useState(initialStudentState);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<PendingTurn | null>(initialPending);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const isCompleted = completed || stage === "completed";

  const latestLearner = useMemo(
    () => [...turns].reverse().find((turn) => turn.role === "learner"),
    [turns],
  );
  const latestStudent = useMemo(
    () => [...turns].reverse().find((turn) => turn.role === "student"),
    [turns],
  );

  async function submitTurn(turn: PendingTurn) {
    // React state updates are asynchronous, so `busy` alone leaves a tiny
    // double-click window where two different clientTurnIds can be submitted.
    // The ref closes that window synchronously and preserves one learner turn.
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(true);
    setError(null);
    setStudentState("thinking");

    // Add the optimistic learner note once. A network retry reuses both the
    // same clientTurnId and the same local line.
    setTurns((current) =>
      current.some((item) => item.id === turn.clientTurnId)
        ? current
        : [
            ...current,
            {
              id: turn.clientTurnId,
              sequence:
                current.reduce((max, item) => Math.max(max, item.sequence), 0) +
                1,
              role: "learner",
              content: turn.content,
            },
          ],
    );

    try {
      const response = await fetch(`/api/sessions/${sessionId}/turns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientTurnId: turn.clientTurnId,
          source: "typed",
          content: turn.content,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | PublicResponse
        | { error?: { code?: string; message?: string; retryable?: boolean } }
        | null;

      if (!response.ok || !body || !("student" in body)) {
        const providerRateLimited = response.status === 429;
        const message = providerRateLimited
          ? "The AI provider is rate-limited right now. Wait a moment, then try again."
          : body && "error" in body
            ? body.error?.message
            : "The AI student could not respond.";
        throw new Error(message ?? "The AI student could not respond.");
      }

      setStage(body.publicStage);
      setStudentState(body.student.state);
      setTurns((current) => [
        ...current,
        {
          id: `student-${turn.clientTurnId}`,
          sequence:
            current.reduce((max, item) => Math.max(max, item.sequence), 0) + 1,
          role: "student",
          content: body.student.message,
        },
      ]);
      setPending(null);
      setInput("");
    } catch (caught) {
      setStudentState("error");
      setError(
        caught instanceof Error
          ? caught.message
          : "The AI student could not respond.",
      );
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || busy || isCompleted) return;

    const turn = pending?.content === content
      ? pending
      : { clientTurnId: crypto.randomUUID(), content };

    setPending(turn);
    void submitTurn(turn);
  }

  const visibleEarlier = turns.filter(
    (turn) => turn.id !== latestLearner?.id && turn.id !== latestStudent?.id,
  );

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-start justify-between gap-6 px-6 pt-6 sm:px-8">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-base-500">
            {stage.replace("_", " ")}
          </p>
          <h1 className="mt-1 font-editorial text-xl text-base-200">{topic}</h1>
        </div>
        <p className="max-w-48 text-right text-xs leading-5 text-base-500">
          You teach. I listen, question, and test the idea.
        </p>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pb-6 pt-8 sm:px-8">
        <div className="flex flex-1 flex-col items-center justify-center gap-8">
          <StudentOrb state={busy ? "thinking" : studentState} />

          <section
            className="w-full max-w-2xl"
            aria-label="Teaching transcript"
          >
            {visibleEarlier.length > 0 ? (
              <div className="mb-7 max-h-28 space-y-2 overflow-hidden text-sm text-base-600">
                {visibleEarlier.slice(-4).map((turn) => (
                  <p key={turn.id} className="truncate">
                    <span className="mr-2 font-mono text-[10px] uppercase tracking-wider">
                      {turn.role === "learner" ? "You" : "Student"}
                    </span>
                    {turn.content}
                  </p>
                ))}
              </div>
            ) : null}

            {latestStudent ? (
              <div className="mb-6 border-l border-accent/40 pl-4">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
                  Student
                </p>
                <p className="text-base leading-7 text-base-300">
                  {latestStudent.content}
                </p>
              </div>
            ) : (
              <p className="mb-6 text-center text-sm text-base-500">
                I&apos;m listening. Teach me {topic}.
              </p>
            )}

            {latestLearner ? (
              <div className="rounded-2xl border border-base-800 bg-base-900/40 p-5">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-base-500">
                  Your latest explanation
                </p>
                <p className="text-lg leading-8 text-base-200">
                  {latestLearner.content}
                </p>
              </div>
            ) : null}
          </section>
        </div>

        {!isCompleted ? (
          <form onSubmit={onSubmit} className="mx-auto mt-8 w-full max-w-2xl">
            {pending && !busy && !error ? (
              <div className="mb-3 flex items-center justify-between gap-4 rounded-xl border border-base-800 px-4 py-3 text-sm text-base-400">
                <span>Your last teaching turn is saved and still needs a response.</span>
                <button
                  type="button"
                  onClick={() => void submitTurn(pending)}
                  className="flex shrink-0 items-center gap-1.5 text-xs text-base-200"
                >
                  <RotateCcw size={13} />
                  Resume
                </button>
              </div>
            ) : null}
            <label htmlFor="teaching-turn" className="sr-only">
              Type your teaching explanation
            </label>
            <div className="flex items-end gap-3 rounded-2xl border border-base-800 bg-base-900/70 p-3 focus-within:border-base-700">
              <textarea
                id="teaching-turn"
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  if (pending && event.target.value !== pending.content) {
                    setPending(null);
                  }
                }}
                maxLength={4000}
                rows={2}
                disabled={busy}
                placeholder={
                  latestStudent
                    ? "Teach that part in your own words…"
                    : `Explain ${topic} as if you're teaching me…`
                }
                className="min-h-14 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-6 text-base-200 outline-none placeholder:text-base-600"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-base-100 text-base-950 transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Submit teaching turn"
              >
                <Send size={16} />
              </button>
            </div>

            {error ? (
              <div
                className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-base-800 px-4 py-3 text-sm text-base-400"
                role="alert"
              >
                <span>{error}</span>
                {pending ? (
                  <button
                    type="button"
                    onClick={() => void submitTurn(pending)}
                    disabled={busy}
                    className="flex shrink-0 items-center gap-1.5 text-xs text-base-200 disabled:opacity-40"
                  >
                    <RotateCcw size={13} />
                    Try again
                  </button>
                ) : null}
              </div>
            ) : null}

            <p className="mt-2 text-center text-[11px] text-base-600">
              Typed fallback for the text kernel. Voice uses this same turn
              pipeline in Slice 5.
            </p>
          </form>
        ) : (
          <p className="mt-8 text-center text-sm text-base-500">
            This attempt is complete and read-only.
          </p>
        )}
      </div>
    </main>
  );
}
