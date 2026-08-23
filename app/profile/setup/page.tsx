"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, getUserProfile } from "@/lib/supabase/queries";
import ProfileSetup from "@/components/ProfileSetup";
type UserProfile = {
  id: string;
  name: string;
  preferred_name: string | null;
  gender: string | null;
  bio: string | null;
  profile_image_url: string | null;
};

export default function ProfileSetupPage() {
  const [loading, setLoading] = useState(true);
  const [existingProfile, setExistingProfile] = useState<UserProfile | null>(
    null
  );
  const [isEdit, setIsEdit] = useState(false);
  const router = useRouter();

  useEffect(() => {
    checkProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkProfile = async () => {
    const { user } = await getCurrentUser();

    if (!user) {
      router.push("/");
      return;
    }

    const { data: profile } = await getUserProfile(user.id);

    if (profile) {
      setExistingProfile(profile);
      setIsEdit(true);
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="text-xl text-gray-900 dark:text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <ProfileSetup
        existingProfile={existingProfile || undefined}
        isEdit={isEdit}
      />
    </div>
  );
}
