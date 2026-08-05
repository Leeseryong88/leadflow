import "server-only";

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "";
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";
const authBase = "https://identitytoolkit.googleapis.com/v1/accounts";
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

export class FirebaseRestError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message || code);
  }
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  if (!apiKey || !projectId) throw new FirebaseRestError(503, "FIREBASE_NOT_CONFIGURED", "Firebase 연결 정보가 설정되지 않았습니다.");
  const response = await fetch(url, { ...init, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = data?.error?.message || data?.error?.status || `HTTP_${response.status}`;
    throw new FirebaseRestError(response.status, String(code));
  }
  return data as T;
}

export async function lookupFirebaseUser(token: string) {
  const data = await requestJson<{ users?: Array<{ localId: string; email?: string }> }>(`${authBase}:lookup?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: token }),
  });
  const user = data.users?.[0];
  if (!user) throw new FirebaseRestError(401, "INVALID_ID_TOKEN", "인증 정보를 확인할 수 없습니다.");
  return user;
}

export async function createFirebaseUser(employeeNumber: string, password: string) {
  return requestJson<{ localId: string; email: string }>(`${authBase}:signUp?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${employeeNumber.trim().toLowerCase()}@leadflow.internal`, password, returnSecureToken: true }),
  });
}

type FireValue = Record<string, unknown>;
function encode(value: unknown): FireValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, encode(item)])) } };
}

function decode(value: Record<string, unknown>): unknown {
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) {
    const arrayValue = value.arrayValue as { values?: Array<Record<string, unknown>> };
    return (arrayValue.values || []).map(decode);
  }
  if ("mapValue" in value) {
    const mapValue = value.mapValue as { fields?: Record<string, Record<string, unknown>> };
    return Object.fromEntries(Object.entries(mapValue.fields || {}).map(([key, item]) => [key, decode(item)]));
  }
  return null;
}

function decodeDocument(document: { name: string; fields?: Record<string, Record<string, unknown>> }) {
  return {
    ...Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, decode(value)])),
    id: document.name.split("/").pop() || "",
  };
}

export async function getFirestoreDocument<T>(path: string, token: string): Promise<T | null> {
  const response = await fetch(`${firestoreBase}/${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (response.status === 404) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new FirebaseRestError(response.status, data?.error?.status || `HTTP_${response.status}`);
  return decodeDocument(data) as T;
}

export async function listFirestoreDocuments<T>(collection: string, token: string): Promise<T[]> {
  const data = await requestJson<{ documents?: Array<{ name: string; fields?: Record<string, Record<string, unknown>> }> }>(`${firestoreBase}/${collection}?pageSize=500`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (data.documents || []).map(decodeDocument) as T[];
}

export async function createFirestoreDocument(collection: string, id: string, data: Record<string, unknown>, token: string) {
  return requestJson(`${firestoreBase}/${collection}?documentId=${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)])) }),
  });
}

/** 문서가 없으면 생성, 있으면 덮어쓰기(upsert). */
export async function setFirestoreDocument(path: string, data: Record<string, unknown>, token: string) {
  return requestJson(`${firestoreBase}/${path}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)])) }),
  });
}

export async function deleteFirestoreDocument(path: string, token: string) {
  const response = await fetch(`${firestoreBase}/${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (response.status === 404) return;
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new FirebaseRestError(response.status, data?.error?.status || `HTTP_${response.status}`);
  }
}

/** Service-account token bypasses Firestore security rules. */
export async function getServiceAccountAccessToken() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  let serviceAccount: { client_email: string; private_key: string; token_uri?: string };
  try {
    serviceAccount = JSON.parse(raw) as { client_email: string; private_key: string; token_uri?: string };
  } catch {
    throw new FirebaseRestError(500, "INVALID_SERVICE_ACCOUNT", "FIREBASE_SERVICE_ACCOUNT_JSON 형식이 올바르지 않습니다.");
  }
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new FirebaseRestError(500, "INVALID_SERVICE_ACCOUNT", "서비스 계정 정보가 부족합니다.");
  }

  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: serviceAccount.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: [
      "https://www.googleapis.com/auth/identitytoolkit",
      "https://www.googleapis.com/auth/datastore",
      "https://www.googleapis.com/auth/cloud-platform",
    ].join(" "),
  };
  const assertion = await signServiceAccountJwt(claim, serviceAccount.private_key);
  const tokenResponse = await fetch(claim.aud, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });
  const tokenData = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new FirebaseRestError(tokenResponse.status || 500, "SERVICE_ACCOUNT_TOKEN", "서비스 계정 토큰을 발급하지 못했습니다.");
  }
  return String(tokenData.access_token);
}

/** Deletes Auth account + Firestore profile using the service account. */
export async function deleteUserCompletely(uid: string) {
  const accessToken = await getServiceAccountAccessToken();
  if (!accessToken) return false;

  await requestJson(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchDelete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ localIds: [uid], force: true }),
  });

  await deleteFirestoreDocument(`users/${uid}`, accessToken);
  return true;
}

/** @deprecated Prefer deleteUserCompletely — kept for callers that only need Auth. */
export async function deleteFirebaseAuthUser(uid: string) {
  const accessToken = await getServiceAccountAccessToken();
  if (!accessToken) return false;
  await requestJson(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchDelete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ localIds: [uid], force: true }),
  });
  return true;
}

async function signServiceAccountJwt(payload: Record<string, unknown>, privateKeyPem: string) {
  const encoder = new TextEncoder();
  const header = { alg: "RS256", typ: "JWT" };
  const encodePart = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encodePart(header)}.${encodePart(payload)}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(unsigned));
  return `${unsigned}.${Buffer.from(signature).toString("base64url")}`;
}

function pemToArrayBuffer(pem: string) {
  const normalized = pem.replace(/\\n/g, "\n").replace(/-----BEGIN [^-]+-----|-----END [^-]+-----|\s+/g, "");
  const binary = Buffer.from(normalized, "base64");
  return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
}
