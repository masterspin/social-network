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

type MatchMakerProps = {
  onClose?: () => void;
  onMatchCreated?: () => void;
};

export default function MatchMaker({
  onClose,
  onMatchCreated,
}: MatchMakerProps) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [connections, setConnections] = useState<User[]>([]);
  const [selectedUser1, setSelectedUser1] = useState<string>("");
  const [selectedUser2, setSelectedUser2] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    async function loadConnections() {
      const { user } = await getCurrentUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setCurrentUserId(user.id);

      try {
        const res = await fetch(
          `/api/connections/accepted?userId=${encodeURIComponent(user.id)}`
        );
        const json = await res.json();

        if (!res.ok) {
          setMessage({
            type: "error",
            text: json?.error?.message || "Failed to load connections",
          });
          setLoading(false);
          return;
        }

        // Filter only first connections and extract the user objects
        const firstConnections = (json.data || [])
          .filter((conn: any) => conn.connection_type === "first")
          .map((conn: any) => conn.other_user)
          .filter((user: any) => user !== null);
        setConnections(firstConnections);
        setLoading(false);
      } catch (e) {
        setMessage({ type: "error", text: (e as Error).message });
        setLoading(false);
      }
    }

    loadConnections();
  }, []);

  async function createMatch(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUserId || !selectedUser1 || !selectedUser2 || creating) return;

    if (selectedUser1 === selectedUser2) {
      setMessage({
        type: "error",
        text: "Please select two different people",
      });
      return;
    }

    setCreating(true);
    setMessage(null);

    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchmaker_id: currentUserId,
          user1_id: selectedUser1,
          user2_id: selectedUser2,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setMessage({
          type: "error",
          text: json?.error || "Failed to create match",
        });
        setCreating(false);
        return;
      }

      setMessage({ type: "success", text: "Match created successfully!" });
      setSelectedUser1("");
      setSelectedUser2("");
      setCreating(false);

      if (onMatchCreated) {
        setTimeout(() => onMatchCreated(), 1500);
      }
    } catch (e) {
      setMessage({ type: "error", text: (e as Error).message });
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading connections...</div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Create a Match
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

      {connections.length < 2 ? (
        <div className="text-center py-8 text-gray-500">
          You need at least 2 first connections to create a match.
        </div>
      ) : (
        <form onSubmit={createMatch} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select first person
            </label>
            <select
              value={selectedUser1}
              onChange={(e) => setSelectedUser1(e.target.value)}
              required
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="">Choose a connection...</option>
              {connections.map((conn) => (
                <option key={conn.id} value={conn.id}>
                  {conn.preferred_name || conn.name} (@{conn.username})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select second person
            </label>
            <select
              value={selectedUser2}
              onChange={(e) => setSelectedUser2(e.target.value)}
              required
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="">Choose a connection...</option>
              {connections
                .filter((conn) => conn.id !== selectedUser1)
                .map((conn) => (
                  <option key={conn.id} value={conn.id}>
                    {conn.preferred_name || conn.name} (@{conn.username})
                  </option>
                ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating || !selectedUser1 || !selectedUser2}
              className="flex-1 px-6 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? "Creating..." : "Create Match"}
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
