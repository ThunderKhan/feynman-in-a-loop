import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial serif for display type: topic labels, screen headings, the
// mastery transition. Per spec.md > Look and Feel.
const newsreader = Newsreader({
  variable: "--font-editorial",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Feynman-in-a-Loop",
  description:
    "Prove that you understand something by teaching an AI student. You teach. The AI learns.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}