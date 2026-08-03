import "server-only";
import { listFirestoreDocuments } from "./firebase-server-rest";

export async function reportsBetween(token: string, from?: string, to?: string) {
  const reports = await listFirestoreDocuments<Array<Record<string, unknown> & { id: string }>[number]>("reports", token);
  return reports.filter((report) => {
    const submittedAt = typeof report.submittedAt === "string" ? report.submittedAt : "";
    return (!from || submittedAt >= `${from}T00:00:00`) && (!to || submittedAt <= `${to}T23:59:59.999`);
  });
}
