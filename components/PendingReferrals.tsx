"use client";

import { useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/supabase/queries";
import ReferralAcceptModal from "./ReferralAcceptModal";

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
  candidate_id: string;
  opportunity_holder_id: string;
  context: string;
  candidate_message: string | null;
  candidate_accepted: boolean;
  opportunity_holder_accepted: boolean;
  status: string;
  created_at: string;
  referrer: User;
  candidate: User;
  opportunity_holder: User;
  role: "candidate" | "opportunity_holder";
  other_party: User;
  has_accepted: boolean;
  other_has_accepted: boolean;
};

type PendingReferralsProps = {
  onReferralResponded?: () => void;
};

export default function PendingReferrals({
  onReferralResponded,
}: PendingReferralsProps) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReferral, setSelectedReferral] = useState<Referral | null>(
    null
  );
  const [responding, setResponding] = useState<string | null>(null);
  const [editingReferral, setEditingReferral] = useState<Referral | null>(null);
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
        setMessage({
          type: "error",
          text: json?.error || "Failed to load referrals",
        });
        setLoading(false);
        return;
      }

      setReferrals(json.data || []);
      setLoading(false);
    } catch (e) {
      setMessage({ type: "error", text: (e as Error).message });
      setLoading(false);
    }
  }

  async function handleDecline(referralId: string) {
    if (!currentUserId || responding) return;

    setResponding(referralId);
    setMessage(null);

    try {
      const res = await fetch("/api/referrals/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referral_id: referralId,
          user_id: currentUserId,
          accept: false,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setMessage({
          type: "error",
          text: json?.error || "Failed to decline referral",
        });
        setResponding(null);
        return;
      }

      setMessage({ type: "success", text: "Referral declined" });
      setResponding(null);
      loadReferrals();
      onReferralResponded?.();
    } catch (e) {
      setMessage({ type: "error", text: (e as Error).message });
      setResponding(null);
    }
  }

  async function handleUpdateMessage(referralId: string, newMessage: string) {
    if (!currentUserId || responding) return;

    setResponding(referralId);
    setMessage(null);

    try {
      const res = await fetch("/api/referrals/update-message", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referral_id: referralId,
          user_id: currentUserId,
          message: newMessage,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setMessage({
          type: "error",
          text: json?.error || "Failed to update message",
        });
        setResponding(null);
        return;
      }

      setMessage({ type: "success", text: "Greeting message updated" });
      setResponding(null);
      setEditingReferral(null);
      loadReferrals();
    } catch (e) {
      setMessage({ type: "error", text: (e as Error).message });
      setResponding(null);
    }
  }

  async function handleAccept(
    referralId: string,
    introMessage?: string | null
  ) {
    if (!currentUserId || responding) return;

    setResponding(referralId);
    setMessage(null);

    try {
      const res = await fetch("/api/referrals/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referral_id: referralId,
          user_id: currentUserId,
          accept: true,
          message: introMessage,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setMessage({
          type: "error",
          text: json?.error || "Failed to accept referral",
        });
        setResponding(null);
        return;
      }

      if (json.status === "connected") {
        setMessage({
          type: "success",
          text: "Connection established! Check your Matches tab to chat.",
        });
      } else {
        setMessage({
          type: "success",
          text: "Accepted! Waiting for the other party to accept.",
        });
      }

      setResponding(null);
      setSelectedReferral(null);
      loadReferrals();
      onReferralResponded?.();
    } catch (e) {
      setMessage({ type: "error", text: (e as Error).message });
      setResponding(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading referrals...</div>
      </div>
    );
  }

  const pendingAction = referrals.filter((r) => !r.has_accepted);
  const waitingOnOther = referrals.filter(
    (r) => r.has_accepted && !r.other_has_accepted
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        Pending Referrals
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

      {referrals.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No pending referrals
        </div>
      ) : (
        <div className="space-y-6">
          {/* Referrals needing your action */}
          {pendingAction.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                Needs Your Response
              </h3>
              <div className="space-y-3">
                {pendingAction.map((referral) => (
                  <ReferralCard
                    key={referral.id}
                    referral={referral}
                    onAccept={() => {
                      if (referral.role === "candidate") {
                        // Open modal for candidate to edit intro message
                        setSelectedReferral(referral);
                      } else {
                        // Opportunity holder accepts directly
                        handleAccept(referral.id);
                      }
                    }}
                    onDecline={() => handleDecline(referral.id)}
                    isResponding={responding === referral.id}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Referrals waiting on other party */}
          {waitingOnOther.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                Waiting on Other Party
              </h3>
              <div className="space-y-3">
                {waitingOnOther.map((referral) => (
                  <ReferralCard
                    key={referral.id}
                    referral={referral}
                    isWaiting
                    canEditMessage={referral.role === "candidate"}
                    onEditMessage={() => setEditingReferral(referral)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal for candidate to edit intro message on accept */}
      {selectedReferral && (
        <ReferralAcceptModal
          referral={selectedReferral}
          onClose={() => setSelectedReferral(null)}
          onAccept={(message) => handleAccept(selectedReferral.id, message)}
          isSubmitting={responding === selectedReferral.id}
        />
      )}

      {/* Modal for candidate to edit greeting message while waiting */}
      {editingReferral && (
        <ReferralAcceptModal
          referral={editingReferral}
          onClose={() => setEditingReferral(null)}
          onAccept={(message) => handleUpdateMessage(editingReferral.id, message)}
          isSubmitting={responding === editingReferral.id}
          isEditMode
          initialMessage={editingReferral.candidate_message || ""}
        />
      )}
    </div>
  );
}

type ReferralCardProps = {
  referral: Referral;
  onAccept?: () => void;
  onDecline?: () => void;
  isResponding?: boolean;
  isWaiting?: boolean;
  canEditMessage?: boolean;
  onEditMessage?: () => void;
};

function ReferralCard({
  referral,
  onAccept,
  onDecline,
  isResponding,
  isWaiting,
  canEditMessage,
  onEditMessage,
}: ReferralCardProps) {
  const referrerName =
    referral.referrer.preferred_name || referral.referrer.name;
  const otherPartyName =
    referral.other_party.preferred_name || referral.other_party.name;

  return (
    <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                referral.role === "candidate"
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
              }`}
            >
              {referral.role === "candidate"
                ? "You're the Candidate"
                : "You have the Opportunity"}
            </span>
            {isWaiting && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
                Waiting...
              </span>
            )}
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
            <span className="font-medium">{referrerName}</span> wants to connect
            you with <span className="font-medium">{otherPartyName}</span>
          </p>

          <div className="text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-600">
            <span className="font-medium text-gray-700 dark:text-gray-300">
              Context:
            </span>{" "}
            {referral.context}
          </div>

          {/* Show greeting message for candidates who are waiting */}
          {isWaiting && canEditMessage && referral.candidate_message && (
            <div className="mt-3 text-sm text-gray-500 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded border border-blue-200 dark:border-blue-700">
              <span className="font-medium text-blue-700 dark:text-blue-300">
                Your greeting message:
              </span>
              <p className="mt-1 text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {referral.candidate_message}
              </p>
            </div>
          )}
        </div>

        {!isWaiting && onAccept && onDecline && (
          <div className="flex flex-col gap-2 flex-shrink-0">
            <button
              onClick={onAccept}
              disabled={isResponding}
              className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {isResponding ? "..." : "Accept"}
            </button>
            <button
              onClick={onDecline}
              disabled={isResponding}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {isResponding ? "..." : "Decline"}
            </button>
          </div>
        )}

        {/* Edit button for candidates waiting on opportunity holder */}
        {isWaiting && canEditMessage && onEditMessage && (
          <div className="flex flex-col gap-2 flex-shrink-0">
            <button
              onClick={onEditMessage}
              className="px-4 py-2 rounded-lg border border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-sm font-medium"
            >
              Edit Message
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
