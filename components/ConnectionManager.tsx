"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getPendingConnectionRequests,
  updateConnectionStatus,
  getCurrentUser,
} from "@/lib/supabase/queries";
import { Avatar } from "@/components/ui/Avatar";

type OpenUserHandler = (user: {
  id: string;
  name: string;
  preferred_name: string | null;
  profile_image_url: string | null;
}) => void;

interface Props {
  onOpenUser?: OpenUserHandler;
  searchQuery: string;
}

type UserSearchResult = {
  id: string;
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
}

export default function ConnectionManager({
  onOpenUser,
  searchQuery,
}: Props) {
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
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
    if (data) setPendingRequests(data as PendingRequest[]);
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
      setMessage({ type: "error", text: (error as Error).message });
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
      setMessage({ type: "error", text: (error as Error).message });
    } else {
      setMessage({ type: "success", text: "Connection rejected." });
      if (currentUserId) loadPendingRequests(currentUserId);
    }
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto px-5 py-4 space-y-5 relative">
      {message && (
        <div
          className={`rounded-md px-3 py-2 text-sm ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200"
              : "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {pendingRequests.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Pending requests ({pendingRequests.length})
          </h3>
          <div className="divide-y divide-gray-100 rounded-md border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
            {pendingRequests.map((request) => (
              <div
                key={request.id}
                className="flex items-center gap-3 px-3 py-3"
              >
                <Avatar
                  size="sm"
                  name={request.requester.preferred_name || request.requester.name}
                  imageUrl={request.requester.profile_image_url}
                />
                <button
                  type="button"
                  onClick={() =>
                    onOpenUser?.({
                      id: request.requester.id,
                      name: request.requester.name,
                      preferred_name: request.requester.preferred_name,
                      profile_image_url: request.requester.profile_image_url,
                    })
                  }
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {request.requester.preferred_name || request.requester.name}
                  </p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {request.how_met || "Connection request"}
                  </p>
                </button>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => handleAcceptRequest(request.id)}
                    disabled={loading}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRejectRequest(request.id)}
                    disabled={loading}
                    className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {(searching || searchQuery.trim() || searchResults.length > 0) && (
        <section>
          {searching && (
            <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              Searching...
            </p>
          )}

          {!searching && searchQuery.trim() && searchResults.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              No users found matching &quot;{searchQuery}&quot;
            </p>
          )}

          {searchResults.length > 0 && (
            <>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Found {searchResults.length} result
                {searchResults.length !== 1 ? "s" : ""}
              </p>
              <div className="divide-y divide-gray-100 rounded-md border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
                {searchResults.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-gray-50 dark:hover:bg-gray-800"
                    onClick={() => {
                      onOpenUser?.({
                        id: user.id,
                        name: user.name,
                        preferred_name: user.preferred_name,
                        profile_image_url: user.profile_image_url,
                      });
                    }}
                  >
                    <Avatar
                      size="sm"
                      name={user.preferred_name || user.name}
                      imageUrl={user.profile_image_url}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        {user.preferred_name || user.name}
                      </span>
                      {user.mutualCount !== undefined && user.mutualCount > 0 && (
                        <span className="mt-0.5 block text-xs text-indigo-600 dark:text-indigo-400">
                          {user.mutualCount} mutual connection
                          {user.mutualCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      View
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
