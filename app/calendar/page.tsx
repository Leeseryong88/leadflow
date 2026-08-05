import type { Metadata } from "next";
import { LeadFlowApp } from "../LeadFlowApp";

export const metadata: Metadata = {
  title: "캘린더 | Leader Schedule",
  description: "IIC Weely",
};

export default function CalendarPage() {
  return <LeadFlowApp />;
}
