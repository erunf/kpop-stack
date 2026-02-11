/**
 * Extended Session Utilities
 *
 * Provides additional session helpers for Etsy OAuth tokens
 * and other external service integrations.
 */

import { sessionStorage, getSession as getBaseSession } from "./session.server";

// Re-export base session functions
export { sessionStorage };

// Session keys for Etsy integration
const ETSY_TOKENS_KEY = "etsy_tokens";
const ETSY_PKCE_KEY = "etsy_pkce_verifier";
const ETSY_STATE_KEY = "etsy_oauth_state";

export interface EtsySessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * Get session from cookie header
 */
export async function getSession(cookieHeader: string | null) {
  return sessionStorage.getSession(cookieHeader);
}

/**
 * Commit session and return Set-Cookie header
 */
export async function commitSession(session: Awaited<ReturnType<typeof getSession>>) {
  return sessionStorage.commitSession(session);
}

/**
 * Destroy session
 */
export async function destroySession(session: Awaited<ReturnType<typeof getSession>>) {
  return sessionStorage.destroySession(session);
}

/**
 * Get Etsy tokens from session
 */
export async function getEtsyTokens(request: Request): Promise<EtsySessionTokens | null> {
  const session = await getSession(request.headers.get("Cookie"));
  const tokens = session.get(ETSY_TOKENS_KEY);

  if (!tokens) return null;

  // Check if tokens are expired (with 5 minute buffer)
  if (tokens.expiresAt && tokens.expiresAt < Date.now() + 5 * 60 * 1000) {
    return null; // Tokens expired or about to expire
  }

  return tokens;
}

/**
 * Save Etsy tokens to session
 */
export async function setEtsyTokens(
  request: Request,
  tokens: EtsySessionTokens
): Promise<string> {
  const session = await getSession(request.headers.get("Cookie"));
  session.set(ETSY_TOKENS_KEY, tokens);
  return commitSession(session);
}

/**
 * Clear Etsy tokens from session
 */
export async function clearEtsyTokens(request: Request): Promise<string> {
  const session = await getSession(request.headers.get("Cookie"));
  session.unset(ETSY_TOKENS_KEY);
  return commitSession(session);
}

/**
 * Check if user has valid Etsy connection
 */
export async function hasEtsyConnection(request: Request): Promise<boolean> {
  const tokens = await getEtsyTokens(request);
  return tokens !== null;
}
