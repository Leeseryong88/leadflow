import type { Metadata } from "next";
import { LeadFlowApp } from "../LeadFlowApp";

export const metadata: Metadata = {
  title: "데이터 취합 | Leader Schedule",
  description: "IIC Weely",
};

export default function CollectPage() {
  return <LeadFlowApp />;
}
