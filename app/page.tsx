"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type UserInfo = Record<string, unknown>;

type OAuthMode = "preregistered" | "dynamic";

type PublicRegistration = {
  issuer: string;
  client_id: string;
  registration_client_uri: string;
  client_name: string;
  scope: string;
  registered_at: string;
};

type SessionTokens = {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_at?: number;
};

// Scopes selectable at dynamic registration and at login. Kept in sync with
// AVAILABLE_SCOPES in lib/oauth.ts (not imported here, that module is
// server-only). `openid` is required by the server. `mcp` is the full-delegation
// marker: when requested the provider collapses the grant to a delegation token
// and shows the "acts as you" consent.
const AVAILABLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "offline_access",
  "chargers:read",
  "sessions:read",
  "mcp",
] as const;
const REQUIRED_SCOPE = "openid";

// OIDC `prompt` values selectable before login. Kept in sync with
// VALID_PROMPTS in app/oauth/login/route.ts. The empty value omits the
// `prompt` parameter entirely (provider default behaviour).
const PROMPT_OPTIONS = [
  { value: "consent", label: "consent — force the consent screen" },
  { value: "none", label: "none — no UI (errors if interaction needed)" },
  { value: "", label: "(don't send the prompt parameter)" },
] as const;
type Prompt = (typeof PROMPT_OPTIONS)[number]["value"];

type EreEndpoint = "chargers" | "sessions";

type AllSessionsResult = {
  pageSize: number;
  pageCount: number;
  fetchedCount: number;
  total: number | null;
  capped: boolean;
  sessions: unknown[];
};

function ModeBadge({ mode }: { mode: OAuthMode }) {
  const dynamic = mode === "dynamic";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        dynamic ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"
      }`}
      title={
        dynamic
          ? "Public client, self-registered via Dynamic Client Registration (RFC 7591)"
          : "Confidential client using preconfigured credentials"
      }
    >
      {dynamic ? "Dynamic client" : "Preregistered client"}
    </span>
  );
}

function TokenField({ label, value }: { label: string; value: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <textarea
        readOnly
        value={value}
        rows={3}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full resize-y rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs"
      />
    </label>
  );
}

function ScopeSelect({
  selected,
  onToggle,
  disabled,
  label = "Requested scopes",
}: {
  selected: string[];
  onToggle: (scope: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {AVAILABLE_SCOPES.map((scope) => {
          const required = scope === REQUIRED_SCOPE;
          return (
            <label key={scope} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(scope)}
                disabled={required || disabled}
                onChange={() => onToggle(scope)}
              />
              <span className="font-mono">{scope}</span>
              {required && (
                <span className="text-xs text-muted-foreground">(required)</span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function PromptSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: Prompt;
  onChange: (value: Prompt) => void;
  disabled?: boolean;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">
        Authorization prompt (OIDC <code>prompt</code>)
      </span>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as Prompt)}
        disabled={disabled}
        className="h-9 w-full max-w-sm rounded-md border bg-background px-3 text-sm"
      >
        {PROMPT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function RegistrationDetails({
  registration,
}: {
  registration: PublicRegistration;
}) {
  return (
    <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-[12rem_1fr]">
      <dt className="font-medium text-muted-foreground">Client name</dt>
      <dd>{registration.client_name}</dd>
      <dt className="font-medium text-muted-foreground">Client ID</dt>
      <dd className="break-all font-mono">{registration.client_id}</dd>
      <dt className="font-medium text-muted-foreground">Scopes</dt>
      <dd className="break-all">{registration.scope}</dd>
      <dt className="font-medium text-muted-foreground">Registered at</dt>
      <dd>{new Date(registration.registered_at).toLocaleString()}</dd>
      <dt className="font-medium text-muted-foreground">Management URI</dt>
      <dd className="break-all font-mono text-xs">
        {registration.registration_client_uri}
      </dd>
    </dl>
  );
}

function RegistrationManagement({
  registration,
  regBusy,
  regError,
  regNotice,
  regRead,
  newName,
  setNewName,
  onRead,
  onUpdate,
  onDeregister,
}: {
  registration: PublicRegistration;
  regBusy: string | null;
  regError: string | null;
  regNotice: string | null;
  regRead: Record<string, unknown> | null;
  newName: string;
  setNewName: (v: string) => void;
  onRead: () => void;
  onUpdate: () => void;
  onDeregister: () => void;
}) {
  return (
    <div className="space-y-4 border-t pt-4">
      <p className="text-sm font-medium">Manage registration (RFC 7592)</p>

      <div className="flex flex-wrap items-end gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onRead}
          disabled={regBusy !== null}
        >
          {regBusy === "read" ? "Reading..." : "Read (GET)"}
        </Button>

        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">New client name</span>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={registration.client_name}
              disabled={regBusy !== null}
              className="h-9 w-64 rounded-md border bg-background px-3 text-sm"
            />
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={onUpdate}
            disabled={regBusy !== null || newName.trim() === ""}
          >
            {regBusy === "update" ? "Updating..." : "Update (PUT)"}
          </Button>
        </div>

        <Button
          variant="destructive"
          size="sm"
          onClick={onDeregister}
          disabled={regBusy !== null}
        >
          {regBusy === "delete" ? "Deregistering..." : "Deregister (DELETE)"}
        </Button>
      </div>

      {regNotice && (
        <div className="rounded-md border border-emerald-500/50 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
          {regNotice}
        </div>
      )}

      {regError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {regError}
        </div>
      )}

      {regRead !== null && (
        <pre className="max-h-72 overflow-auto rounded-md bg-muted p-4 text-sm">
          {JSON.stringify(regRead, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function Home() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [tokens, setTokens] = useState<SessionTokens | null>(null);
  const [loading, setLoading] = useState(true);
  // The mode the active (authenticated) session logged in with; null when
  // logged out. Both modes are otherwise offered side by side on the login page.
  const [activeMode, setActiveMode] = useState<OAuthMode | null>(null);
  const [preregConfigured, setPreregConfigured] = useState(false);
  const [registration, setRegistration] = useState<PublicRegistration | null>(
    null
  );
  const [regBusy, setRegBusy] = useState<
    "register" | "read" | "update" | "delete" | "reset" | null
  >(null);
  const [regError, setRegError] = useState<string | null>(null);
  const [regNotice, setRegNotice] = useState<string | null>(null);
  const [regRead, setRegRead] = useState<Record<string, unknown> | null>(null);
  const [newName, setNewName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    ...AVAILABLE_SCOPES,
  ]);
  // OIDC `prompt` value to send on the next login; chosen per login card.
  const [prompt, setPrompt] = useState<Prompt>("consent");

  const [meData, setMeData] = useState<Record<string, unknown> | null>(null);
  const [meLoading, setMeLoading] = useState(false);
  const [meError, setMeError] = useState<string | null>(null);

  const [chargersData, setChargersData] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [chargersLoading, setChargersLoading] = useState(false);
  const [chargersError, setChargersError] = useState<string | null>(null);

  const [sessionsData, setSessionsData] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const [allSessions, setAllSessions] = useState<AllSessionsResult | null>(
    null
  );
  const [allSessionsLoading, setAllSessionsLoading] = useState(false);
  const [allSessionsError, setAllSessionsError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState("10");

  useEffect(() => {
    fetch("/api/session")
      .then((res) => res.json())
      .then((data) => {
        setPreregConfigured(Boolean(data.preregisteredConfigured));
        setRegistration(data.registration ?? null);
        if (data.authenticated) {
          setUser(data.user);
          setActiveMode(data.mode ?? null);
          setTokens(data.tokens ?? null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    await fetch("/api/session", { method: "DELETE" });
    window.location.reload();
  }

  // Clear all local state (session + stored registration; best-effort remote
  // deregister) and start fresh.
  async function clearAllState() {
    setRegBusy("reset");
    setRegError(null);
    try {
      await fetch("/api/state", { method: "DELETE" });
      window.location.reload();
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "Unknown error");
      setRegBusy(null);
    }
  }

  // -- RFC 7591 registration -------------------------------------------------

  function toggleScope(scope: string) {
    if (scope === REQUIRED_SCOPE) return; // always selected
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  }

  async function registerNow() {
    setRegBusy("register");
    setRegError(null);
    setRegNotice(null);
    try {
      const res = await fetch("/api/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes: selectedScopes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRegError(data.error || `Registration failed (${res.status})`);
      } else {
        setRegistration(data.registration);
        setRegNotice("Registered via RFC 7591 — you can now log in with this client.");
      }
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setRegBusy(null);
    }
  }

  // -- RFC 7592 registration management --------------------------------------

  async function readRegistration() {
    setRegBusy("read");
    setRegError(null);
    setRegNotice(null);
    setRegRead(null);
    try {
      const res = await fetch("/api/registration");
      const data = await res.json();
      if (!res.ok) {
        setRegError(data.error || `Read failed (${res.status})`);
      } else {
        setRegRead(data.client);
      }
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setRegBusy(null);
    }
  }

  async function updateRegistration() {
    setRegBusy("update");
    setRegError(null);
    setRegNotice(null);
    try {
      const res = await fetch("/api/registration", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_name: newName || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRegError(data.error || `Update failed (${res.status})`);
      } else {
        setRegistration(data.registration);
        setRegRead(null);
        setNewName("");
        setRegNotice(
          "Metadata updated — the management token was rotated server-side and re-persisted."
        );
      }
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setRegBusy(null);
    }
  }

  async function deregister() {
    setRegBusy("delete");
    setRegError(null);
    setRegNotice(null);
    try {
      const res = await fetch("/api/registration", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setRegError(data.error || `Deregister failed (${res.status})`);
        setRegBusy(null);
        return;
      }
      // Registration is gone; reload to the login screen (next login re-registers).
      window.location.reload();
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "Unknown error");
      setRegBusy(null);
    }
  }

  async function loadMe() {
    setMeLoading(true);
    setMeError(null);
    setMeData(null);
    try {
      const res = await fetch("/api/me");
      const data = await res.json();
      if (!res.ok) {
        setMeError(data.error || `Request failed with status ${res.status}`);
      } else {
        setMeData(data);
      }
    } catch (err) {
      setMeError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setMeLoading(false);
    }
  }

  async function loadEreData(endpoint: EreEndpoint) {
    const setData =
      endpoint === "chargers" ? setChargersData : setSessionsData;
    const setErr =
      endpoint === "chargers" ? setChargersError : setSessionsError;
    const setLd =
      endpoint === "chargers" ? setChargersLoading : setSessionsLoading;

    setLd(true);
    setErr(null);
    setData(null);

    try {
      const res = await fetch(`/api/ere/${endpoint}`);
      const data = await res.json();

      if (!res.ok) {
        setErr(data.error || `Request failed with status ${res.status}`);
      } else {
        setData(data);
      }
    } catch (err) {
      setErr(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLd(false);
    }
  }

  async function loadAllSessions() {
    setAllSessionsLoading(true);
    setAllSessionsError(null);
    setAllSessions(null);

    try {
      const res = await fetch(
        `/api/ere/sessions/all?pageSize=${encodeURIComponent(pageSize)}`
      );
      const data = await res.json();

      if (!res.ok) {
        setAllSessionsError(
          data.error || `Request failed with status ${res.status}`
        );
      } else {
        setAllSessions(data);
      }
    } catch (err) {
      setAllSessionsError(
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      setAllSessionsLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto min-h-screen max-w-3xl space-y-6 px-4 py-10">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Marketplace App</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose how this app authenticates with e-flux.
          </p>
        </div>

        {/* Mode 1 — preregistered (confidential) client */}
        <Card>
          <CardHeader>
            <div className="mb-1">
              <ModeBadge mode="preregistered" />
            </div>
            <CardTitle>Preregistered app</CardTitle>
            <CardDescription>
              A confidential client with a preconfigured client ID + secret,
              installed by a provider admin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {preregConfigured ? (
              <>
                <ScopeSelect
                  selected={selectedScopes}
                  onToggle={toggleScope}
                />
                <PromptSelect
                  id="prompt-preregistered"
                  value={prompt}
                  onChange={setPrompt}
                />
                <Button
                  onClick={() => {
                    window.location.href = `/oauth/login?mode=preregistered&prompt=${encodeURIComponent(
                      prompt
                    )}&scope=${encodeURIComponent(selectedScopes.join(" "))}`;
                  }}
                >
                  Login (preregistered)
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Not configured. Set <code>ROAD_OAUTH_CLIENT_ID</code> and{" "}
                <code>ROAD_OAUTH_CLIENT_SECRET</code> to enable this mode.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Mode 2 — dynamic (self-registered) client */}
        <Card>
          <CardHeader>
            <div className="mb-1">
              <ModeBadge mode="dynamic" />
            </div>
            <CardTitle>Self-registration (RFC 7591)</CardTitle>
            <CardDescription>
              A public client that registers itself — no admin and no client
              secret. Authenticates with PKCE only.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!registration ? (
              <>
                <p className="text-sm text-muted-foreground">
                  No registration yet. Choose the scopes to request, then
                  register to obtain a client ID and a management token (RFC
                  7592).
                </p>
                <ScopeSelect
                  selected={selectedScopes}
                  onToggle={toggleScope}
                  disabled={regBusy !== null}
                />
                <Button
                  onClick={registerNow}
                  disabled={regBusy !== null || selectedScopes.length === 0}
                >
                  {regBusy === "register" ? "Registering..." : "Register now"}
                </Button>
              </>
            ) : (
              <>
                <RegistrationDetails registration={registration} />
                <RegistrationManagement
                  registration={registration}
                  regBusy={regBusy}
                  regError={regError}
                  regNotice={regNotice}
                  regRead={regRead}
                  newName={newName}
                  setNewName={setNewName}
                  onRead={readRegistration}
                  onUpdate={updateRegistration}
                  onDeregister={deregister}
                />
                <ScopeSelect
                  selected={selectedScopes}
                  onToggle={toggleScope}
                  disabled={regBusy !== null}
                  label="Requested scopes (must be within the registered set)"
                />
                <PromptSelect
                  id="prompt-dynamic"
                  value={prompt}
                  onChange={setPrompt}
                  disabled={regBusy !== null}
                />
                <Button
                  onClick={() => {
                    window.location.href = `/oauth/login?mode=dynamic&prompt=${encodeURIComponent(
                      prompt
                    )}&scope=${encodeURIComponent(selectedScopes.join(" "))}`;
                  }}
                  disabled={regBusy !== null}
                >
                  Login with this app
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Reset */}
        <div className="flex items-center justify-between rounded-md border border-dashed p-4">
          <p className="text-sm text-muted-foreground">
            Clear the session and any stored registration to start over.
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={clearAllState}
            disabled={regBusy !== null}
          >
            {regBusy === "reset" ? "Clearing..." : "Clear all state"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header with user info */}
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">Marketplace App</h1>
            {activeMode && <ModeBadge mode={activeMode} />}
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">
                  {String(user.name ?? user.sub ?? "Unknown")}
                </span>
              </p>
              {user.email ? (
                <p>
                  {String(user.email)}
                  {user.email_verified ? " ✓" : ""}
                </p>
              ) : null}
              {user.account_id ? <p>Account {String(user.account_id)}</p> : null}
              {user.provider_id ? <p>Provider {String(user.provider_id)}</p> : null}
            </div>
            <Button variant="outline" size="sm" onClick={logout}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        {/* OAuth tokens — shown for easy copy while testing */}
        {tokens && (
          <Card>
            <CardHeader>
              <CardTitle>OAuth tokens</CardTitle>
              <CardDescription>
                The tokens issued for this session. The access token is the
                Bearer credential for API / MCP calls. Click a field to select
                it.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <TokenField label="Access token" value={tokens.access_token} />
              {tokens.id_token && (
                <TokenField label="ID token" value={tokens.id_token} />
              )}
              {tokens.refresh_token && (
                <TokenField
                  label="Refresh token"
                  value={tokens.refresh_token}
                />
              )}
              {tokens.expires_at && (
                <p className="text-xs text-muted-foreground">
                  Access token expires{" "}
                  {new Date(tokens.expires_at).toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Dynamic registration (RFC 7591) — shown whenever one exists */}
        {registration && (
          <Card>
            <CardHeader>
              <CardTitle>Dynamic Registration</CardTitle>
              <CardDescription>
                This client registered itself with the provider via RFC 7591.
                It is a public client and authenticates with PKCE only — no
                client secret was ever issued.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <RegistrationDetails registration={registration} />
              <RegistrationManagement
                registration={registration}
                regBusy={regBusy}
                regError={regError}
                regNotice={regNotice}
                regRead={regRead}
                newName={newName}
                setNewName={setNewName}
                onRead={readRegistration}
                onUpdate={updateRegistration}
                onDeregister={deregister}
              />
            </CardContent>
          </Card>
        )}

        {/* users/me — ERE-unrelated, proves the access token's ACL */}
        <Card>
          <CardHeader>
            <CardTitle>User (GET /1/users/me)</CardTitle>
            <CardDescription>
              An ERE-unrelated call that exercises a different part of the API
              to confirm the access token&apos;s ACL/scoping behaves as expected.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={loadMe} disabled={meLoading}>
              {meLoading ? "Loading..." : "Load /users/me"}
            </Button>
            {meError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                {meError}
              </div>
            )}
            {meData !== null && (
              <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-sm">
                {JSON.stringify(meData, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>

        {/* User info */}
        <Card>
          <CardHeader>
            <CardTitle>User Info</CardTitle>
            <CardDescription>
              Raw response from the OIDC userinfo endpoint.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-64 overflow-auto rounded-md bg-muted p-4 text-sm">
              {JSON.stringify(user, null, 2)}
            </pre>
          </CardContent>
        </Card>

        {/* Chargers card */}
        <Card>
          <CardHeader>
            <CardTitle>Chargers</CardTitle>
            <CardDescription>
              Fetch your ERE charger data, including capacity, connector type,
              model, and renewable energy percentage.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => loadEreData("chargers")}
              disabled={chargersLoading}
            >
              {chargersLoading ? "Loading..." : "Load Chargers"}
            </Button>

            {chargersError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                {chargersError}
              </div>
            )}

            {chargersData !== null && (
              <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-sm">
                {JSON.stringify(chargersData, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>

        {/* Sessions card */}
        <Card>
          <CardHeader>
            <CardTitle>Sessions</CardTitle>
            <CardDescription>
              Fetch your ERE session data, including energy delivered,
              timestamps, and location information.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => loadEreData("sessions")}
              disabled={sessionsLoading}
            >
              {sessionsLoading ? "Loading..." : "Load Sessions"}
            </Button>

            {sessionsError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                {sessionsError}
              </div>
            )}

            {sessionsData !== null && (
              <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-sm">
                {JSON.stringify(sessionsData, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>

        {/* All sessions (paginated) card */}
        <Card>
          <CardHeader>
            <CardTitle>All Sessions (paginated)</CardTitle>
            <CardDescription>
              Walk every page of your ERE sessions using the{" "}
              <code className="rounded bg-muted px-1 py-0.5">
                meta.nextSince
              </code>{" "}
              delta-sync cursor, then summarise how many times the endpoint was
              called and how many records exist in total.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Page size</span>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value)}
                  disabled={allSessionsLoading}
                  className="h-9 w-28 rounded-md border bg-background px-3 text-sm"
                />
              </label>
              <Button
                onClick={loadAllSessions}
                disabled={allSessionsLoading}
              >
                {allSessionsLoading ? "Paginating..." : "Load All Sessions"}
              </Button>
            </div>

            {allSessionsError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                {allSessionsError}
              </div>
            )}

            {allSessions !== null && (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-md border bg-muted p-4">
                    <p className="text-2xl font-semibold">
                      {allSessions.pageSize}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Page size used
                    </p>
                  </div>
                  <div className="rounded-md border bg-muted p-4">
                    <p className="text-2xl font-semibold">
                      {allSessions.pageCount}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Pagination endpoint calls
                    </p>
                  </div>
                  <div className="rounded-md border bg-muted p-4">
                    <p className="text-2xl font-semibold">
                      {allSessions.total ?? "—"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Records available (meta.total)
                    </p>
                  </div>
                  <div className="rounded-md border bg-muted p-4">
                    <p className="text-2xl font-semibold">
                      {allSessions.fetchedCount}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Records fetched
                    </p>
                  </div>
                </div>

                {allSessions.capped && (
                  <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
                    Stopped at the safety cap before exhausting every page — the
                    figures above may be incomplete.
                  </div>
                )}

                <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-sm">
                  {JSON.stringify(allSessions.sessions, null, 2)}
                </pre>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
