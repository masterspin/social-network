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
    const { user } = await getCurrentUser();

    if (!user) {
      setLoading(false);
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

    setLoading(false);
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
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-6xl w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-4">Social Network Graph</h1>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              Connect with people and visualize your network
            </p>
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