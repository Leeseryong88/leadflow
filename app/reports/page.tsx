import type { Metadata } from "next";
import { LeadFlowApp } from "../LeadFlowApp";

export const metadata: Metadata = {
  title: "Schedule | Leader Schedule",
  description: "IIC Weely",
};

export default function ReportsPage() {
  return <LeadFlowApp />;
}
