import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 px-6 py-20">
      <div className="max-w-2xl text-center">
        <p className="mb-6 font-mono text-xs uppercase tracking-[0.2em] text-base-400">
          Feynman-in-a-Loop
        </p>

        <h1 className="font-editorial text-4xl leading-tight text-balance sm:text-6xl">
          You teach.{" "}
          <span className="text-base-400">The AI learns.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-base-300">
          Most AI learning tools teach you. Here you explain a concept out loud
          to an AI student that misunderstands something, so you have to prove
          you actually understand it — not just recognize it.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/teach"
            className="rounded-full bg-accent px-7 py-3 text-sm font-medium text-base-950 transition hover:bg-accent/90"
          >
            Start teaching
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-base-700 px-7 py-3 text-sm font-medium text-base-200 transition hover:border-base-600 hover:text-base-100"
          >
            Sign in
          </Link>
        </div>
      </div>

      <ul className="grid max-w-3xl gap-4 text-sm text-base-400 sm:grid-cols-3">
        <li className="rounded-xl border border-base-800 bg-base-900 p-5">
          <span className="font-editorial text-base-200">Teach it out loud</span>
          <p className="mt-2 leading-relaxed">
            Explain a concept you just studied, in your own words.
          </p>
        </li>
        <li className="rounded-xl border border-base-800 bg-base-900 p-5">
          <span className="font-editorial text-base-200">Get challenged</span>
          <p className="mt-2 leading-relaxed">
            The student misunderstands something you glossed over.
          </p>
        </li>
        <li className="rounded-xl border border-base-800 bg-base-900 p-5">
          <span className="font-editorial text-base-200">Prove transfer</span>
          <p className="mt-2 leading-relaxed">
            It tests you on a new case, then shows the evidence.
          </p>
        </li>
      </ul>
    </main>
  );
}