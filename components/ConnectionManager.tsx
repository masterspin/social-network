"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getPendingConnectionRequests,
  updateConnectionStatus,
  getCurrentUser,
} from "@/lib/supabase/queries";
// Side panel is now rendered at the Dashboard level; this component notifies parent to open it.

type OpenUserHandler = (user: {
  id: string;
  username: string;
  name: string;
  preferred_name: string | null;
  profile_image_url: string | null;
}) => void;

interface Props {
  onOpenUser?: OpenUserHandler;
}

type UserSearchResult = {
  id: string;
  username: string;
  name: string;
  preferred_name: string | null;
  profile_image_url: string | null;
  mutualCount?: number;
};

interface PendingRequest {
  id: string;
  how_met: string;
  status: string | null;
  requester: {
    id: string;
    name: string;
    preferred_name: string | null;
    profile_image_url: string | null;
  };
  recipient: {
    id: string;
    name: string;
    preferred_name: string | null;
    profile_image_url: string | null;
  };
  met_through: {
    id: string;
    username: string;
    name: string;
    preferred_name: string | null;
  } | null;
}

// connection types handled in the side panel

// (dev note) mock list removed now that server API search is wired

export default function ConnectionManager({ onOpenUser }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // selection is tracked by parent; keep local for potential highlight if needed
  // keep minimal local state only if needed later; currently unused
  // const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  // Deprecated inline send-request fields, moved to side panel
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    loadCurrentUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced search effect
  useEffect(() => {
    if (!searchQuery.trim() || !currentUserId) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(() => {
      handleSearch();
    }, 300); // Wait 300ms after user stops typing

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, currentUserId]);

  const loadCurrentUser = async () => {
    const { user } = await getCurrentUser();
    if (user) {
      setCurrentUserId(user.id);
      loadPendingRequests(user.id);
    }
  };

  const loadPendingRequests = async (userId: string) => {
    const { data } = await getPendingConnectionRequests(userId);
    if (data) setPendingRequests(data);
  };

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !currentUserId) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const url = `/api/search?q=${encodeURIComponent(
        searchQuery
      )}&requesterId=${encodeURIComponent(currentUserId)}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) {
        console.error("Search API error:", json?.error || json);
        setMessage({
          type: "error",
          text: `Search failed: ${json?.error?.message || res.statusText}`,
        });
        setSearchResults([]);
      } else {
        setSearchResults(json.data || []);
      }
    } catch (e) {
      console.error(e);
      setMessage({ type: "error", text: (e as Error).message });
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, currentUserId]);

  // send request now handled in UserProfileSidePanel

  const handleAcceptRequest = async (requestId: string) => {
    setLoading(true);
    const { error } = await updateConnectionStatus(requestId, "accepted");

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Connection accepted!" });
      if (currentUserId) loadPendingRequests(currentUserId);
    }
    setLoading(false);
  };

  const handleRejectRequest = async (requestId: string) => {
    setLoading(true);
    const { error } = await updateConnectionStatus(requestId, "rejected");

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Connection rejected." });
      if (currentUserId) loadPendingRequests(currentUserId);
    }
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6 relative">
      <h2 className="text-3xl font-bold">Manage Connections</h2>

      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === "success"
              ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200"
              : "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold mb-4">
            Pending Requests ({pendingRequests.length})
          </h3>
          <div className="space-y-3">
            {pendingRequests.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded"
              >
                <div>
                  <p className="font-medium">
                    {request.requester.preferred_name || request.requester.name}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Connection type: {request.how_met}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAcceptRequest(request.id)}
                    disabled={loading}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleRejectRequest(request.id)}
                    disabled={loading}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search Users */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h3 className="text-xl font-semibold mb-4">Find People</h3>

        <div className="mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or username..."
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
          />
          {searching && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Searching...
            </p>
          )}
        </div>

        {!searching && searchQuery.trim() && searchResults.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
            No users found matching &quot;{searchQuery}&quot;
          </p>
        )}

        {searchResults.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Found {searchResults.length} result
              {searchResults.length !== 1 ? "s" : ""}
            </p>
            {searchResults.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                onClick={() => {
                  onOpenUser?.({
                    id: user.id,
                    username: user.username,
                    name: user.name,
                    preferred_name: user.preferred_name,
                    profile_image_url: user.profile_image_url,
                  });
                }}
              >
                <div>
                  <p className="font-medium">
                    {user.preferred_name || user.name}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    @{user.username}
                  </p>
                  {user.mutualCount !== undefined && user.mutualCount > 0 && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      {user.mutualCount} mutual connection
                      {user.mutualCount !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
                <button className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded">
                  View
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {false}
    </div>
  );
}
