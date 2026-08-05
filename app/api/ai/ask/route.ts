import { askGemini } from "@/lib/gemini";
import { reportsBetween } from "@/lib/reports";
import { errorResponse, requireAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const { question, history = [] } = await request.json();
    if (typeof question !== "string" || !question.trim() || question.length > 1000) return Response.json({ error: "질문을 1,000자 이내로 입력해 주세요." }, { status: 400 });
    const reports = await reportsBetween(admin.token);
    const prompt = `당신은 Leader Schedule 사내 보고 조수입니다. 제공된 보고 기록에서만 답하세요. 근거가 없으면 '기록된 보고에서 확인할 수 없습니다'라고 명확히 말하세요. 날짜, 사람, 부서를 정확히 표기하고 간결한 한국어로 답하세요.\n이전 대화:${JSON.stringify(history)}\n질문:${question}\n보고:${JSON.stringify(reports)}`;
    return Response.json({ answer: await askGemini(prompt) });
  } catch (error) { return errorResponse(error); }
}
