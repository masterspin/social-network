"use client";

import { useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/supabase/queries";
import Chat from "./Chat";

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
  match_id: string | null;
  created_at: string;
  referrer: User;
  user1: User;
  user2: User;
  other_user: User;
};

export default function ReferralsList() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedReferral, setSelectedReferral] = useState<Referral | null>(
    null
  );
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    loadReferrals();
  }, []);

  async function loadReferrals() {
    const { user } = await getCurrentUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setCurrentUserId(user.id);

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

      setReferrals((json.data || []).filter((r: Referral) => r.match_id));
      setLoading(false);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  async function deleteChat(referral: Referral) {
    if (!currentUserId) return;

    const confirmDelete = window.confirm(
      "Are you sure you want to delete this chat? This action cannot be undone."
    );

    if (!confirmDelete) return;

    try {
      // Delete the match
      const res = await fetch("/api/match/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: referral.match_id,
          user_id: currentUserId,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setMessage({
          type: "error",
          text: json?.error || "Failed to delete chat",
        });
        return;
      }

      // Delete the referral row
      const refRes = await fetch("/api/referrals", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referral_id: referral.id,
          user_id: currentUserId,
        }),
      });

      if (!refRes.ok) {
        const refJson = await refRes.json();
        setMessage({
          type: "error",
          text: refJson?.error || "Chat deleted but failed to remove referral",
        });
        return;
      }

      setMessage({ type: "success", text: "Chat deleted successfully" });
      setSelectedReferral(null);
      await loadReferrals();
    } catch (e) {
      setMessage({ type: "error", text: (e as Error).message });
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

      {message && (
        <div
          className={`mb-4 p-3 rounded ${
            message.type === "success"
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

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
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                      <span className="font-medium">{referrerName}</span>{" "}
                      connected you with{" "}
                      <span className="font-medium">{otherName}</span>
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

                  <div className="flex gap-2 ml-4 shrink-0">
                    <button
                      onClick={() => setSelectedReferral(referral)}
                      className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                    >
                      Open Chat
                    </button>
                    <button
                      onClick={() => deleteChat(referral)}
                      className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedReferral && selectedReferral.match_id && currentUserId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setSelectedReferral(null)}
        >
          <div
            className="relative w-full max-w-3xl h-[600px] mx-4"
            onClick={(event) => event.stopPropagation()}
          >
            <Chat
              matchId={selectedReferral.match_id}
              currentUserId={currentUserId}
              otherUser={selectedReferral.other_user}
              onClose={() => setSelectedReferral(null)}
              onDelete={() => deleteChat(selectedReferral)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
