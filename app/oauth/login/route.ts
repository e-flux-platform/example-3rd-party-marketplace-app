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

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    scope: "openid offline_access chargers:read sessions:read",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return NextResponse.redirect(`${config.authorizeUrl}?${params.toString()}`);
}
