"use client";

import { useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/supabase/queries";
import Chat from "./Chat";

type Match = {
  id: string;
  matchmaker: {
    id: string;
    username: string;
    name: string;
    preferred_name: string | null;
    profile_image_url: string | null;
  };
  other_user: {
    id: string;
    username: string;
    name: string;
    preferred_name: string | null;
    profile_image_url: string | null;
  };
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
};

type MatchesListProps = {
  onClose?: () => void;
};

export default function MatchesList({ onClose }: MatchesListProps) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    async function loadMatches() {
      const { user } = await getCurrentUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setCurrentUserId(user.id);
      await fetchMatches(user.id);
    }

    loadMatches();
  }, []);

  async function fetchMatches(userId: string) {
    try {
      const res = await fetch(
        `/api/match?user_id=${encodeURIComponent(userId)}`
      );
      const json = await res.json();

      if (!res.ok) {
        setMessage({
          type: "error",
          text: json?.error || "Failed to load matches",
        });
        setLoading(false);
        return;
      }

      setMatches(json.data || []);
      setLoading(false);
    } catch (e) {
      setMessage({ type: "error", text: (e as Error).message });
      setLoading(false);
    }
  }

  async function deleteChat(matchId: string) {
    if (!currentUserId) return;

    const confirmDelete = window.confirm(
      "Are you sure you want to delete this chat? This action cannot be undone."
    );

    if (!confirmDelete) return;

    try {
      const res = await fetch("/api/match/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: matchId,
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

      setMessage({ type: "success", text: "Chat deleted successfully" });
      setSelectedMatch(null);
      await fetchMatches(currentUserId);
    } catch (e) {
      setMessage({ type: "error", text: (e as Error).message });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading matches...</div>
      </div>
    );
  }

  // If a match is selected, show the chat
  if (selectedMatch && currentUserId) {
    return (
      <div className="h-[600px]">
        <Chat
          matchId={selectedMatch.id}
          currentUserId={currentUserId}
          otherUser={selectedMatch.other_user}
          onClose={() => setSelectedMatch(null)}
          onDelete={() => deleteChat(selectedMatch.id)}
        />
      </div>
    );
  }

  // Otherwise show the list of matches
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Your Matches
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            ✕
          </button>
        )}
      </div>

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

      {matches.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No matches yet. You'll see matches here when someone matches you with
          one of your connections.
        </div>
      ) : (
        <div className="space-y-3">
          {matches.map((match) => (
            <div
              key={match.id}
              className={`p-4 rounded-lg border ${
                match.is_active
                  ? "bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600"
                  : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 opacity-60"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {match.other_user.profile_image_url ? (
                    <img
                      src={match.other_user.profile_image_url}
                      alt={
                        match.other_user.preferred_name || match.other_user.name
                      }
                      className="w-12 h-12 rounded-full"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold">
                      {(
                        match.other_user.preferred_name || match.other_user.name
                      )
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-gray-100">
                      {match.other_user.preferred_name || match.other_user.name}
                    </div>
                    <div className="text-sm text-gray-500">
                      @{match.other_user.username}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Matched by{" "}
                      {match.matchmaker.preferred_name || match.matchmaker.name}{" "}
                      • {new Date(match.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  {match.is_active ? (
                    <>
                      <button
                        onClick={() => setSelectedMatch(match)}
                        className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                      >
                        Open Chat
                      </button>
                      <button
                        onClick={() => deleteChat(match.id)}
                        className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </>
                  ) : (
                    <div className="px-4 py-2 rounded bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300">
                      Chat Deleted
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
