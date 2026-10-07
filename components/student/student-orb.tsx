import type { StudentState } from "@/lib/types";

/**
 * The Student Orb — signature visual object, state visualization not mascot.
 *
 * Per spec.md > Look and Feel: motion is semantic, and every state also has a
 * text label so the orb is never the sole signal. All animation is suppressed
 * under prefers-reduced-motion (see globals.css).
 */
const stateMeta: Record<StudentState, { label: string; animate: string }> = {
  ready: { label: "Ready", animate: "" },
  listening: { label: "Listening", animate: "animate-listen" },
  thinking: { label: "Thinking", animate: "animate-think" },
  confused: { label: "Confused", animate: "animate-confused" },
  corrected: { label: "Corrected", animate: "animate-settle" },
  testing: { label: "Testing", animate: "animate-breathe" },
  understanding: { label: "Understanding", animate: "animate-settle" },
  mastered: { label: "Mastered", animate: "animate-mastered" },
  error: { label: "Error", animate: "" },
};

export function StudentOrb({
  state,
  level = 1,
}: {
  state: StudentState;
  /** 0–1 microphone level, used for amplitude while listening. */
  level?: number;
}) {
  const meta = stateMeta[state] ?? stateMeta.ready;
  const scale =
    state === "listening" && typeof level === "number"
      ? 1 + Math.min(Math.max(level, 0), 1) * 0.12
      : 1;

  return (
    <div
      className="flex flex-col items-center gap-4"
      role="img"
      aria-label={`AI student state: ${meta.label}`}
    >
      <div
        className="relative h-28 w-28"
        style={{ transform: `scale(${scale})` }}
      >
        <div className="absolute inset-0 rounded-full bg-accent-glow blur-2xl" />
        <div
          className={`absolute inset-2 rounded-full bg-gradient-to-br from-accent/70 via-accent/25 to-transparent blur-[2px] ${meta.animate}`}
        />
        <div className="absolute inset-5 rounded-full border border-accent/40" />
        <div className="absolute inset-8 rounded-full bg-base-950/40 backdrop-blur-[2px]" />
      </div>

      <p
        aria-live="polite"
        className="font-mono text-[11px] uppercase tracking-[0.18em] text-base-400"
      >
        {meta.label}
      </p>
    </div>
  );
}