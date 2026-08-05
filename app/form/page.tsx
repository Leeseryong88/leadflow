import type { Metadata } from "next";
import { LeadFlowApp } from "../LeadFlowApp";

export const metadata: Metadata = {
  title: "양식 만들기 | Leader Schedule",
  description: "IIC Weely",
};

export default function FormBuilderRoute() {
  return <LeadFlowApp />;
}
