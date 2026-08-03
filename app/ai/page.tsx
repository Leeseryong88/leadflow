import type { Metadata } from "next";
import { LeadFlowApp } from "../LeadFlowApp";

export const metadata: Metadata = {
  title: "LeadFlow AI | LeadFlow",
  description: "IIC Weely",
};

export default function AiPage() {
  return <LeadFlowApp />;
}
