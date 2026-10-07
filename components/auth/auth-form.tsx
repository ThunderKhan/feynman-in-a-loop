"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { AuthActionState } from "@/app/actions/auth";

const initialState: AuthActionState = { error: null };

type AuthAction = (
  prev: AuthActionState,
  formData: FormData,
) => Promise<AuthActionState>;

export function AuthForm({
  mode,
  action,
}: {
  mode: "login" | "signup";
  action: AuthAction;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const isSignup = mode === "signup";

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-8 block font-mono text-xs uppercase tracking-[0.2em] text-base-400 transition hover:text-base-300"
        >
          ← Feynman-in-a-Loop
        </Link>

        <h1 className="font-editorial text-3xl">
          {isSignup ? "Create an account" : "Welcome back"}
        </h1>
        <p className="mt-2 text-sm text-base-400">
          {isSignup
            ? "Sessions are saved to your learning history."
            : "Pick up where you left off."}
        </p>

        <form action={formAction} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm text-base-300">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-lg border border-base-700 bg-base-900 px-3.5 py-2.5 text-sm text-base-100 placeholder:text-base-600 focus:border-accent focus:outline-none"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm text-base-300"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
              minLength={isSignup ? 8 : undefined}
              className="w-full rounded-lg border border-base-700 bg-base-900 px-3.5 py-2.5 text-sm text-base-100 placeholder:text-base-600 focus:border-accent focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          {state.error && (
            <p
              role="alert"
              className="rounded-lg border border-red-900/60 bg-red-950/40 px-3.5 py-2.5 text-sm text-red-300"
            >
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-base-950 transition hover:bg-accent/90 disabled:opacity-60"
          >
            {pending
              ? isSignup
                ? "Creating account…"
                : "Signing in…"
              : isSignup
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-sm text-base-400">
          {isSignup ? "Already have an account? " : "No account yet? "}
          <Link
            href={isSignup ? "/login" : "/signup"}
            className="text-accent underline-offset-4 hover:underline"
          >
            {isSignup ? "Sign in" : "Create one"}
          </Link>
        </p>
      </div>
    </main>
  );
}