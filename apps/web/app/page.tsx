import { DashboardView } from "@/components/dashboard/DashboardView";
import { Suspense } from "react";
import { ProfileGate } from "@/components/auth/ProfileGate";

export default function Home() {
  return (
    <div className="h-full">
      <ProfileGate>
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-[400px] text-zinc-500 font-medium">
            Loading command center...
          </div>
        }>
          <DashboardView />
        </Suspense>
      </ProfileGate>
    </div>
  );
}
