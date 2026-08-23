"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, getUserProfile } from "@/lib/supabase/queries";
import AuthForm from "@/components/AuthForm";
import Dashboard from "@/components/Dashboard";

export default function HomePage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkAuth = async () => {
    try {
      const { user } = await getCurrentUser();

      if (!user) {
        return;
      }

      setIsAuthenticated(true);

      // Check if user has a profile
      const { data: profile, error } = await getUserProfile(user.id);

      if (error || !profile) {
        // Redirect to profile setup
        router.push("/profile/setup");
      } else {
        setHasProfile(true);
      }
    } catch (error) {
      console.error("[HomePage] Failed to check auth", error);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.12),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-4 py-10 dark:bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.18),_transparent_35%),linear-gradient(180deg,_#020617_0%,_#0f172a_100%)]">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl flex-col justify-center gap-8">
          <div className="max-w-2xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-indigo-600 dark:text-indigo-400">
              6steps
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-5xl">
              Big World made Small
            </h1>
          </div>
          <AuthForm />
        </div>
      </div>
    );
  }

  if (!hasProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Redirecting to profile setup...</div>
      </div>
    );
  }

  return <Dashboard />;
}
