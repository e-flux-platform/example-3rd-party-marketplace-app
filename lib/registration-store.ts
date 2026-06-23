/**
 * Persistence for a dynamically-registered (RFC 7591) OAuth client.
 *
 * For this reference implementation the registration is stored as a JSON file
 * on disk so the client survives restarts and we don't re-register on every
 * boot. In production you would keep this in a database or a secret store and
 * encrypt the `registration_access_token` at rest — it is a bearer credential
 * that can read, modify, and delete the client registration (RFC 7592).
 */

import { promises as fs } from "fs";
import path from "path";

export interface StoredRegistration {
  /** Authorization-server issuer the client was registered with. Used to
   *  invalidate the stored registration if the configured issuer changes. */
  issuer: string;
  client_id: string;
  /** RFC 7592 management credential. Sensitive — never expose to the browser. */
  registration_access_token: string;
  registration_client_uri: string;
  client_name: string;
  scope: string;
  registered_at: string;
}

/** Public (browser-safe) view of a registration — omits the management token. */
export type PublicRegistration = Omit<StoredRegistration, "registration_access_token">;

function storePath(): string {
  return (
    process.env.ROAD_OAUTH_REGISTRATION_STORE ||
    path.join(process.cwd(), ".dcr-registration.json")
  );
}

export async function readRegistration(): Promise<StoredRegistration | null> {
  try {
    const raw = await fs.readFile(storePath(), "utf8");
    return JSON.parse(raw) as StoredRegistration;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function writeRegistration(reg: StoredRegistration): Promise<void> {
  // 0o600 — owner read/write only; this file holds a bearer credential.
  await fs.writeFile(storePath(), JSON.stringify(reg, null, 2) + "\n", {
    mode: 0o600,
  });
}

export async function clearRegistration(): Promise<void> {
  try {
    await fs.unlink(storePath());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

export function toPublicRegistration(reg: StoredRegistration): PublicRegistration {
  return {
    issuer: reg.issuer,
    client_id: reg.client_id,
    registration_client_uri: reg.registration_client_uri,
    client_name: reg.client_name,
    scope: reg.scope,
    registered_at: reg.registered_at,
  };
}
