import { redirect } from "next/navigation";

export default function OnboardingPage() {
  redirect("/settings/profile?onboarding=1");
}
