import type { Metadata } from "next";
import { LeadFlowApp } from "../LeadFlowApp";

export const metadata: Metadata = {
  title: "Leader Schedule AI | Leader Schedule",
  description: "IIC Weely",
};

export default function AiPage() {
  return <LeadFlowApp />;
}
