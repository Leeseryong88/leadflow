import { createFirebaseUser, createFirestoreDocument, deleteUserCompletely, getFirestoreDocument } from "@/lib/firebase-server-rest";
import { ApiError, errorResponse, requireAdmin, ServerProfile } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const caller = await requireAdmin(request);
    const body = await request.json();
    const { department, name, employeeNumber, role = "leader" } = body;
    const password = "0000";
    if (![department, name, employeeNumber].every((value) => typeof value === "string" && value.trim())) {
      return Response.json({ error: "부서, 이름, 사번을 모두 입력해 주세요." }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9_-]{2,30}$/.test(employeeNumber)) return Response.json({ error: "사번은 영문, 숫자, -, _ 만 사용할 수 있습니다." }, { status: 400 });
    if (!["admin", "leader"].includes(role)) return Response.json({ error: "잘못된 권한입니다." }, { status: 400 });

    const authUser = await createFirebaseUser(employeeNumber, password);
    const user = { uid: authUser.localId, department: department.trim(), name: name.trim(), employeeNumber: employeeNumber.trim(), role, mustChangePassword: true, active: true, createdAt: new Date().toISOString(), createdBy: caller.uid };
    await createFirestoreDocument("users", authUser.localId, user, caller.token);
    return Response.json({ user }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const caller = await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid") || "";
    if (!uid) throw new ApiError(400, "삭제할 사용자를 지정해 주세요.");
    if (uid === caller.uid) throw new ApiError(400, "본인 계정은 삭제할 수 없습니다.");
    if (uid === process.env.NEXT_PUBLIC_BOOTSTRAP_ADMIN_UID) throw new ApiError(400, "초기 관리자 계정은 삭제할 수 없습니다.");

    const target = await getFirestoreDocument<ServerProfile>(`users/${uid}`, caller.token);
    if (!target) throw new ApiError(404, "사용자를 찾을 수 없습니다.");

    // Client tokens cannot delete users (rules: allow delete: if false).
    // Service account deletes Auth + Firestore profile together.
    const deleted = await deleteUserCompletely(uid);
    if (!deleted) throw new ApiError(500, "FIREBASE_SERVICE_ACCOUNT_JSON이 없어 계정을 삭제할 수 없습니다.");

    return Response.json({
      ok: true,
      uid,
      authDeleted: true,
      message: "사용자 계정과 로그인 정보를 완전히 삭제했습니다.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
