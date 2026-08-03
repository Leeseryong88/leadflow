import type { Metadata } from "next";
import { LeadFlowApp } from "../../LeadFlowApp";

export const metadata: Metadata = {
  title: "보고서 작성 | LeadFlow",
  description: "IIC Weely",
};

export default function WriteReportPage() {
  return <LeadFlowApp />;
}
