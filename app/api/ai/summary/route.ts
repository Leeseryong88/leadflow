import { askGemini } from "@/lib/gemini";
import { reportsBetween } from "@/lib/reports";
import { errorResponse, requireAdmin } from "@/lib/server-auth";
import { buildSummaryPrompt, sanitizeSummaryHtml, summaryHtmlSchema } from "@/lib/summary-html";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const { from, to, extraFocus = "" } = await request.json();
    if (!from || !to || from > to) return Response.json({ error: "올바른 기간을 선택해 주세요." }, { status: 400 });
    if (typeof extraFocus !== "string" || extraFocus.length > 2000) {
      return Response.json({ error: "추가 요청사항은 2,000자 이내로 입력해 주세요." }, { status: 400 });
    }

    const reports = await reportsBetween(admin.token, from, to);
    const focus = extraFocus.trim();
    const focusHtml = (focus || "추가 요청 없음")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>");
    if (!reports.length) {
      return Response.json({
        title: `${from} — ${to} 요약`,
        from,
        to,
        extraFocus: focus,
        html: sanitizeSummaryHtml(`<article class="ceo-brief"><header><p class="eyebrow">Weekly Leadership Update</p><h1>제출된 Schedule 없음</h1><p class="period">${from} — ${to}</p></header><section><p>선택한 기간에 제출된 Schedule이 없습니다.</p></section><section class="extra-request"><h2>06 추가 요청사항</h2><p>${focusHtml}</p></section></article>`),
        empty: true,
      });
    }

    const raw = JSON.parse(await askGemini(buildSummaryPrompt(from, to, reports, focus), summaryHtmlSchema)) as { title?: string; html?: string };
    let html = sanitizeSummaryHtml(typeof raw.html === "string" ? raw.html : "");
    html = html.replace(/<section[^>]*class=["']?overview["']?[^>]*>[\s\S]*?<\/section>/gi, "");
    html = html.replace(/<h2[^>]*>\s*Overview\s*<\/h2>[\s\S]*?(?=<section|<h2|<\/article>)/gi, "");

    if (!html.includes("ceo-brief") && !html.includes("<section")) {
      return Response.json({ error: "요약 HTML을 생성하지 못했습니다. 다시 시도해 주세요." }, { status: 502 });
    }

    return Response.json({
      title: (raw.title || `${from} — ${to} CEO 보고 요약`).trim(),
      from,
      to,
      extraFocus: focus,
      html,
      empty: false,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
