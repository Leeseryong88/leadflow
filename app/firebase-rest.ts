/* Firestore's REST wire format is intentionally dynamic at the decode boundary. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Session = { idToken: string; refreshToken: string; uid: string; expiresAt: number };
export type Profile = {
  uid: string;
  department: string;
  name: string;
  employeeNumber: string;
  role: "admin" | "leader";
  mustChangePassword: boolean;
  active: boolean;
};

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "";
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";
export const bootstrapAdminEmail = (process.env.NEXT_PUBLIC_BOOTSTRAP_ADMIN_EMAIL || "").toLowerCase();
export const bootstrapAdminUid = process.env.NEXT_PUBLIC_BOOTSTRAP_ADMIN_UID || "";
export const firebaseReady = Boolean(apiKey && projectId);
const SESSION_KEY = "leadflow_session";
const REFRESH_SKEW_MS = 5 * 60 * 1000;
const authUrl = (action: string) => `https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${apiKey}`;
const refreshUrl = () => `https://securetoken.googleapis.com/v1/token?key=${apiKey}`;
const docBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

function loginEmail(identifier: string) {
  const normalized = identifier.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@leadflow.internal`;
}

async function jsonRequest<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const raw = data?.error?.message || data?.error || "요청을 처리하지 못했습니다.";
    const messages: Record<string, string> = {
      INVALID_LOGIN_CREDENTIALS: "사번 또는 비밀번호를 확인해 주세요.",
      TOO_MANY_ATTEMPTS_TRY_LATER: "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.",
      WEAK_PASSWORD: "비밀번호는 8자 이상으로 설정해 주세요.",
      TOKEN_EXPIRED: "로그인이 만료되었습니다. 다시 로그인해 주세요.",
      INVALID_REFRESH_TOKEN: "로그인이 만료되었습니다. 다시 로그인해 주세요.",
    };
    throw new Error(messages[raw] || raw);
  }
  return data as T;
}

export function saveSession(session: Session) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  sessionStorage.removeItem(SESSION_KEY);
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

function readStoredSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as Session;
    if (!saved?.idToken || !saved?.refreshToken || !saved?.uid) return null;
    return saved;
  } catch {
    return null;
  }
}

export async function refreshSession(session: Session): Promise<Session> {
  const result = await jsonRequest<{ id_token: string; refresh_token: string; user_id: string; expires_in: string }>(
    refreshUrl(),
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: session.refreshToken }),
    },
  );
  return {
    idToken: result.id_token,
    refreshToken: result.refresh_token || session.refreshToken,
    uid: result.user_id || session.uid,
    expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000,
  };
}

export async function restoreSession(): Promise<Session | null> {
  const saved = readStoredSession();
  if (!saved) return null;
  const needsRefresh = !saved.expiresAt || saved.expiresAt < Date.now() + REFRESH_SKEW_MS;
  try {
    const session = needsRefresh ? await refreshSession(saved) : saved;
    saveSession(session);
    return session;
  } catch {
    clearSession();
    return null;
  }
}

export async function signIn(identifier: string, password: string): Promise<Session> {
  const result = await jsonRequest<{ idToken: string; refreshToken: string; localId: string; expiresIn: string }>(
    authUrl("signInWithPassword"),
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: loginEmail(identifier), password, returnSecureToken: true }) },
  );
  return { idToken: result.idToken, refreshToken: result.refreshToken, uid: result.localId, expiresAt: Date.now() + Number(result.expiresIn) * 1000 };
}

export async function changePassword(session: Session, password: string) {
  const result = await jsonRequest<{ idToken: string; refreshToken: string; expiresIn?: string }>(authUrl("update"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: session.idToken, password, returnSecureToken: true }),
  });
  await patchDocument(`users/${session.uid}`, { mustChangePassword: false, passwordChangedAt: new Date().toISOString() }, result.idToken);
  return {
    ...session,
    idToken: result.idToken,
    refreshToken: result.refreshToken,
    expiresAt: Date.now() + Number(result.expiresIn || 3600) * 1000,
  };
}

type FireValue = Record<string, unknown>;
function encode(value: unknown): FireValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, encode(v)])) } };
}

function decode(value: any): any {
  if (!value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decode);
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, decode(v)]));
  return null;
}

function fields(data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encode(v)]));
}

export async function getDocument<T>(path: string, token: string): Promise<T | null> {
  const database = `projects/${projectId}/databases/(default)`;
  const response = await fetch(`https://firestore.googleapis.com/v1/${database}/documents:batchGet`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ documents: [`${database}/documents/${path}`] }),
  });
  if (!response.ok) throw new Error("데이터를 불러오지 못했습니다.");
  const payload = await response.json();
  const result = Array.isArray(payload) ? payload[0] : payload;
  if (!result || result.missing || !result.found) return null;
  const document = result.found;
  return { ...Object.fromEntries(Object.entries(document.fields || {}).map(([k, v]) => [k, decode(v)])), id: document.name.split("/").pop() } as T;
}

export async function listDocuments<T>(collection: string, token: string): Promise<T[]> {
  const response = await fetch(`${docBase}/${collection}?pageSize=500`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("목록을 불러오지 못했습니다.");
  const data = await response.json();
  return (data.documents || []).map((doc: any) => ({ ...Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, decode(v)])), id: doc.name.split("/").pop() })) as T[];
}

/** Equality query — required for leaders reading own reports under Firestore rules. */
export async function queryDocumentsByField<T>(collection: string, field: string, value: string, token: string): Promise<T[]> {
  const database = `projects/${projectId}/databases/(default)`;
  const response = await fetch(`https://firestore.googleapis.com/v1/${database}/documents:runQuery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: {
          fieldFilter: {
            field: { fieldPath: field },
            op: "EQUAL",
            value: { stringValue: value },
          },
        },
        limit: 500,
      },
    }),
  });
  if (!response.ok) throw new Error("목록을 불러오지 못했습니다.");
  const rows = await response.json();
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row: any) => row?.document)
    .map((row: any) => {
      const doc = row.document;
      return {
        ...Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, decode(v)])),
        id: doc.name.split("/").pop(),
      };
    }) as T[];
}

export async function createDocument(collection: string, id: string, data: Record<string, unknown>, token: string) {
  return jsonRequest(`${docBase}/${collection}?documentId=${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: fields(data) }),
  });
}

export async function patchDocument(path: string, data: Record<string, unknown>, token: string) {
  const masks = Object.keys(data).map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`).join("&");
  return jsonRequest(`${docBase}/${path}?${masks}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: fields(data) }),
  });
}

export async function callFunction<T>(name: string, body: Record<string, unknown>, token: string): Promise<T> {
  const routes: Record<string, string> = {
    createUserAccount: "/api/admin/users",
    generatePeriodSummary: "/api/ai/summary",
    askLeadFlow: "/api/ai/ask",
    savePeriodSummary: "/api/ai/summaries",
  };
  const route = routes[name];
  if (!route) throw new Error("알 수 없는 서버 요청입니다.");
  return jsonRequest<T>(route, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function listSavedSummaries<T>(token: string): Promise<T[]> {
  const data = await jsonRequest<{ items: T[] }>("/api/ai/summaries", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data.items || [];
}

export async function deleteSavedSummary(id: string, token: string) {
  return jsonRequest<{ ok: boolean; message: string }>(`/api/ai/summaries?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function deleteUserAccount(uid: string, token: string) {
  return jsonRequest<{ ok: boolean; message: string }>(`/api/admin/users?uid=${encodeURIComponent(uid)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function deleteReport(id: string, token: string) {
  return jsonRequest<{ ok: boolean; message: string }>(`/api/admin/reports?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getOrBootstrapProfile(session: Session): Promise<Profile | null> {
  const existing = await getDocument<Profile>(`users/${session.uid}`, session.idToken);
  if (existing) return existing;
  if (!bootstrapAdminUid || session.uid !== bootstrapAdminUid) return null;

  const profile: Profile = {
    uid: session.uid,
    department: "관리자",
    name: bootstrapAdminEmail.split("@")[0] || "LeadFlow Admin",
    employeeNumber: bootstrapAdminEmail,
    role: "admin",
    mustChangePassword: false,
    active: true,
  };
  await createDocument("users", session.uid, { ...profile, email: bootstrapAdminEmail, createdAt: new Date().toISOString(), createdBy: "bootstrap" }, session.idToken);
  return profile;
}
