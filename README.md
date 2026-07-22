# e-flux Marketplace App - Reference Implementation

> **Disclaimer:** This code was generated with the assistance of Claude (Anthropic) and is provided as a **reference implementation only**. It is intended to illustrate the OAuth and API integration flow with the e-flux / Road platform. **Do not treat this as an example of a secure, production-ready implementation.** In particular, session management is in-memory, tokens are not encrypted at rest, and error handling is minimal. Always follow your organisation's security practices and conduct a proper security review before deploying anything based on this code.

## What this app does

This is a small Next.js application that demonstrates how a third-party marketplace app can:

1. **Obtain OAuth credentials** in one of two ways — preconfigured (preregistered) or by **self-registering** via Dynamic Client Registration (RFC 7591).
2. **Authenticate a user via e-flux OAuth** using the Authorization Code flow with PKCE (S256).
3. **Fetch user information** from the OIDC UserInfo endpoint.
4. **Call the Road ERE API** (chargers and sessions) on behalf of the authenticated user.
5. **Manage its own registration** (read / update / deregister) via RFC 7592, when running in dynamic mode.

## Client modes

Both modes are available at runtime and chosen from the UI on the home page —
there is **no** environment switch. The chosen mode is stored on the session so
the callback and token refresh use the right client.

| Mode | Credentials | Auth at token endpoint | Available when |
|---|---|---|---|
| Preregistered | `ROAD_OAUTH_CLIENT_ID` + `ROAD_OAUTH_CLIENT_SECRET` from env | client secret + PKCE | the env credentials are set |
| Dynamic (RFC 7591) | Self-obtained `client_id`, **no secret** | PKCE only (public client) | always |

The home page shows a card per mode: **Login (preregistered)** when credentials
are configured, and a **self-registration** card where you pick the scopes to
request, register, manage the registration (RFC 7592), and log in. A **Clear all
state** button resets everything (see below).

In **dynamic mode** the app:

1. Reads `registration_endpoint` from the OIDC discovery document.
2. Registers (on demand via the "Register now" button, or on first dynamic login): `POST`s its metadata (name, callback URL, requested scopes, `token_endpoint_auth_method: "none"`) and receives a `client_id`, a `registration_access_token`, and a `registration_client_uri`.
3. Persists that to `.dcr-registration.json` (see disclaimer — it holds a bearer token) and reuses it on subsequent runs.
4. Runs the normal Authorization Code + PKCE flow as a **public client** (no secret sent at the token endpoint).

**Clear all state** (`DELETE /api/state`) best-effort deregisters the dynamic
client (RFC 7592), deletes the local registration file, and clears the session —
so you can start from scratch.

```
App (Next.js)                                   e-flux / Road
  |  GET discovery -> registration_endpoint           |
  |-------------------------------------------------->|
  |  POST /register { client_name, redirect_uris,     |
  |       token_endpoint_auth_method: "none", scope } |
  |-------------------------------------------------->|
  |  { client_id, registration_access_token,          |
  |    registration_client_uri }                      |
  |<--------------------------------------------------|
  |  (persist, then run the PKCE login flow below)    |
```

The dashboard's **Dynamic Registration** card exposes the RFC 7592 management
operations against `registration_client_uri`, authenticated with the
`registration_access_token`:

- **Read (GET)** — fetch the current client metadata (does not rotate the token).
- **Update (PUT)** — full-replacement update; the server rotates the management token and the app re-persists it.
- **Deregister (DELETE)** — the server soft-deletes the client and revokes its grants; the app clears its local registration.

### Authentication flow

```
Browser                          App (Next.js)                    e-flux / Road
  |                                  |                                  |
  |  GET /oauth/login                |                                  |
  |--------------------------------->|                                  |
  |                                  |  Generate PKCE verifier+challenge |
  |                                  |  Store verifier in session        |
  |  302 Redirect                    |                                  |
  |<---------------------------------|                                  |
  |                                                                     |
  |  GET /oauth/authorize?code_challenge=...&...                        |
  |-------------------------------------------------------------------->|
  |                                  |              User logs in at e-flux
  |  302 Redirect with ?code=...     |                                  |
  |<--------------------------------------------------------------------|
  |                                                                     |
  |  GET /oauth/callback?code=...    |                                  |
  |--------------------------------->|                                  |
  |                                  |  POST /token (code + verifier)   |
  |                                  |--------------------------------->|
  |                                  |  { access_token, id_token, ... } |
  |                                  |<---------------------------------|
  |                                  |                                  |
  |                                  |  GET /userinfo                   |
  |                                  |--------------------------------->|
  |                                  |  { sub, account_id, ... }        |
  |                                  |<---------------------------------|
  |                                  |                                  |
  |  302 Redirect to /               |  Save tokens + user in session   |
  |<---------------------------------|                                  |
```

### Once authenticated

- The home page displays the user info returned by the OIDC UserInfo endpoint.
- Buttons fetch data from the Road API on behalf of the user:
  - **Load Chargers** calls `GET /1/ere/chargers`
  - **Load Sessions** calls `GET /1/ere/sessions`
  - **Load /users/me** calls `GET /1/users/me` — ERE-unrelated; confirms the access token's ACL behaves as expected.

  > The ERE endpoints require the **`ere`** scope, which is **gated**: it cannot
  > be requested via dynamic registration (RFC 7591). Only a **preregistered**
  > client — a curated template or a provider installation — can hold it. In the
  > dynamic self-registration card the `ere` checkbox is therefore disabled; use
  > the preregistered card (with `ere` selected) to exercise the ERE reads.
- The app automatically refreshes the access token if it has expired.
- A **Logout** button clears the session and returns to the login screen.

### Key files

| File | Purpose |
|---|---|
| `lib/discovery.ts` | Fetches and caches the OIDC/OAuth discovery document |
| `lib/oauth.ts` | Mode resolution, PKCE generation, token exchange, refresh, and userinfo fetch |
| `lib/dcr.ts` | Dynamic Client Registration (RFC 7591) + management (RFC 7592) |
| `lib/registration-store.ts` | File-backed persistence of the dynamic registration |
| `lib/session.ts` | In-memory session store (cookie-based session IDs) |
| `app/oauth/login/route.ts` | Starts the OAuth flow for the chosen mode (`?mode=`) |
| `app/oauth/callback/route.ts` | Handles the callback (exchanges code, fetches userinfo) |
| `app/api/session/route.ts` | Auth state + whether preregistered is configured + stored registration |
| `app/api/registration/route.ts` | RFC 7591 register (POST) + RFC 7592 read / update / deregister |
| `app/api/state/route.ts` | Clear all state (best-effort deregister + clear store + clear session) |
| `app/api/me/route.ts` | Proxies `GET /1/users/me` |
| `app/api/ere/chargers/route.ts` | Proxies the ERE chargers API |
| `app/api/ere/sessions/route.ts` | Proxies the ERE sessions API |
| `app/page.tsx` | Home page (mode cards / dashboard) |

## Getting started

### Prerequisites

- Node.js 18+
- For `preregistered` mode: an e-flux OAuth client ID and secret (contact e-flux to obtain these). `dynamic` mode needs neither — the app registers itself.

### Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/e-flux-platform/example-3rd-party-marketplace-app.git
   cd example-3rd-party-marketplace-app
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy the example environment file and fill in your credentials:

   ```bash
   cp .env.example .env
   ```

   Set `ROAD_PROVIDER_ID` (and the discovery/API URLs). To enable the preregistered card, also set `ROAD_OAUTH_CLIENT_ID` and `ROAD_OAUTH_CLIENT_SECRET`; the dynamic self-registration card works without them (optionally set `ROAD_OAUTH_CLIENT_NAME`).

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment variables

| Variable | Description | Default |
|---|---|---|
| `ROAD_OAUTH_CLIENT_ID` | OAuth client ID — enables the preregistered card | - |
| `ROAD_OAUTH_CLIENT_SECRET` | OAuth client secret — enables the preregistered card | - |
| `ROAD_OAUTH_CLIENT_NAME` | Client name sent at dynamic registration | `e-flux Reference App (dynamic)` |
| `ROAD_OAUTH_CLIENT_URI` | Optional homepage URL sent at dynamic registration | - |
| `ROAD_OAUTH_LOGO_URI` | Optional logo URL sent at dynamic registration | - |
| `ROAD_OAUTH_REGISTRATION_STORE` | Path to the persisted dynamic registration | `./.dcr-registration.json` |
| `NEXT_PUBLIC_APP_URL` | Public URL of this app | `http://localhost:3000` |
| `ROAD_OIDC_DISCOVERY_URL` | OIDC discovery endpoint | `https://api.road.io/1/oauth/<provider-slug>/.well-known/openid-configuration` |
| `ROAD_API_BASE_URL` | Road API base URL | `https://api.road.io` |
| `ROAD_PROVIDER_ID` | Provider identifier sent as the `Provider` header on ERE requests (required) | - |

## API documentation

- [ERE Chargers](https://documentation.road.io/reference/getv1erechargers)
- [ERE Sessions](https://documentation.road.io/reference/getv1eresessions)
- [Users — me](https://documentation.road.io/reference/getv1usersme)
