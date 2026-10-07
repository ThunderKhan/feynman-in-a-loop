"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

const learningLoop = [
  "Learn",
  "Explain",
  "Challenge",
  "Repair",
  "Transfer",
] as const;

type AuthShellProps = {
  mode: "login" | "signup";
  artworkSrc: string;
  artworkFallback: string;
  artworkAlt: string;
  children: ReactNode;
};

export function AuthShell({
  mode,
  artworkSrc,
  artworkFallback,
  artworkAlt,
  children,
}: AuthShellProps) {
  const [resolvedArtworkSrc, setResolvedArtworkSrc] = useState(artworkSrc);
  const isSignup = mode === "signup";

  const formColumn = (
    <section
      className={
        isSignup
          ? "lg:col-span-5 lg:col-start-1"
          : "lg:col-span-5 lg:col-start-8"
      }
    >
      <div className="mx-auto w-full max-w-[420px]">{children}</div>
    </section>
  );

  const artworkColumn = (
    <section
      className={
        isSignup
          ? "lg:col-span-7 lg:col-start-6"
          : "lg:col-span-7 lg:col-start-1 lg:row-start-1"
      }
    >
      <div className="rounded-2xl border border-[#e5e7eb] bg-[#f5f5f5] p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="relative min-h-[300px] overflow-hidden rounded-xl bg-[#101010] sm:min-h-[380px] lg:min-h-[540px]">
          <Image
            src={resolvedArtworkSrc}
            alt={artworkAlt}
            fill
            priority
            sizes="(max-width: 1023px) 100vw, 58vw"
            className="object-cover object-center"
            onError={() => setResolvedArtworkSrc(artworkFallback)}
          />
        </div>

        {isSignup ? (
          <div className="mt-3 rounded-full bg-[#f8f9fa] p-1.5">
            <ol
              aria-label="Feynman learning loop"
              className="grid grid-cols-5 gap-1"
            >
              {learningLoop.map((step, index) => (
                <li
                  key={step}
                  className={
                    index === 0
                      ? "rounded-lg bg-white px-2 py-2 text-center text-[11px] font-medium text-[#111111] shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                      : "rounded-lg px-2 py-2 text-center text-[11px] font-medium text-[#6b7280]"
                  }
                >
                  {step}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </section>
  );

  return (
    <main
      className="min-h-dvh bg-white font-auth text-[#111111]"
      style={{ colorScheme: "light" }}
    >
      <header className="h-16 border-b border-[#f3f4f6] bg-white">
        <div className="mx-auto flex h-full w-full max-w-[1200px] items-center justify-between px-6 md:px-8">
          <Link
            href="/"
            className="text-[15px] font-semibold tracking-[-0.03em] text-[#111111]"
          >
            Feynman-in-a-Loop
          </Link>

          {isSignup ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden text-[#6b7280] sm:inline">
                Already have an account?
              </span>
              <Link
                href="/login"
                className="font-medium text-[#111111] underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden text-[#6b7280] sm:inline">
                New to Feynman-in-a-Loop?
              </span>
              <Link
                href="/signup"
                className="inline-flex h-10 items-center rounded-lg bg-[#111111] px-5 text-sm font-semibold text-white"
              >
                Create account
              </Link>
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto grid min-h-[calc(100dvh-64px)] w-full max-w-[1200px] grid-cols-1 items-center gap-10 px-6 py-10 md:px-8 lg:grid-cols-12 lg:gap-12 lg:py-12">
        {formColumn}
        {artworkColumn}
      </div>
    </main>
  );
}
