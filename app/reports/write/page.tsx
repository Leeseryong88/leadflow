import type { Metadata } from "next";
import { LeadFlowApp } from "../../LeadFlowApp";

export const metadata: Metadata = {
  title: "Schedule 작성 | Leader Schedule",
  description: "IIC Weely",
};

export default function WriteReportPage() {
  return <LeadFlowApp />;
}
