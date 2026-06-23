/**
 * OpenID Connect / OAuth 2.0 discovery.
 *
 * Extracted into its own module so both the OAuth helpers (`lib/oauth.ts`) and
 * the Dynamic Client Registration helpers (`lib/dcr.ts`) can depend on it
 * without creating an import cycle.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  /** RFC 7591 Dynamic Client Registration endpoint. Present when the
   *  authorization server supports self-registration. */
  registration_endpoint?: string;
}

let cachedDiscovery: OidcDiscovery | null = null;

/**
 * Fetch and cache the discovery document. Reads the OIDC discovery URL from
 * `ROAD_OIDC_DISCOVERY_URL`.
 */
export async function getDiscovery(): Promise<OidcDiscovery> {
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
