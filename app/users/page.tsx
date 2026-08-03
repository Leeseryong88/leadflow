import type { Metadata } from "next";
import { LeadFlowApp } from "../LeadFlowApp";

export const metadata: Metadata = {
  title: "사용자 관리 | LeadFlow",
  description: "사내 주간 보고",
};

export default function UsersPage() {
  return <LeadFlowApp />;
}
