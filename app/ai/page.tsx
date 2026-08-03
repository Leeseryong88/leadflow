import type { Metadata } from "next";
import { LeadFlowApp } from "../LeadFlowApp";

export const metadata: Metadata = {
  title: "LeadFlow AI | LeadFlow",
  description: "사내 주간 보고",
};

export default function AiPage() {
  return <LeadFlowApp />;
}
