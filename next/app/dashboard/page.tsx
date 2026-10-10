import type { Metadata } from "next";
import { HandsfreeDashboard } from "@/components/dashboard/dashboard";
import "./dashboard.css";

export const metadata: Metadata = {
  title: "Dashboard · Handsfree",
  description:
    "Set up your Handsfree pointer, voice, browser access, and local session controls.",
};

export default function DashboardPage() {
  return <HandsfreeDashboard />;
}
