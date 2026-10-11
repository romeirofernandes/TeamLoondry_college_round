import type { Metadata } from "next";
import { BenchmarkDashboard } from "@/components/benchmark-dashboard";
import "./benchmark.css";

export const metadata: Metadata = {
  title: "Benchmark & Performance · Handsfree",
  description: "Preliminary benchmark results for Handsfree voice-controlled browsing.",
};

export default function BenchmarkPage() {
  return <BenchmarkDashboard />;
}
