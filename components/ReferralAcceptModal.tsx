"use client";

import { useState, useEffect } from "react";

type User = {
  id: string;
  username: string;
  name: string;
  preferred_name: string | null;
  profile_image_url: string | null;
};

type Referral = {
  id: string;
  context: string;
  referrer: User;
  candidate: User;
  opportunity_holder: User;
  other_party: User;
  role: "candidate" | "opportunity_holder";
};

type ReferralAcceptModalProps = {
  referral: Referral;
  onClose: () => void;
  onAccept: (message: string) => void;
  isSubmitting?: boolean;
  isEditMode?: boolean;
  initialMessage?: string;
};

export default function ReferralAcceptModal({
  referral,
  onClose,
  onAccept,
  isSubmitting,
  isEditMode,
  initialMessage,
}: ReferralAcceptModalProps) {
  const referrerName =
    referral.referrer.preferred_name || referral.referrer.name;
  const candidateName =
    referral.candidate.preferred_name || referral.candidate.name;
  const opportunityHolderName =
    referral.opportunity_holder.preferred_name ||
    referral.opportunity_holder.name;

  // Generate default intro message
  const defaultMessage = `Hi ${opportunityHolderName}! ${referrerName} thought we should connect.\n\nLooking forward to chatting!`;

  const [introMessage, setIntroMessage] = useState(
    isEditMode && initialMessage ? initialMessage : defaultMessage
  );

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, isSubmitting]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
      onClick={() => !isSubmitting && onClose()}
    >
      <div
        className="bg-white dark:bg-gray-900 w-full max-w-lg mx-4 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {isEditMode ? "Edit Greeting Message" : "Accept Referral"}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {isEditMode
              ? `Update your intro message for ${opportunityHolderName}`
              : `Write an intro message for ${opportunityHolderName}`}
          </p>
        </div>

        <div className="p-5 space-y-4">
          {/* Context reminder */}
          <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg border border-purple-200 dark:border-purple-700">
            <p className="text-sm text-purple-700 dark:text-purple-300">
              <span className="font-medium">{referrerName}</span> is introducing
              you to <span className="font-medium">{opportunityHolderName}</span>
            </p>
            <p className="text-sm text-purple-600 dark:text-purple-400 mt-1">
              Context: {referral.context}
            </p>
          </div>

          {/* Intro message editor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Your intro message
            </label>
            <textarea
              value={introMessage}
              onChange={(e) => setIntroMessage(e.target.value)}
              rows={5}
              disabled={isSubmitting}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none disabled:opacity-50"
              placeholder="Write a message to introduce yourself..."
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {isEditMode
                ? "You can edit this until the other party accepts"
                : "This will be sent as the first message when both parties accept"}
            </p>
          </div>
        </div>

        <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() => onAccept(introMessage)}
            disabled={isSubmitting || !introMessage.trim()}
            className="flex-1 px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isSubmitting
              ? isEditMode
                ? "Saving..."
                : "Accepting..."
              : isEditMode
                ? "Save Changes"
                : "Accept & Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
