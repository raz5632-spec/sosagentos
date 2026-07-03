"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, clearSession, getSession, type Session } from "../../lib/api";

interface Dashboard {
  kpis: Record<string, number>;
  pendingApprovals: Array<{
    id: string;
    subjectType: string;
    title: string | null;
    createdAt: string;
  }>;
  recentAiActivity: Array<{ agent: string; model: string; costUsd: number; createdAt: string }>;
}

interface AgentRow {
  code: string;
  department: string;
}

const KPI_LABELS: Record<string, string> = {
  students_total: "תלמידים",
  students_at_risk: "תלמידים בסיכון",
  approvals_pending: "אישורים ממתינים",
  knowledge_production_items: "פריטי ידע רשמיים",
  content_approved: "תוכן מאושר",
  content_in_pipeline: "תוכן בעבודה",
  ai_invocations_total: "הפעלות AI",
  ai_cost_usd_total: 'עלות AI ($)',
};

const SUBJECT_LABELS: Record<string, string> = {
  acp_message: "משימת סוכן",
  knowledge_item: "פריט ידע",
  content_asset: "תוכן",
};

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSessionState] = useState<Session | null>(null);
  const [data, setData] = useState<Dashboard | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [agentCode, setAgentCode] = useState("ceo_interface");
  const [objective, setObjective] = useState("");
  const [agentOutput, setAgentOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async (orgId: string) => {
    const d = await api<Dashboard>(`/orgs/${orgId}/dashboard`);
    setData(d);
  }, []);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.push("/");
      return;
    }
    setSessionState(s);
    refresh(s.orgId).catch((e) => setError(String(e)));
    api<AgentRow[]>(`/orgs/${s.orgId}/agents`).then(setAgents).catch(() => {});
  }, [router, refresh]);

  async function decide(approvalId: string, action: "approve" | "reject") {
    if (!session) return;
    setBusy(true);
    try {
      await api(`/orgs/${session.orgId}/approvals/${approvalId}/${action}`, {
        method: "POST",
        body: action === "reject" ? { reason: "נדחה מהקונסולה" } : {},
      });
      await refresh(session.orgId);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function invokeAgent(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !objective.trim()) return;
    setBusy(true);
    setAgentOutput("");
    try {
      const res = await api<{ status: string; output?: { text?: string }; nextAction?: string }>(
        `/orgs/${session.orgId}/agents/${agentCode}/invoke`,
        { method: "POST", body: { objective, approvalLevel: "L1" } },
      );
      setAgentOutput(res.output?.text ?? `סטטוס: ${res.status}`);
      await refresh(session.orgId);
    } catch (err) {
      setAgentOutput(`שגיאה: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  if (!session) return null;

  return (
    <main className="container grid" style={{ gap: 18 }}>
      <div className="row spread">
        <div>
          <h1>SalesOS — מרכז הפיקוד</h1>
          <span className="muted">
            {session.orgName} · {session.displayName}
          </span>
        </div>
        <button
          className="btn-reject"
          onClick={() => {
            clearSession();
            router.push("/");
          }}
        >
          התנתקות
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <section className="grid kpi-grid" data-testid="kpis">
        {data ? (
          Object.entries(data.kpis).map(([code, value]) => (
            <div className="card" key={code}>
              <div className="kpi-value">
                {code === "ai_cost_usd_total" ? `$${value.toFixed(2)}` : value}
              </div>
              <div className="kpi-label">{KPI_LABELS[code] ?? code}</div>
            </div>
          ))
        ) : (
          <div className="muted">טוען נתונים...</div>
        )}
      </section>

      <section className="card" data-testid="approvals">
        <h2>תיבת אישורים ({data?.pendingApprovals.length ?? 0})</h2>
        {data?.pendingApprovals.length ? (
          <div className="grid">
            {data.pendingApprovals.map((a) => (
              <div className="row spread" key={a.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
                <div>
                  <div>{a.title ?? "(ללא כותרת)"}</div>
                  <span className="badge">{SUBJECT_LABELS[a.subjectType] ?? a.subjectType}</span>{" "}
                  <span className="muted">{new Date(a.createdAt).toLocaleString("he-IL")}</span>
                </div>
                <div className="row">
                  <button className="btn-approve" disabled={busy} onClick={() => decide(a.id, "approve")}>
                    אשר
                  </button>
                  <button className="btn-reject" disabled={busy} onClick={() => decide(a.id, "reject")}>
                    דחה
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">אין אישורים ממתינים 🎉</p>
        )}
      </section>

      <section className="card" data-testid="agent-console">
        <h2>הפעלת סוכן</h2>
        <form onSubmit={invokeAgent} className="grid">
          <select value={agentCode} onChange={(e) => setAgentCode(e.target.value)}>
            {(agents.length ? agents : [{ code: "ceo_interface", department: "executive" }]).map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} ({a.department})
              </option>
            ))}
          </select>
          <textarea
            rows={3}
            placeholder="מה תרצה שהסוכן יעשה?"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
          />
          <button className="btn-primary" disabled={busy || !objective.trim()}>
            {busy ? "רץ..." : "הפעל"}
          </button>
        </form>
        {agentOutput && <div className="output" style={{ marginTop: 12 }}>{agentOutput}</div>}
      </section>

      <section className="card" data-testid="ai-activity">
        <h2>פעילות AI אחרונה</h2>
        {data?.recentAiActivity.length ? (
          <div className="grid">
            {data.recentAiActivity.slice(0, 6).map((r, i) => (
              <div className="row spread muted" key={i}>
                <span>
                  {r.agent} · {r.model}
                </span>
                <span>
                  ${r.costUsd.toFixed(4)} · {new Date(r.createdAt).toLocaleTimeString("he-IL")}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">אין פעילות עדיין</p>
        )}
      </section>
    </main>
  );
}
