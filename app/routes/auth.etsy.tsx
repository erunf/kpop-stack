/**
 * Etsy OAuth Flow Routes
 *
 * Handles the OAuth 2.0 with PKCE flow for Etsy API authorization.
 *
 * Routes:
 * - GET /auth/etsy - Start OAuth flow, redirect to Etsy
 * - GET /auth/etsy/callback - Handle Etsy callback, exchange code for tokens
 */

import { json, redirect, type LoaderFunction } from "@remix-run/node";
import {
  generatePKCE,
  getAuthorizationUrl,
  exchangeCodeForTokens,
} from "~/services/etsy.server";
import { getSession, commitSession, type EtsySessionTokens } from "~/sessions.server";

// Store PKCE verifier in session during OAuth flow
const PKCE_SESSION_KEY = "etsy_pkce_verifier";
const STATE_SESSION_KEY = "etsy_oauth_state";
const TOKENS_SESSION_KEY = "etsy_tokens";

/**
 * GET /auth/etsy
 * Initiates the OAuth flow by redirecting to Etsy's authorization page
 */
export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);

  // Check if this is a callback
  const code = url.searchParams.get("code");
  if (code) {
    return handleCallback(request, code, url.searchParams.get("state") || "");
  }

  // Check for errors from Etsy
  const error = url.searchParams.get("error");
  if (error) {
    const errorDescription = url.searchParams.get("error_description") || "Unknown error";
    console.error("Etsy OAuth error:", error, errorDescription);
    return json(
      { error, description: errorDescription },
      { status: 400 }
    );
  }

  // Start new OAuth flow
  const session = await getSession(request.headers.get("Cookie"));

  // Generate PKCE challenge
  const { verifier, challenge } = generatePKCE();

  // Generate state for CSRF protection
  const state = crypto.randomUUID();

  // Store verifier and state in session
  session.set(PKCE_SESSION_KEY, verifier);
  session.set(STATE_SESSION_KEY, state);

  // Get authorization URL
  const authUrl = getAuthorizationUrl(state, challenge);

  // Redirect to Etsy with session cookie
  return redirect(authUrl, {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
};

/**
 * Handle the OAuth callback from Etsy
 */
async function handleCallback(
  request: Request,
  code: string,
  state: string
) {
  const session = await getSession(request.headers.get("Cookie"));

  // Verify state matches
  const savedState = session.get(STATE_SESSION_KEY);
  if (state !== savedState) {
    console.error("OAuth state mismatch", { received: state, expected: savedState });
    return json({ error: "Invalid state parameter" }, { status: 400 });
  }

  // Get stored PKCE verifier
  const verifier = session.get(PKCE_SESSION_KEY);
  if (!verifier) {
    console.error("No PKCE verifier found in session");
    return json({ error: "Missing PKCE verifier" }, { status: 400 });
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, verifier);

    // Store tokens in session
    session.set(TOKENS_SESSION_KEY, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    });

    // Clear OAuth flow data
    session.unset(PKCE_SESSION_KEY);
    session.unset(STATE_SESSION_KEY);

    console.log("Etsy OAuth successful, tokens stored in session");

    // Redirect to admin dashboard
    return redirect("/admin", {
      headers: {
        "Set-Cookie": await commitSession(session),
      },
    });
  } catch (error) {
    console.error("Failed to exchange code for tokens:", error);
    return json(
      {
        error: "Token exchange failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
