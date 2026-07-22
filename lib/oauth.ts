/**
 * OAuth configuration and token helpers for the e-flux OAuth flow.
 *
 * This implementation uses the Authorization Code flow with PKCE (S256) and
 * OpenID Connect discovery. On first use it fetches the OIDC discovery
 * document to resolve the authorize, token, and userinfo endpoints.
 */

import { randomBytes, createHash } from "crypto";
import { getDiscovery } from "./discovery";
import { ensureRegistration } from "./dcr";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Scopes this app may request. At dynamic registration the user picks a subset
// (see the home page); these must also be within the provider's dynamic-scope
// allowlist. `openid` is required (OIDC). At authorization the client requests
// exactly the scopes it registered for.
export const AVAILABLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "offline_access",
  // ERE (Emission Reduction Units) data — the user's charging sessions +
  // station metadata via the /1/ere endpoints. A gated scope (see
  // GATED_SCOPES): only preregistered clients (curated templates / provider
  // installations) can request it, not dynamic self-registration.
  "ere",
  "chargers:read",
  "sessions:read",
  // Read the user's own account via /1/accounts/self (name + contact).
  "account:read",
  // Read the account's billing details (in addition to `account:read`); still gated by RBAC.
  "account:billing:read",
  // Full-delegation marker for the MCP resource server. When requested, the
  // provider collapses the grant to a delegation token (the granular data
  // scopes are dropped) and shows the "acts as you" consent.
  "mcp",
] as const;

// Scopes the provider reserves for approved apps: they are NOT in the dynamic
// registration allowlist, so a `POST /register` (RFC 7591) that asks for one is
// rejected with `invalid_client_metadata`. They can only be requested by a
// preregistered client (a curated template or a provider installation). Keep in
// sync with the provider's DYNAMIC_REGISTRATION_GATED_SCOPES.
export const GATED_SCOPES = ["ere"] as const;

export function isGatedScope(scope: string): boolean {
  return (GATED_SCOPES as readonly string[]).includes(scope);
}

// Default / full scope set (preregistered mode requests all of these).
export const OAUTH_SCOPES = AVAILABLE_SCOPES.join(" ");

// -- Mode --------------------------------------------------------------------

// Both modes are available at runtime and chosen per-flow from the UI (not via
// an environment switch):
//   - "preregistered": confidential client using a preconfigured
//     ROAD_OAUTH_CLIENT_ID / ROAD_OAUTH_CLIENT_SECRET.
//   - "dynamic": public client that self-registers via RFC 7591 and
//     authenticates with PKCE only (no secret).
export type OAuthMode = "preregistered" | "dynamic";

/** Whether preregistered credentials are configured (enables that mode). */
export function isPreregisteredConfigured(): boolean {
  return Boolean(
    process.env.ROAD_OAUTH_CLIENT_ID && process.env.ROAD_OAUTH_CLIENT_SECRET
  );
}

// -- OAuth config ------------------------------------------------------------

export interface OAuthConfig {
  mode: OAuthMode;
  clientId: string;
  /** Only set in preregistered (confidential) mode. */
  clientSecret?: string;
  /** Scopes to request at authorization (the client's registered scopes). */
  scope: string;
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  callbackUrl: string;
}

/**
 * Resolve the OAuth config for the requested mode. In dynamic mode this
 * self-registers (or reuses the stored registration) and runs as a public
 * client; in preregistered mode it uses the configured client credentials.
 */
export async function getOAuthConfig(mode: OAuthMode): Promise<OAuthConfig> {
  const discovery = await getDiscovery();
  const callbackUrl = `${requireEnv("NEXT_PUBLIC_APP_URL")}/oauth/callback`;

  const base = {
    mode,
    authorizeUrl: discovery.authorization_endpoint,
    tokenUrl: discovery.token_endpoint,
    userinfoUrl: discovery.userinfo_endpoint,
    callbackUrl,
  };

  if (mode === "dynamic") {
    // Reuse the stored registration; request exactly the scopes it registered
    // for. (A fresh registration here would default to the full set.)
    const registration = await ensureRegistration({
      discovery,
      callbackUrl,
      scope: OAUTH_SCOPES,
    });
    return { ...base, clientId: registration.client_id, scope: registration.scope };
  }

  return {
    ...base,
    clientId: requireEnv("ROAD_OAUTH_CLIENT_ID"),
    clientSecret: requireEnv("ROAD_OAUTH_CLIENT_SECRET"),
    scope: OAUTH_SCOPES,
  };
}

// -- PKCE --------------------------------------------------------------------

/**
 * Generate a PKCE code verifier and its S256 challenge.
 */
export function generatePkce(): {
  codeVerifier: string;
  codeChallenge: string;
} {
  // 32 random bytes -> 43-char base64url string (RFC 7636 recommends 43-128)
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  return { codeVerifier, codeChallenge };
}

// -- Token types -------------------------------------------------------------

export interface TokenSet {
  access_token: string;
  id_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  /** Timestamp (ms) when the access token expires. */
  expires_at: number;
}

// -- Token exchange & refresh ------------------------------------------------

/**
 * Exchange an authorization code for a token set.
 * Includes the PKCE code_verifier to prove possession.
 */
export async function exchangeCode(
  code: string,
  codeVerifier: string,
  mode: OAuthMode
): Promise<TokenSet> {
  const config = await getOAuthConfig(mode);

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.callbackUrl,
    client_id: config.clientId,
    code_verifier: codeVerifier,
  });
  // Public (dynamic) clients have no secret — PKCE authenticates the exchange.
  if (config.clientSecret) params.set("client_secret", config.clientSecret);

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  return {
    ...data,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

/**
 * Refresh the token set using the refresh token.
 */
export async function refreshTokenSet(
  refreshToken: string,
  mode: OAuthMode
): Promise<TokenSet> {
  const config = await getOAuthConfig(mode);

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
  });
  if (config.clientSecret) params.set("client_secret", config.clientSecret);

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  return {
    ...data,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

/**
 * Returns a valid access token for use with the Road API, refreshing if necessary.
 */
export async function getValidAccessToken(
  tokens: TokenSet,
  mode: OAuthMode
): Promise<{ accessToken: string; updatedTokens: TokenSet }> {
  // Refresh if the token expires within the next 60 seconds
  const isExpired = tokens.expires_at - Date.now() < 60_000;

  if (!isExpired) {
    return { accessToken: tokens.access_token, updatedTokens: tokens };
  }

  const refreshed = await refreshTokenSet(tokens.refresh_token, mode);
  return { accessToken: refreshed.access_token, updatedTokens: refreshed };
}

// -- UserInfo ----------------------------------------------------------------

/**
 * Fetch user information from the OIDC userinfo endpoint.
 */
export async function fetchUserInfo(
  accessToken: string
): Promise<Record<string, unknown>> {
  // userinfo_endpoint is mode-independent — read it straight from discovery so
  // this doesn't trigger a dynamic registration.
  const discovery = await getDiscovery();

  const response = await fetch(discovery.userinfo_endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `UserInfo request failed (${response.status}): ${body}`
    );
  }

  return response.json();
}
