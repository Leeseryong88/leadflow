import type { Metadata } from "next";
import { LeadFlowApp } from "../LeadFlowApp";

export const metadata: Metadata = {
  title: "보고서 | LeadFlow",
  description: "IIC Weely",
};

export default function ReportsPage() {
  return <LeadFlowApp />;
}
