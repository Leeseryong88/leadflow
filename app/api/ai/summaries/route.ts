import { createFirestoreDocument, deleteFirestoreDocument, getServiceAccountAccessToken, listFirestoreDocuments } from "@/lib/firebase-server-rest";
import { ApiError, errorResponse, requireAdmin } from "@/lib/server-auth";
import { sanitizeSummaryHtml } from "@/lib/summary-html";

export const runtime = "nodejs";

type SavedSummary = {
  id: string;
  title: string;
  from: string;
  to: string;
  html: string;
  createdAt: string;
  createdBy: string;
};

async function adminStoreToken(fallback: string) {
  return (await getServiceAccountAccessToken()) || fallback;
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const token = await adminStoreToken(admin.token);
    const items = await listFirestoreDocuments<SavedSummary>("summaries", token);
    const sorted = items
      .map((item) => ({
        id: item.id,
        title: item.title,
        from: item.from,
        to: item.to,
        html: item.html,
        createdAt: item.createdAt,
        createdBy: item.createdBy,
      }))
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    return Response.json({ items: sorted });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();
    const { title, from, to, html } = body;
    if (![title, from, to, html].every((value) => typeof value === "string" && value.trim())) {
      throw new ApiError(400, "저장할 요약 내용이 올바르지 않습니다.");
    }
    if (from > to) throw new ApiError(400, "올바른 기간을 선택해 주세요.");

    const id = crypto.randomUUID();
    const doc: SavedSummary = {
      id,
      title: title.trim().slice(0, 160),
      from,
      to,
      html: sanitizeSummaryHtml(html),
      createdAt: new Date().toISOString(),
      createdBy: admin.uid,
    };
    const token = await adminStoreToken(admin.token);
    await createFirestoreDocument("summaries", id, doc, token);
    return Response.json({ item: doc }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!id) throw new ApiError(400, "삭제할 요약을 지정해 주세요.");
    const token = await adminStoreToken(admin.token);
    await deleteFirestoreDocument(`summaries/${id}`, token);
    return Response.json({ ok: true, id, message: "저장된 요약을 삭제했습니다." });
  } catch (error) {
    return errorResponse(error);
  }
}
