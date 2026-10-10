import type { Metadata } from "next";
import { HandsfreeDashboard } from "@/components/dashboard/dashboard";
import "./dashboard.css";

export const metadata: Metadata = {
  title: "Dashboard · Handsfree",
  description:
    "Set up Handsfree pointer, voice, gesture shortcuts, browser access, and local session controls.",
};

export default function DashboardPage() {
  return <HandsfreeDashboard />;
}
