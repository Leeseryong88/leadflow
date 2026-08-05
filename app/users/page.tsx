import type { Metadata } from "next";
import { LeadFlowApp } from "../LeadFlowApp";

export const metadata: Metadata = {
  title: "사용자 관리 | Leader Schedule",
  description: "IIC Weely",
};

export default function UsersPage() {
  return <LeadFlowApp />;
}
