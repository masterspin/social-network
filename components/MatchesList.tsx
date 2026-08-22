"use client";

import { useCallback, useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/supabase/queries";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { Heart, Plus } from "lucide-react";
import Chat from "./Chat";
import MatchMaker from "./MatchMaker";

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

export default function MatchesList() {
  const { toast } = useToast();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [showMatchMakerModal, setShowMatchMakerModal] = useState(false);

  const fetchMatches = useCallback(async (userId: string) => {
    try {
      const res = await fetch(`/api/match?user_id=${encodeURIComponent(userId)}`);
      const json = await res.json();
      if (!res.ok) {
        toast(json?.error || "Failed to load matches", "error");
        setLoading(false);
        return;
      }
      setMatches(json.data || []);
      setLoading(false);
    } catch (e) {
      toast((e as Error).message, "error");
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    async function loadMatches() {
      const { user } = await getCurrentUser();
      if (!user) { setLoading(false); return; }
      setCurrentUserId(user.id);
      await fetchMatches(user.id);
    }
    loadMatches();
  }, [fetchMatches]);

  async function deleteChat(matchId: string) {
    if (!currentUserId) return;
    if (!window.confirm("Are you sure you want to delete this chat? This action cannot be undone.")) return;
    try {
      const res = await fetch("/api/match/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: matchId, user_id: currentUserId }),
      });
      const json = await res.json();
      if (!res.ok) { toast(json?.error || "Failed to delete chat", "error"); return; }
      toast("Chat deleted");
      setSelectedMatch(null);
      if (currentUserId) await fetchMatches(currentUserId);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <div className="flex flex-1 min-h-0 bg-white dark:bg-gray-900">
      {/* Left panel — match list */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-800">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Matches</h2>
          <Button variant="primary" size="sm" onClick={() => setShowMatchMakerModal(true)}>
            <Plus className="w-3.5 h-3.5" />
            New
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="md" />
            </div>
          ) : matches.length === 0 ? (
            <EmptyState
              icon={Heart}
              title="No matches yet"
              description="Create a match to connect two friends"
            />
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {matches.map((match) => (
                <button
                  key={match.id}
                  onClick={() => setSelectedMatch(match)}
                  className={[
                    "w-full text-left px-4 py-3 transition-colors",
                    selectedMatch?.id === match.id
                      ? "bg-indigo-50 dark:bg-indigo-900/20"
                      : "hover:bg-gray-50 dark:hover:bg-gray-800",
                    !match.is_active ? "opacity-50" : "",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      size="sm"
                      name={match.other_user.preferred_name || match.other_user.name}
                      imageUrl={match.other_user.profile_image_url}
                      className="flex-shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {match.other_user.preferred_name || match.other_user.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        via {match.matchmaker.preferred_name || match.matchmaker.name}
                      </p>
                    </div>
                    {!match.is_active && (
                      <span className="text-[10px] text-red-400 flex-shrink-0">Deleted</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right panel — chat or empty state */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-50 dark:bg-gray-950">
        {selectedMatch && currentUserId ? (
          <Chat
            matchId={selectedMatch.id}
            currentUserId={currentUserId}
            otherUser={selectedMatch.other_user}
            onClose={() => setSelectedMatch(null)}
            onDelete={() => deleteChat(selectedMatch.id)}
            className="flex flex-col h-full bg-white dark:bg-gray-900"
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={Heart}
              title="Select a match"
              description="Choose a match from the list to open the chat"
            />
          </div>
        )}
      </div>

      {/* Create Match Modal */}
      <Modal
        open={showMatchMakerModal}
        onClose={() => setShowMatchMakerModal(false)}
        title="Create a Match"
      >
        <div className="p-5">
          <MatchMaker
            onClose={() => setShowMatchMakerModal(false)}
            onMatchCreated={() => {
              setShowMatchMakerModal(false);
              if (currentUserId) fetchMatches(currentUserId);
            }}
          />
        </div>
      </Modal>
    </div>
  );
}
