"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";

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
              ? "flex min-h-dvh items-center justify-center px-6 py-16 sm:px-10 lg:order-1 lg:px-14 xl:px-20"
              : "flex min-h-dvh items-center justify-center px-6 py-16 sm:px-10 lg:order-2 lg:px-14 xl:px-20"
          }
        >
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
