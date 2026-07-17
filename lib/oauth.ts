/**
 * OAuth configuration and token helpers for the e-flux OAuth flow.
 *
 * This implementation uses the Authorization Code flow with PKCE (S256) and
 * OpenID Connect discovery. On first use it fetches the OIDC discovery
 * document to resolve the authorize, token, and userinfo endpoints.
 */

import { randomBytes, createHash } from "crypto";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// -- Errors ------------------------------------------------------------------

/**
 * Error thrown when an OAuth endpoint (token, userinfo) responds with a
 * non-2xx status. Carries the HTTP status, the response body (parsed as
 * JSON when possible), and the response headers so callers can surface the
 * server's actual error, e.g. an `invalid_grant` response after a grant has
 * been revoked.
 */
export class OAuthRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
    readonly headers: Record<string, string>,
  ) {
    super(
      `${message} (${status}): ${typeof body === "string" ? body : JSON.stringify(body)}`,
    );
    this.name = "OAuthRequestError";
  }
}

/**
 * Read a response body, parsing it as JSON when possible and falling back to
 * the raw text.
 */
export async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Convert response headers into a plain object so they can be serialised
 * into an error payload.
 */
export function headersToObject(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers);
}

// -- OIDC Discovery ----------------------------------------------------------

interface OidcDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  issuer: string;
}

let cachedDiscovery: OidcDiscovery | null = null;

/**
 * Fetch and cache the OpenID Connect discovery document.
 */
async function getDiscovery(): Promise<OidcDiscovery> {
  if (cachedDiscovery) return cachedDiscovery;

  const url = requireEnv("ROAD_OIDC_DISCOVERY_URL");
  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to fetch OIDC discovery document from ${url} (${response.status}): ${body}`
    );
  }

  cachedDiscovery = (await response.json()) as OidcDiscovery;
  return cachedDiscovery;
}

// -- OAuth config ------------------------------------------------------------

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  callbackUrl: string;
}

export async function getOAuthConfig(): Promise<OAuthConfig> {
  const discovery = await getDiscovery();

  return {
    clientId: requireEnv("ROAD_OAUTH_CLIENT_ID"),
    clientSecret: requireEnv("ROAD_OAUTH_CLIENT_SECRET"),
    authorizeUrl: discovery.authorization_endpoint,
    tokenUrl: discovery.token_endpoint,
    userinfoUrl: discovery.userinfo_endpoint,
    callbackUrl: `${requireEnv("NEXT_PUBLIC_APP_URL")}/oauth/callback`,
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
  codeVerifier: string
): Promise<TokenSet> {
  const config = await getOAuthConfig();

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.callbackUrl,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const body = await parseResponseBody(response);
    throw new OAuthRequestError(
      "Token exchange failed",
      response.status,
      body,
      headersToObject(response.headers),
    );
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
  refreshToken: string
): Promise<TokenSet> {
  const config = await getOAuthConfig();

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!response.ok) {
    const body = await parseResponseBody(response);
    throw new OAuthRequestError(
      "Token refresh failed",
      response.status,
      body,
      headersToObject(response.headers),
    );
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
  tokens: TokenSet
): Promise<{ accessToken: string; updatedTokens: TokenSet }> {
  // Refresh if the token expires within the next 60 seconds
  const isExpired = tokens.expires_at - Date.now() < 60_000;

  if (!isExpired) {
    return { accessToken: tokens.access_token, updatedTokens: tokens };
  }

  const refreshed = await refreshTokenSet(tokens.refresh_token);
  return { accessToken: refreshed.access_token, updatedTokens: refreshed };
}

// -- UserInfo ----------------------------------------------------------------

/**
 * Fetch user information from the OIDC userinfo endpoint.
 */
export async function fetchUserInfo(
  accessToken: string
): Promise<Record<string, unknown>> {
  const config = await getOAuthConfig();

  const response = await fetch(config.userinfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await parseResponseBody(response);
    throw new OAuthRequestError(
      "UserInfo request failed",
      response.status,
      body,
      headersToObject(response.headers),
    );
  }

  return response.json();
}
