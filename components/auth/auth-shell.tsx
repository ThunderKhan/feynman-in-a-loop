"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

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

  return (
    <main
      className="min-h-dvh bg-white font-auth text-[#111111]"
      style={{ colorScheme: "light" }}
    >
      <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
        <section
          className={
            isSignup
              ? "relative flex min-h-dvh items-center justify-center px-6 py-16 sm:px-10 lg:order-1 lg:px-14 xl:px-20"
              : "relative flex min-h-dvh items-center justify-center px-6 py-16 sm:px-10 lg:order-2 lg:px-14 xl:px-20"
          }
        >
          <div className="absolute right-6 top-6 flex items-center gap-3 text-sm sm:right-8 sm:top-8">
            {isSignup ? (
              <>
                <span className="hidden text-[#6b7280] sm:inline">
                  Already have an account?
                </span>
                <Link
                  href="/login"
                  className="font-medium text-[#111111] underline-offset-4 hover:underline"
                >
                  Sign in
                </Link>
              </>
            ) : (
              <>
                <span className="hidden text-[#6b7280] sm:inline">
                  New to Feynman-in-a-Loop?
                </span>
                <Link
                  href="/signup"
                  className="inline-flex h-10 items-center rounded-lg bg-[#111111] px-5 text-sm font-semibold text-white"
                >
                  Create account
                </Link>
              </>
            )}
          </div>

          <div className="w-full max-w-[420px]">{children}</div>
        </section>

        <section
          className={
            isSignup
              ? "relative min-h-[360px] overflow-hidden bg-[#101010] lg:order-2 lg:min-h-dvh"
              : "relative min-h-[360px] overflow-hidden bg-[#101010] lg:order-1 lg:min-h-dvh"
          }
        >
          <Image
            src={resolvedArtworkSrc}
            alt={artworkAlt}
            fill
            priority
            sizes="(max-width: 1023px) 100vw, 50vw"
            className="object-cover object-center"
            onError={() => setResolvedArtworkSrc(artworkFallback)}
          />
        </section>
      </div>
    </main>
  );
}
