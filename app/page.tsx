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

type EreEndpoint = "chargers" | "sessions";

type AllSessionsResult = {
  pageSize: number;
  pageCount: number;
  fetchedCount: number;
  total: number | null;
  capped: boolean;
  sessions: unknown[];
};

export default function Home() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

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
        if (data.authenticated) {
          setUser(data.user);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    await fetch("/api/session", { method: "DELETE" });
    window.location.reload();
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
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Marketplace App</CardTitle>
            <CardDescription>
              Sign in with your e-flux account to get started.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button
              size="lg"
              onClick={() => {
                window.location.href = "/oauth/login";
              }}
            >
              Login with e-flux
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header with user info */}
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold">Marketplace App</h1>
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
