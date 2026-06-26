"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2, UserRound, Building2, Globe2, Mail, BriefcaseBusiness } from "lucide-react";

type Profile = {
  name: string | null;
  email: string | null;
  jobTitle: string | null;
  companyName: string | null;
  homeCountry: string | null;
};

const emptyProfile: Profile = {
  name: "",
  email: "",
  jobTitle: "",
  companyName: "",
  homeCountry: "",
};

function ProfileSettingsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const workspaceId = searchParams.get("workspaceId");
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const url = workspaceId ? `/api/user/profile?workspaceId=${encodeURIComponent(workspaceId)}` : "/api/user/profile";
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to load profile");
        const data = await res.json();
        setProfile({
          name: data.name ?? "",
          email: data.email ?? "",
          jobTitle: data.jobTitle ?? "",
          companyName: data.companyName ?? "",
          homeCountry: data.homeCountry ?? "",
        });
      } catch (err: any) {
        setError(err.message || "Unable to load profile");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [workspaceId]);

  const title = useMemo(() => "Profile & Onboarding", []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...profile, workspaceId }),
      });
      if (!res.ok) throw new Error("Failed to save profile");
      const data = await res.json();
      setProfile({
        name: data.name ?? "",
        email: data.email ?? "",
        jobTitle: data.jobTitle ?? "",
        companyName: data.companyName ?? "",
        homeCountry: data.homeCountry ?? "",
      });
      setSaved(true);
      if (!searchParams.get("onboarding")) {
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || "Unable to save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-10 max-w-3xl mx-auto space-y-8 animate-spring-up">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/25">
          <UserRound className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight premium-gradient-text">{title}</h1>
          <p className="text-sm text-zinc-500 font-medium">Store the defaults used to personalize chat and country selection.</p>
        </div>
      </div>

      <form onSubmit={save} className="glass-card rounded-2xl border border-zinc-800 bg-zinc-900/10 p-8 space-y-6">
        {loading ? (
          <div className="text-sm text-zinc-500">Loading profile...</div>
        ) : (
          <>
            <Field icon={<UserRound className="h-4 w-4" />} label="Name" value={profile.name || ""} onChange={(name) => setProfile((p) => ({ ...p, name }))} placeholder="Your full name" />
            <Field icon={<Mail className="h-4 w-4" />} label="Email" value={profile.email || ""} onChange={(email) => setProfile((p) => ({ ...p, email }))} placeholder="name@company.com" />
            <Field icon={<BriefcaseBusiness className="h-4 w-4" />} label="Job title" value={profile.jobTitle || ""} onChange={(jobTitle) => setProfile((p) => ({ ...p, jobTitle }))} placeholder="Founder, Sales, Marketing..." />
            <Field icon={<Building2 className="h-4 w-4" />} label="Company name" value={profile.companyName || ""} onChange={(companyName) => setProfile((p) => ({ ...p, companyName }))} placeholder="Acme Pty Ltd" />
            <Field icon={<Globe2 className="h-4 w-4" />} label="Home country" value={profile.homeCountry || ""} onChange={(homeCountry) => setProfile((p) => ({ ...p, homeCountry }))} placeholder="Australia, Nepal, United States..." />
          </>
        )}

        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        {saved ? (
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Saved.
          </div>
        ) : null}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => router.back()} className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-300 text-sm">
            Back
          </button>
          <button disabled={saving} className="px-4 py-2 rounded-xl bg-emerald-500 text-black font-semibold text-sm disabled:opacity-60">
            {saving ? "Saving..." : "Save profile"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function ProfileSettingsPage() {
  return (
    <Suspense fallback={
      <div className="p-10 max-w-3xl mx-auto space-y-4 animate-pulse">
        <div className="h-8 w-56 bg-zinc-900 rounded-lg" />
        <div className="h-4 w-96 bg-zinc-900 rounded-lg" />
        <div className="h-[420px] bg-zinc-900 rounded-2xl mt-8" />
      </div>
    }>
      <ProfileSettingsPageContent />
    </Suspense>
  );
}

function Field({
  icon,
  label,
  value,
  onChange,
  placeholder,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500 font-semibold">
        {icon}
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-emerald-500"
      />
    </label>
  );
}
