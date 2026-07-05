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

interface KnowledgeRow {
  id: string;
  title: string;
  type: string;
  status: string;
}

const KNOWLEDGE_STATUS: Record<string, string> = {
  candidate: "טיוטה",
  in_review: "ממתין לאישור",
  production: "✅ הסוכן לומד מזה",
};

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
  const [knowledge, setKnowledge] = useState<KnowledgeRow[]>([]);
  const [kTitle, setKTitle] = useState("");
  const [kContent, setKContent] = useState("");
  const [kQuery, setKQuery] = useState("");
  const [kResults, setKResults] = useState<Array<{ title: string; snippet: string; score: number }>>([]);

  const refreshKnowledge = useCallback(async (orgId: string) => {
    const rows = await api<KnowledgeRow[]>(`/orgs/${orgId}/knowledge`);
    setKnowledge(rows.slice(0, 15));
  }, []);

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
    refreshKnowledge(s.orgId).catch(() => {});
  }, [router, refresh, refreshKnowledge]);

  async function addKnowledge(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !kTitle.trim() || !kContent.trim()) return;
    setBusy(true);
    try {
      const created = await api<{ id: string }>(`/orgs/${session.orgId}/knowledge`, {
        method: "POST",
        body: { title: kTitle, content: kContent, type: "training_material", sourceType: "ceo_upload" },
      });
      // straight to the approval queue — one click instead of two
      await api(`/orgs/${session.orgId}/knowledge/${created.id}/submit`, { method: "POST" });
      setKTitle("");
      setKContent("");
      await Promise.all([refreshKnowledge(session.orgId), refresh(session.orgId)]);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function searchKnowledge(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !kQuery.trim()) return;
    const res = await api<Array<{ title: string; snippet: string; score: number }>>(
      `/orgs/${session.orgId}/knowledge/search?q=${encodeURIComponent(kQuery)}&status=any`,
    );
    setKResults(res.slice(0, 5));
  }

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

      <section className="card" data-testid="ai-training">
        <h2>🧠 אימון ה-AI — חומרי לימוד לסוכן</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          כל חומר שתוסיף כאן נכנס לתיבת האישורים; אחרי שתאשר — הסוכן מתחיל להתבסס עליו בתשובות
          (בוואטסאפ, בתוכן ובכל מקום).
        </p>
        <form onSubmit={addKnowledge} className="grid">
          <input
            placeholder="כותרת (למשל: מחירון התוכניות, שיטת הליווי שלנו...)"
            value={kTitle}
            onChange={(e) => setKTitle(e.target.value)}
          />
          <textarea
            rows={4}
            placeholder="הדבק כאן את החומר — עקרונות, תסריטי שיחה, שאלות נפוצות, כל מה שהסוכן צריך לדעת"
            value={kContent}
            onChange={(e) => setKContent(e.target.value)}
          />
          <button className="btn-primary" disabled={busy || !kTitle.trim() || !kContent.trim()}>
            הוסף ושלח לאישור
          </button>
        </form>

        {knowledge.length > 0 && (
          <div className="grid" style={{ marginTop: 14 }}>
            {knowledge.map((k) => (
              <div className="row spread muted" key={k.id}>
                <span>{k.title}</span>
                <span className="badge">{KNOWLEDGE_STATUS[k.status] ?? k.status}</span>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={searchKnowledge} className="row" style={{ marginTop: 14 }}>
          <input
            placeholder='בדוק מה הסוכן יודע — למשל "טיפול בהתנגדות מחיר"'
            value={kQuery}
            onChange={(e) => setKQuery(e.target.value)}
          />
          <button className="btn-primary" disabled={!kQuery.trim()}>חפש</button>
        </form>
        {kResults.length > 0 && (
          <div className="grid" style={{ marginTop: 10 }}>
            {kResults.map((r, i) => (
              <div key={i} className="output" style={{ maxHeight: 90 }}>
                <b>{r.title}</b> · התאמה {(r.score * 100).toFixed(0)}%
                <br />
                {r.snippet}
              </div>
            ))}
          </div>
        )}
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
