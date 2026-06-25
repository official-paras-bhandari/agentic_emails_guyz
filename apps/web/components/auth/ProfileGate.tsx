"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function ProfileGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get("workspaceId");

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const url = workspaceId ? `/api/user/profile?workspaceId=${encodeURIComponent(workspaceId)}` : "/api/user/profile";
      const res = await fetch(url);
      if (cancelled) return;
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) return;
      const profile = await res.json();
      const incomplete = !profile?.name || !profile?.email || !profile?.jobTitle || !profile?.companyName || !profile?.homeCountry;
      if (incomplete) {
        router.replace("/onboarding");
      }
    };

    run().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [router, workspaceId]);

  return children;
}
