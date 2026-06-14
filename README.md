# e-flux Marketplace App - Reference Implementation

> **Disclaimer:** This code was generated with the assistance of Claude (Anthropic) and is provided as a **reference implementation only**. It is intended to illustrate the OAuth and API integration flow with the e-flux / Road platform. **Do not treat this as an example of a secure, production-ready implementation.** In particular, session management is in-memory, tokens are not encrypted at rest, and error handling is minimal. Always follow your organisation's security practices and conduct a proper security review before deploying anything based on this code.

## What this app does

This is a small Next.js application that demonstrates how a third-party marketplace app can:

1. **Authenticate a user via e-flux OAuth** using the Authorization Code flow with PKCE (S256).
2. **Fetch user information** from the OIDC UserInfo endpoint.
3. **Call the Road ERE API** (chargers and sessions) on behalf of the authenticated user.

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
- Two buttons allow fetching data from the Road ERE API:
  - **Load Chargers** calls `GET /1/ere/chargers`
  - **Load Sessions** calls `GET /1/ere/sessions`
- The app automatically refreshes the access token if it has expired.
- A **Logout** button clears the session and returns to the login screen.

### Key files

| File | Purpose |
|---|---|
| `lib/oauth.ts` | OIDC discovery, PKCE generation, token exchange, refresh, and userinfo fetch |
| `lib/session.ts` | In-memory session store (cookie-based session IDs) |
| `app/oauth/login/route.ts` | Starts the OAuth flow (generates PKCE, redirects to e-flux) |
| `app/oauth/callback/route.ts` | Handles the callback (exchanges code, fetches userinfo) |
| `app/api/session/route.ts` | Returns or clears session info |
| `app/api/ere/chargers/route.ts` | Proxies the ERE chargers API |
| `app/api/ere/sessions/route.ts` | Proxies the ERE sessions API |
| `app/page.tsx` | Home page (login screen or dashboard) |

## Getting started

### Prerequisites

- Node.js 18+
- An e-flux OAuth client ID and secret (contact e-flux to obtain these)

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

   Edit `.env` and set your `EFLUX_OAUTH_CLIENT_ID` and `EFLUX_OAUTH_CLIENT_SECRET`.

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment variables

| Variable | Description | Default |
|---|---|---|
| `EFLUX_OAUTH_CLIENT_ID` | Your OAuth client ID (required) | - |
| `EFLUX_OAUTH_CLIENT_SECRET` | Your OAuth client secret (required) | - |
| `NEXT_PUBLIC_APP_URL` | Public URL of this app | `http://localhost:3000` |
| `EFLUX_OIDC_DISCOVERY_URL` | OIDC discovery endpoint | `https://api.public.road.dev/1/marketplace/oauth/e-flux/.well-known/openid-configuration` |
| `EFLUX_API_BASE_URL` | Road API base URL | `https://api.road.io` |

## API documentation

- [ERE Chargers](https://documentation.road.io/reference/getv1erechargers)
- [ERE Sessions](https://documentation.road.io/reference/getv1eresessions)
