"use client";

import { useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/supabase/queries";

type User = {
  id: string;
  username: string;
  name: string;
  preferred_name: string | null;
  profile_image_url: string | null;
};

type Referral = {
  id: string;
  referrer_id: string;
  user1_id: string;
  user2_id: string;
  context: string;
  match_id: string;
  created_at: string;
  referrer: User;
  user1: User;
  user2: User;
  other_user: User;
};

type ReferralsListProps = {
  onReferralResponded?: () => void;
};

export default function ReferralsList({
  onReferralResponded,
}: ReferralsListProps) {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReferrals();
  }, []);

  async function loadReferrals() {
    const { user } = await getCurrentUser();
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(
        `/api/referrals?user_id=${encodeURIComponent(user.id)}`
      );
      const json = await res.json();

      if (!res.ok) {
        setError(json?.error || "Failed to load referrals");
        setLoading(false);
        return;
      }

      setReferrals(json.data || []);
      setLoading(false);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading referrals...</div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        Your Referrals
      </h2>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </div>
      )}

      {referrals.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No referrals yet
        </div>
      ) : (
        <div className="space-y-3">
          {referrals.map((referral) => {
            const referrerName =
              referral.referrer.preferred_name || referral.referrer.name;
            const otherName =
              referral.other_user.preferred_name || referral.other_user.name;

            return (
              <div
                key={referral.id}
                className="p-4 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50"
              >
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                  <span className="font-medium">{referrerName}</span> connected
                  you with <span className="font-medium">{otherName}</span>
                </p>

                <div className="text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-600">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Context:
                  </span>{" "}
                  {referral.context}
                </div>

                <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                  {new Date(referral.created_at).toLocaleDateString()}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
