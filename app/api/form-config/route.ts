import { getFirestoreDocument, getServiceAccountAccessToken, setFirestoreDocument } from "../../../lib/firebase-server-rest";
import { ApiError, errorResponse, requireAdmin, requireUser } from "../../../lib/server-auth";
import { mergeFormConfig } from "../../../lib/form-config";

export const runtime = "nodejs";

const CONFIG_PATH = "settings/reportForm";

/** 저장된 양식 설정 조회 — 로그인한 모든 사용자(작성 화면에서 필요). */
export async function GET(request: Request) {
  try {
    const session = await requireUser(request);
    const serviceToken = await getServiceAccountAccessToken();
    const saved = await getFirestoreDocument<Record<string, unknown>>(CONFIG_PATH, serviceToken || session.token);
    return Response.json({ config: mergeFormConfig(saved) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** 양식 설정 저장 — 관리자 전용. */
export async function POST(request: Request) {
  try {
    const session = await requireAdmin(request);
    const body = await request.json().catch(() => ({}));
    const config = mergeFormConfig(body?.config);
    const serviceToken = await getServiceAccountAccessToken();
    if (!serviceToken) throw new ApiError(500, "서비스 계정이 설정되지 않아 양식을 저장할 수 없습니다.");
    await setFirestoreDocument(CONFIG_PATH, { ...config, updatedAt: new Date().toISOString(), updatedBy: session.uid }, serviceToken);
    return Response.json({ ok: true, config });
  } catch (error) {
    return errorResponse(error);
  }
}
