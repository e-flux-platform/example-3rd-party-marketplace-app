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
                  {String(user.sub ?? "Unknown")}
                </span>
              </p>
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
      </main>
    </div>
  );
}
