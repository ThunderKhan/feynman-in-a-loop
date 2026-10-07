"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import type { AuthActionState } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth/auth-shell";

const initialState: AuthActionState = { error: null };

type AuthAction = (
  prev: AuthActionState,
  formData: FormData,
) => Promise<AuthActionState>;

export function LoginForm({ action }: { action: AuthAction }) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <AuthShell
      mode="login"
      artworkSrc="/images/auth/feynman-ascii.png"
      artworkFallback="/images/auth/feynman-ascii.svg"
      artworkAlt="ASCII-style artwork of Richard Feynman teaching at a chalkboard"
    >
      <div>
        <div className="mb-8">
          <span className="inline-flex rounded-full bg-[#f5f5f5] px-3 py-1 text-[13px] font-medium text-[#6b7280]">
            Continue learning
          </span>

          <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-[#111111] sm:text-5xl">
            Welcome back
          </h1>

          <p className="mt-4 max-w-md text-base leading-6 text-[#374151]">
            Sign in to return to your teaching sessions and continue proving
            what you understand.
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-[#111111]"
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
              className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3.5 text-base text-[#111111] outline-none transition placeholder:text-[#898989] focus:border-[#111111]"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-[#111111]"
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
                className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3.5 pr-10 text-base text-[#111111] outline-none transition placeholder:text-[#898989] focus:border-[#111111]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[#6b7280]"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {state.error && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm leading-5 text-red-600"
            >
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="flex h-10 w-full items-center justify-center rounded-lg bg-[#111111] px-5 text-sm font-semibold text-white transition active:bg-[#242424] disabled:bg-[#e5e7eb] disabled:text-[#6b7280]"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-6 border-t border-[#f3f4f6] pt-6">
          <p className="text-sm text-[#6b7280]">
            New here?{" "}
            <Link
              href="/signup"
              className="font-medium text-[#111111] underline-offset-4 hover:underline"
            >
              Create an account
            </Link>
          </p>
        </div>

        <p className="mt-8 text-[13px] font-medium leading-5 text-[#898989]">
          Your sessions are private to your account and protected by row-level
          access controls.
        </p>
      </div>
    </AuthShell>
  );
}
