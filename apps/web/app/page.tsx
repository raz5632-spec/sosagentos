"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, setSession } from "../lib/api";

interface LoginResponse {
  token: string;
  user: { displayName: string };
  organizations: Array<{ orgId: string; orgName: string; role: string }>;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<LoginResponse>("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      const org = res.organizations[0];
      if (!org) throw new Error("אין לך שיוך לארגון");
      setSession({
        token: res.token,
        orgId: org.orgId,
        orgName: org.orgName,
        displayName: res.user.displayName,
      });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "התחברות נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container" style={{ maxWidth: 420, paddingTop: 90 }}>
      <div className="card">
        <h1 style={{ marginBottom: 4 }}>SalesOS</h1>
        <p className="muted" style={{ marginBottom: 20 }}>
          מרכז הפיקוד של S.O.S — התחברות
        </p>
        <form onSubmit={login} className="grid">
          <input
            type="email"
            placeholder="אימייל"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            data-testid="email"
          />
          <input
            type="password"
            placeholder="סיסמה"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            data-testid="password"
          />
          {error && <div className="error">{error}</div>}
          <button className="btn-primary" disabled={busy} data-testid="login-btn">
            {busy ? "מתחבר..." : "התחברות"}
          </button>
        </form>
      </div>
    </main>
  );
}
