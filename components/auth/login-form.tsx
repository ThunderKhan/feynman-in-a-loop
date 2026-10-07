"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { AuthActionState } from "@/app/actions/auth";

const initialState: AuthActionState = { error: null };

type AuthAction = (
  prev: AuthActionState,
  formData: FormData,
) => Promise<AuthActionState>;

export function LoginForm({ action }: { action: AuthAction }) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="min-h-dvh bg-[#f3f2ee] text-[#171717] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(430px,0.92fr)]">
      <section className="relative hidden min-h-dvh overflow-hidden bg-black lg:block">
        <Image
          src="/images/auth/feynman-ascii.svg"
          alt="ASCII-style artwork of Richard Feynman teaching at a chalkboard"
          fill
          priority
          sizes="55vw"
          className="object-cover object-center"
        />
      </section>

      <section className="flex min-h-dvh items-center justify-center px-6 py-10 sm:px-10 lg:px-14 xl:px-20">
        <div className="w-full max-w-[440px]">
          <header className="mb-9">
            <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.24em] text-neutral-500">
              Continue learning
            </p>
            <h1 className="font-editorial text-[2.55rem] leading-[1.05] tracking-[-0.02em] text-neutral-950 sm:text-5xl">
              Welcome back.
            </h1>
            <p className="mt-4 max-w-sm text-[15px] leading-6 text-neutral-600">
              Sign in to return to your teaching sessions and continue proving
              what you understand.
            </p>
          </header>

          <form action={formAction} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-neutral-800"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                className="h-12 w-full rounded-xl border border-black/10 bg-white px-4 text-[15px] text-neutral-950 shadow-[0_1px_0_rgba(0,0,0,0.03)] outline-none transition placeholder:text-neutral-400 hover:border-black/20 focus:border-neutral-950 focus:ring-1 focus:ring-neutral-950"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-neutral-800"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                  className="h-12 w-full rounded-xl border border-black/10 bg-white px-4 pr-12 text-[15px] text-neutral-950 shadow-[0_1px_0_rgba(0,0,0,0.03)] outline-none transition placeholder:text-neutral-400 hover:border-black/20 focus:border-neutral-950 focus:ring-1 focus:ring-neutral-950"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-black/[0.05] hover:text-neutral-800"
                >
                  {showPassword ? (
                    <EyeOff className="h-[18px] w-[18px]" />
                  ) : (
                    <Eye className="h-[18px] w-[18px]" />
                  )}
                </button>
              </div>
            </div>

            {state.error && (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700"
              >
                {state.error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="mt-1 flex h-12 w-full items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-7 border-t border-black/10 pt-6">
            <p className="text-sm text-neutral-600">
              New here?{" "}
              <Link
                href="/signup"
                className="font-medium text-neutral-950 underline decoration-neutral-300 underline-offset-4 transition hover:decoration-neutral-950"
              >
                Create an account
              </Link>
            </p>
          </div>

          <p className="mt-12 text-xs leading-5 text-neutral-400">
            Your sessions are private to your account and protected by
            row-level access controls.
          </p>
        </div>
      </section>
    </main>
  );
}
