import "server-only";
import { FirebaseRestError, getFirestoreDocument, lookupFirebaseUser } from "./firebase-server-rest";

export type ServerProfile = {
  uid: string;
  department: string;
  name: string;
  employeeNumber: string;
  role: "admin" | "leader";
  mustChangePassword: boolean;
  active: boolean;
};

export type AdminSession = ServerProfile & { token: string };

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function requireAdmin(request: Request): Promise<AdminSession> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new ApiError(401, "로그인이 필요합니다.");
  try {
    const user = await lookupFirebaseUser(token);
    const profile = await getFirestoreDocument<ServerProfile>(`users/${user.localId}`, token);
    const bootstrapUid = process.env.NEXT_PUBLIC_BOOTSTRAP_ADMIN_UID;
    if (!profile && user.localId === bootstrapUid) {
      return { uid: user.localId, department: "관리자", name: user.email?.split("@")[0] || "LeadFlow Admin", employeeNumber: user.email || "", role: "admin", mustChangePassword: false, active: true, token };
    }
    if (!profile?.active || profile.mustChangePassword) throw new ApiError(401, "계정 상태를 확인해 주세요.");
    if (profile.role !== "admin") throw new ApiError(403, "관리자만 사용할 수 있습니다.");
    return { ...profile, uid: user.localId, token };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof FirebaseRestError && error.status === 503) throw error;
    throw new ApiError(401, "인증 정보를 다시 확인해 주세요.");
  }
}

/** 관리자 여부와 무관하게 활성 사용자면 통과. (양식 설정 조회 등 읽기 전용 용도) */
export async function requireUser(request: Request): Promise<AdminSession> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new ApiError(401, "로그인이 필요합니다.");
  try {
    const user = await lookupFirebaseUser(token);
    const profile = await getFirestoreDocument<ServerProfile>(`users/${user.localId}`, token);
    const bootstrapUid = process.env.NEXT_PUBLIC_BOOTSTRAP_ADMIN_UID;
    if (!profile && user.localId === bootstrapUid) {
      return { uid: user.localId, department: "관리자", name: user.email?.split("@")[0] || "LeadFlow Admin", employeeNumber: user.email || "", role: "admin", mustChangePassword: false, active: true, token };
    }
    if (!profile?.active) throw new ApiError(401, "계정 상태를 확인해 주세요.");
    return { ...profile, uid: user.localId, token };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof FirebaseRestError && error.status === 503) throw error;
    throw new ApiError(401, "인증 정보를 다시 확인해 주세요.");
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof FirebaseRestError) {
    if (error.code === "EMAIL_EXISTS") return Response.json({ error: "이미 사용 중인 사번입니다." }, { status: 409 });
    if (error.code === "INVALID_SERVICE_ACCOUNT" || error.code === "SERVICE_ACCOUNT_TOKEN") {
      return Response.json({ error: "서비스 계정 설정에 문제가 있어 계정을 삭제하지 못했습니다." }, { status: 500 });
    }
    if (error.code === "PERMISSION_DENIED") {
      return Response.json({ error: "삭제 권한이 없습니다. 서비스 계정 설정을 확인해 주세요." }, { status: 403 });
    }
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: "서버 요청을 처리하지 못했습니다." }, { status: 500 });
}
