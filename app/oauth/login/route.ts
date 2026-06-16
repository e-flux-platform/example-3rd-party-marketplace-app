import { NextResponse } from "next/server";
import { getOAuthConfig, generatePkce } from "@/lib/oauth";
import { getSession, saveSession } from "@/lib/session";

/**
 * GET /oauth/login
 *
 * Generates a PKCE challenge, stores the verifier in the session, and
 * redirects the user to the e-flux authorization page.
 */
export async function GET() {
  const config = await getOAuthConfig();
  const { codeVerifier, codeChallenge } = generatePkce();

  // Store the code verifier so we can send it during the token exchange
  const [sessionId, session] = await getSession();
  session.codeVerifier = codeVerifier;
  await saveSession(sessionId, session);

  /*
   * The OpenID Connect `prompt` parameter controls how the authorization
   * server interacts with the end user during the authorization request.
   * It is defined in the OIDC core spec (section 3.1.2.1) and accepts a
   * space-delimited list of the following values:
   *
   *   - "none"           Do not display any UI. If the user is not already
   *                      authenticated and consented, the server returns an
   *                      error (login_required / consent_required) instead
   *                      of showing a screen. Useful for silent token refresh.
   *   - "login"          Force the user to re-authenticate, even if they
   *                      already have a valid session with the provider.
   *   - "consent"        Force the consent screen to be shown, even if the
   *                      user has previously consented to the same scopes
   *                      for this client. Without this, providers typically
   *                      remember a prior consent and skip the screen on
   *                      subsequent authorizations.
   *   - "select_account" Prompt the user to pick which account to sign in
   *                      with, when the IdP supports multiple accounts.
   *
   * We pass "consent" here so the user is asked to confirm the requested
   * scopes on every authorization flow, which is helpful while developing
   * and demoing this marketplace integration.
   */
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    scope: "openid offline_access chargers:read sessions:read",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "consent",
  });

  return NextResponse.redirect(`${config.authorizeUrl}?${params.toString()}`);
}
