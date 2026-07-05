import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import StartForm from "./StartForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Get your Rating — Clawdacademy",
  description: "Claim a handle and see your AI-collaboration Fluency Rating in minutes. No email, no password.",
};

export default async function StartPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  return <StartForm />;
}
