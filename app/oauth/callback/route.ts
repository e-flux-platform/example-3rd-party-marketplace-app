import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, fetchUserInfo } from "@/lib/oauth";
import { getSession, saveSession } from "@/lib/session";

/**
 * GET /oauth/callback
 *
 * Handles the OAuth callback from e-flux. Exchanges the authorization code
 * (with PKCE verifier) for tokens, then fetches user info from the OIDC
 * userinfo endpoint.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    const description = request.nextUrl.searchParams.get("error_description");
    return NextResponse.json({ error, description }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json(
      { error: "Missing authorization code" },
      { status: 400 }
    );
  }

  const [sessionId, session] = await getSession();

  if (!session.codeVerifier) {
    return NextResponse.json(
      { error: "Missing PKCE code verifier. Please restart the login flow." },
      { status: 400 }
    );
  }

  const tokens = await exchangeCode(code, session.codeVerifier);

  // Fetch user info from the OIDC userinfo endpoint
  const userInfo = await fetchUserInfo(tokens.access_token);

  session.tokens = tokens;
  session.userInfo = userInfo;
  delete session.codeVerifier;
  await saveSession(sessionId, session);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return NextResponse.redirect(`${appUrl}/`);
}
