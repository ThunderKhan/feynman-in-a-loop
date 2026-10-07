"use client";

import { useActionState } from "react";
import { createSession, type CreateSessionState } from "@/app/actions/sessions";

const initialState: CreateSessionState = { error: null };

export function NewSessionForm() {
  const [state, formAction, pending] = useActionState(createSession, initialState);

  return (
    <form action={formAction} className="w-full max-w-lg">
      <label
        htmlFor="topic"
        className="block font-editorial text-2xl text-base-100"
      >
        What are you going to teach me?
      </label>

      <input
        id="topic"
        name="topic"
        required
        maxLength={120}
        autoFocus
        placeholder="Binary Search"
        className="mt-5 w-full rounded-xl border border-base-700 bg-base-900 px-4 py-3.5 text-base text-base-100 placeholder:text-base-600 focus:border-accent focus:outline-none"
      />

      {state.error && (
        <p
          role="alert"
          className="mt-3 text-sm text-red-300"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 rounded-full bg-accent px-6 py-3 text-sm font-medium text-base-950 transition hover:bg-accent/90 disabled:opacity-60"
      >
        {pending ? "Starting…" : "Start teaching"}
      </button>
    </form>
  );
}