import { deleteFirestoreDocument, getServiceAccountAccessToken } from "@/lib/firebase-server-rest";
import { ApiError, errorResponse, requireAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!id) throw new ApiError(400, "삭제할 보고서를 지정해 주세요.");

    const token = (await getServiceAccountAccessToken()) || admin.token;
    await deleteFirestoreDocument(`reports/${id}`, token);
    return Response.json({ ok: true, id, message: "보고서를 삭제했습니다." });
  } catch (error) {
    return errorResponse(error);
  }
}
