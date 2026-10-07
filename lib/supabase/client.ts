import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client for Client Components.
 *
 * Uses only the publishable key, so it is governed by RLS — there is no
 * privileged client in this application by design.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}