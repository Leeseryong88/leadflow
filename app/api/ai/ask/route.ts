import { askGemini } from "@/lib/gemini";
import { reportsRecentMonths } from "@/lib/reports";
import { errorResponse, requireAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const { question, history = [] } = await request.json();
    if (typeof question !== "string" || !question.trim() || question.length > 1000) {
      return Response.json({ error: "질문을 1,000자 이내로 입력해 주세요." }, { status: 400 });
    }
    const { from, to, reports } = await reportsRecentMonths(admin.token, 3);
    const prompt = `당신은 Leader Schedule 사내 보고 조수입니다. 아래는 최근 3개월(${from} ~ ${to})에 제출된 Schedule 기록입니다. 이 기간의 기록에서만 답하세요. 기간 밖이거나 근거가 없으면 '최근 3개월 기록에서 확인할 수 없습니다'라고 명확히 말하세요. 날짜, 사람, 부서를 정확히 표기하고 간결한 한국어로 답하세요.\n조회기간:${from}~${to}\n이전 대화:${JSON.stringify(history)}\n질문:${question}\n보고:${JSON.stringify(reports)}`;
    return Response.json({ answer: await askGemini(prompt), from, to, reportCount: reports.length });
  } catch (error) {
    return errorResponse(error);
  }
}
