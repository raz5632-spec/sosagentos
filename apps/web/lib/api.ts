export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface Session {
  token: string;
  orgId: string;
  orgName: string;
  displayName: string;
}

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("salesos_session");
  return raw ? (JSON.parse(raw) as Session) : null;
}

export function setSession(s: Session) {
  localStorage.setItem("salesos_session", JSON.stringify(s));
}

export function clearSession() {
  localStorage.removeItem("salesos_session");
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  const session = getSession();
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ?? session?.token
        ? { Authorization: `Bearer ${opts.token ?? session?.token}` }
        : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}
