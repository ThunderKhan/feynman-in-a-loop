import { createClient } from "@supabase/supabase-js";

// This module must only be imported by server routes/actions/tests. The secret
// key is intentionally not NEXT_PUBLIC_ and must never cross a client boundary.

/**
 * Server-only Supabase client for authoritative evaluator/quota mutations.
 *
 * SECURITY:
 * - Uses the Supabase secret key, which must never be exposed to the browser.
 * - The caller must verify the user's JWT first and pass that verified user id
 *   into server-only RPCs.
 * - Reads still use the normal SSR client and RLS.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. " +
        "The secret key is required only on the server for evaluator/quota mutations.",
    );
  }

  return createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
