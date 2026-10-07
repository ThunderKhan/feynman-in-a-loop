import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type VerifiedUser = {
  id: string;
  email: string | null;
};

/**
 * Returns the authenticated user derived from verified JWT claims, or null.
 *
 * SECURITY: getClaims() validates the JWT signature against the project's
 * published public keys. getSession() is deliberately never used on the
 * server — it does not revalidate the token, and cookies can be spoofed.
 *
 * getClaims() returns the decoded payload (claims), not a user record, so the
 * identity is taken from the verified `sub` claim.
 */
export async function getUser(): Promise<VerifiedUser | null> {
  const supabase = await createClient();
  const {
    data,
    error,
  } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) return null;

  return {
    id: data.claims.sub,
    email: (data.claims.email as string | undefined) ?? null,
  };
}

/** For pages and actions that require a signed-in user. Redirects otherwise. */
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}