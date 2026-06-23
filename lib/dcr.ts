/**
 * Dynamic Client Registration (RFC 7591).
 *
 * In "dynamic" mode the app registers itself with the authorization server
 * instead of using preconfigured credentials. It becomes a public client
 * (`token_endpoint_auth_method: "none"`), authenticating purely with PKCE — no
 * client secret is ever issued.
 */

import type { OidcDiscovery } from "./discovery";
import {
  readRegistration,
  writeRegistration,
  clearRegistration,
  StoredRegistration,
} from "./registration-store";

interface DcrRegistrationResponse {
  client_id: string;
  registration_access_token: string;
  registration_client_uri: string;
  client_name?: string;
  scope?: string;
}

// In-process guard so concurrent first-boot requests don't each fire a
// registration. The first caller registers; the rest await the same promise.
let registrationInFlight: Promise<StoredRegistration> | null = null;

interface EnsureOptions {
  discovery: OidcDiscovery;
  callbackUrl: string;
  scope: string;
}

/**
 * Return the current dynamic registration, registering on first use. Reuses a
 * stored registration as long as it belongs to the configured issuer.
 */
export async function ensureRegistration(
  opts: EnsureOptions
): Promise<StoredRegistration> {
  const existing = await readRegistration();
  if (existing && existing.issuer === opts.discovery.issuer) {
    return existing;
  }

  if (registrationInFlight) return registrationInFlight;
  registrationInFlight = register(opts).finally(() => {
    registrationInFlight = null;
  });
  return registrationInFlight;
}

async function register(opts: EnsureOptions): Promise<StoredRegistration> {
  const endpoint = opts.discovery.registration_endpoint;
  if (!endpoint) {
    throw new Error(
      "Authorization server does not advertise a registration_endpoint (RFC 7591); cannot run in dynamic mode."
    );
  }

  const clientName =
    process.env.ROAD_OAUTH_CLIENT_NAME || "e-flux Reference App (dynamic)";

  const metadata: Record<string, unknown> = {
    client_name: clientName,
    redirect_uris: [opts.callbackUrl],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: opts.scope,
    application_type: "web",
  };
  if (process.env.ROAD_OAUTH_CLIENT_URI) {
    metadata.client_uri = process.env.ROAD_OAUTH_CLIENT_URI;
  }
  if (process.env.ROAD_OAUTH_LOGO_URI) {
    metadata.logo_uri = process.env.ROAD_OAUTH_LOGO_URI;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Dynamic client registration failed (${response.status}): ${body}`
    );
  }

  const data = (await response.json()) as DcrRegistrationResponse;

  const stored: StoredRegistration = {
    issuer: opts.discovery.issuer,
    client_id: data.client_id,
    registration_access_token: data.registration_access_token,
    registration_client_uri: data.registration_client_uri,
    client_name: data.client_name ?? clientName,
    scope: data.scope ?? opts.scope,
    registered_at: new Date().toISOString(),
  };

  await writeRegistration(stored);
  return stored;
}

// -- RFC 7592 management -----------------------------------------------------
// These operate on the stored registration's registration_client_uri using the
// registration_access_token as a bearer credential.

function callbackUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) throw new Error("Missing required environment variable: NEXT_PUBLIC_APP_URL");
  return `${base}/oauth/callback`;
}

async function requireStored(): Promise<StoredRegistration> {
  const reg = await readRegistration();
  if (!reg) {
    throw new Error("No dynamic registration found — log in once to register first.");
  }
  return reg;
}

/**
 * RFC 7592 read — GET the registration_client_uri. Returns the server's current
 * view of the client metadata. Does NOT rotate the management token.
 */
export async function fetchManagedClient(): Promise<Record<string, unknown>> {
  const reg = await requireStored();
  const res = await fetch(reg.registration_client_uri, {
    headers: {
      Authorization: `Bearer ${reg.registration_access_token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Registration read failed (${res.status}): ${body}`);
  }
  return res.json();
}

/**
 * RFC 7592 update — full-replacement PUT. The server rotates the management
 * token, so we persist the new one (and the echoed metadata) to the store.
 */
export async function updateManagedClient(changes: {
  client_name?: string;
}): Promise<StoredRegistration> {
  const reg = await requireStored();

  const metadata = {
    client_name: changes.client_name?.trim() || reg.client_name,
    redirect_uris: [callbackUrl()],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: reg.scope,
    application_type: "web",
  };

  const res = await fetch(reg.registration_client_uri, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${reg.registration_access_token}`,
    },
    body: JSON.stringify(metadata),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Registration update failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as DcrRegistrationResponse;
  const updated: StoredRegistration = {
    ...reg,
    client_name: data.client_name ?? metadata.client_name,
    scope: data.scope ?? reg.scope,
    // PUT rotates the token — keep the fresh one, fall back defensively.
    registration_access_token:
      data.registration_access_token ?? reg.registration_access_token,
    registration_client_uri:
      data.registration_client_uri ?? reg.registration_client_uri,
  };
  await writeRegistration(updated);
  return updated;
}

/**
 * RFC 7592 deregister — DELETE the registration, then clear the local store.
 * The server soft-deletes the client and cascade-revokes its grants.
 */
export async function deregisterManagedClient(): Promise<void> {
  const reg = await requireStored();
  const res = await fetch(reg.registration_client_uri, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${reg.registration_access_token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Deregistration failed (${res.status}): ${body}`);
  }
  await clearRegistration();
}
