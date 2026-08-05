import "server-only";

export function sanitizeSummaryHtml(html: string) {
  return html
    .replace(/<\/(?:script|iframe|object|embed|link|meta|style)[^>]*>/gi, "")
    .replace(/<(?:script|iframe|object|embed|link|meta|style)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

export function buildSummaryPrompt(from: string, to: string, reports: unknown[], extraFocus = "") {
  const focus = extraFocus.trim();
  return `당신은 Leader Schedule의 CEO 주간 보고 에디터입니다.
기간 ${from} ~ ${to} 에 제출된 보고서를 바탕으로, 아래 섹션을 빠짐없이 전반적으로 요약한 HTML을 작성하세요.

필수 섹션:
1. Travel & Time Off (출장 및 휴가) — 기간, 이름, 부서, 목적지, 목적 포함
2. Key Dates & Events (부서의 주요 일정) — 날짜, 유형, 설명, 장소 포함
3. Key Issues & Asks (핵심 이슈·CEO 보고사항) — 카테고리, 상세, 마감 포함
4. CEO 요청사항 — 요청 주체(부서/이름)와 내용
5. Key Question — 질문 주체와 핵심 질문
6. 추가 요청사항 — 관리자가 입력한 추가 요약 요청을 반영한 내용 (맨 마지막 섹션)

작성 규칙:
- Overview / 개요 섹션은 절대 작성하지 말 것
- 사실을 추측하지 말고 보고 데이터에 있는 내용만 사용
- 중복은 합치되 부서·이름·날짜·장소·마감은 누락하지 말 것
- 한국어로 충분하고 읽기 쉽게 문장형 요약
- 해당 없는 섹션은 "해당 없음"으로 표시
- 반드시 아래 HTML 구조만 출력 (html/body 태그 없이 article 루트만)
- 섹션 06은 HTML 맨 마지막에 배치
${focus
    ? `- 관리자 추가 요청: """${focus}"""
- 섹션 06 "추가 요청사항"에서는 위 요청을 중심으로, 관련 보고 내용을 골라 요약할 것
- 요청과 직접 관련 없는 내용은 06에 넣지 말 것`
    : `- 관리자 추가 요청이 없으므로 섹션 06은 "<p>추가 요청 없음</p>"으로 작성`}

HTML 구조 예시:
<article class="ceo-brief">
  <header>
    <p class="eyebrow">Weekly Leadership Update</p>
    <h1>기간 요약 제목</h1>
    <p class="period">${from} — ${to}</p>
  </header>
  <section><h2>01 Travel & Time Off</h2><ul><li>...</li></ul></section>
  <section><h2>02 Key Dates & Events</h2><ul><li>...</li></ul></section>
  <section><h2>03 Key Issues & Asks</h2><ul><li>...</li></ul></section>
  <section><h2>04 CEO 요청사항</h2><ul><li>...</li></ul></section>
  <section><h2>05 Key Question</h2><ul><li>...</li></ul></section>
  <section class="extra-request"><h2>06 추가 요청사항</h2><p>...</p></section>
</article>

보고 데이터:
${JSON.stringify(reports)}`;
}

export const summaryHtmlSchema = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    html: { type: "STRING" },
  },
  required: ["title", "html"],
};
