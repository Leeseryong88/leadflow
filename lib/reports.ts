import "server-only";
import { listFirestoreDocuments } from "./firebase-server-rest";

function toDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

/** 오늘 기준 최근 N개월의 시작일(YYYY-MM-DD). */
export function monthsAgoDateKey(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return toDateKey(date);
}

export async function reportsBetween(token: string, from?: string, to?: string) {
  const reports = await listFirestoreDocuments<Array<Record<string, unknown> & { id: string }>[number]>("reports", token);
  return reports.filter((report) => {
    const submittedAt = typeof report.submittedAt === "string" ? report.submittedAt : "";
    return (!from || submittedAt >= `${from}T00:00:00`) && (!to || submittedAt <= `${to}T23:59:59.999`);
  });
}

/** Leader Schedule AI 질문용: 최근 3개월 제출분. */
export async function reportsRecentMonths(token: string, months = 3) {
  const to = toDateKey(new Date());
  const from = monthsAgoDateKey(months);
  return { from, to, reports: await reportsBetween(token, from, to) };
}
