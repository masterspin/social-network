"use client";

import { useEffect, useState } from "react";
import {
  getCurrentUser,
  updateConnectionStatus,
  deleteConnection,
  updateConnectionRequestDetails,
  getFirstConnectionCount,
  acceptConnectionTypeUpgrade,
  rejectConnectionTypeUpgrade,
  cancelConnectionTypeUpgradeRequest,
} from "@/lib/supabase/queries";

import type { Database } from "@/types/supabase";

type ConnectionRow = Database["public"]["Tables"]["connections"]["Row"] & {
  requester: {
    id: string;
    name: string;
    preferred_name: string | null;
    profile_image_url: string | null;
    username?: string;
  };
  recipient: {
    id: string;
    name: string;
    preferred_name: string | null;
    profile_image_url: string | null;
    username?: string;
  };
  met_through: {
    id: string;
    username: string;
    name: string;
    preferred_name: string | null;
  } | null;
};

// Encode optional year inside how_met: "description (Year: YYYY)"
function formatHowMet(description: string, year?: string) {
  const base = (description || "").trim();
  const y = (year || "").trim();
  if (y && /^\d{4}$/.test(y)) return `${base} (Year: ${y})`;
  return base;
}

function parseYearFromHowMet(how_met: string | null | undefined): string {
  if (!how_met) return "";
  const m = how_met.match(/\(\s*Year:\s*(\d{4})\s*\)\s*$/i);
  return m ? m[1] : "";
}

function stripYearFromHowMet(how_met: string | null | undefined): string {
  if (!how_met) return "";
  return how_met.replace(/\s*\(\s*Year:\s*\d{4}\s*\)\s*$/i, "").trim();
}

// UI now uses a free-form description and optional year instead of type + label

type InboxProps = {
  onOpenProfile?: (userId: string) => void;
};

export default function Inbox({ onOpenProfile }: InboxProps = {}) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [received, setReceived] = useState<ConnectionRow[]>([]);
  const [sent, setSent] = useState<ConnectionRow[]>([]);
  const [upgradeRequests, setUpgradeRequests] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // UI state for amending
  const [editingSent, setEditingSent] = useState<string | null>(null); // connection id
  const [editingReceived, setEditingReceived] = useState<string | null>(null); // connection id
  const [formValues, setFormValues] = useState<
    Record<string, { description: string; year: string; connectionType: "first" | "one_point_five" }>
  >({});

  useEffect(() => {
    (async () => {
      const { user } = await getCurrentUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setCurrentUserId(user.id);
      await refresh(user.id);
      setLoading(false);
    })();
  }, []);

  async function refresh(userId: string) {
    try {
      const res = await fetch(
        `/api/inbox?userId=${encodeURIComponent(userId)}`
      );
      const json = await res.json();
      if (!res.ok) {
        setMessage({
          type: "error",
          text: json?.error?.message || "Failed to load inbox",
        });
        setReceived([]);
        setSent([]);
        setUpgradeRequests([]);
        return;
      }
      const data = json?.data || { received: [], sent: [], upgradeRequests: [] };
      
      // Separate upgrade requests into those I need to respond to vs those I sent
      const upgradeRequestsReceived = (data.upgradeRequests as ConnectionRow[] || []).filter(
        (conn: ConnectionRow) => conn.upgrade_requested_by !== userId
      );
      const upgradeRequestsSent = (data.upgradeRequests as ConnectionRow[] || []).filter(
        (conn: ConnectionRow) => conn.upgrade_requested_by === userId
      );
      
      // Merge upgrade requests into received (those are for me to respond to)
      const allReceived = [
        ...(data.received as ConnectionRow[] || []),
        ...upgradeRequestsReceived
      ];
      
      // Merge upgrade requests I sent into sent
      const allSent = [
        ...(data.sent as ConnectionRow[] || []),
        ...upgradeRequestsSent
      ];
      
      setReceived(allReceived);
      setSent(allSent);
      setUpgradeRequests([]);
    } catch (e) {
      setMessage({ type: "error", text: (e as Error).message });
      setReceived([]);
      setSent([]);
      setUpgradeRequests([]);
    }
  }

  function startEditSent(conn: ConnectionRow) {
    setEditingSent(conn.id);
    setFormValues((prev) => ({
      ...prev,
      [conn.id]: {
        description: stripYearFromHowMet(conn.how_met),
        year: parseYearFromHowMet(conn.how_met),
        connectionType: (conn.connection_type || "first") as "first" | "one_point_five",
      },
    }));
  }

  function startEditReceived(conn: ConnectionRow) {
    setEditingReceived(conn.id);
    setFormValues((prev) => ({
      ...prev,
      [conn.id]: {
        description: stripYearFromHowMet(conn.how_met),
        year: parseYearFromHowMet(conn.how_met),
        connectionType: (conn.connection_type || "first") as "first" | "one_point_five",
      },
    }));
  }

  function changeField(
    id: string,
    field: "description" | "year" | "connectionType",
    value: string
  ) {
    setFormValues((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  }

  async function saveAmendSent(conn: ConnectionRow) {
    const vals = formValues[conn.id];
    if (!vals) return;
    // Year validation (optional field)
    if (vals.year && !/^\d{4}$/.test(vals.year)) {
      setMessage({ type: "error", text: "Year must be a 4-digit number." });
      return;
    }

    // Check if upgrading to first connection and if user has reached limit
    if (conn.connection_type === "one_point_five" && vals.connectionType === "first" && currentUserId) {
      const { count, error: countError } = await getFirstConnectionCount(currentUserId);
      if (countError) {
        setMessage({ type: "error", text: "Failed to check connection limit. Please try again." });
        return;
      }
      if (count >= 100) {
        setMessage({ type: "error", text: "You cannot change to 1st connection. You have reached the limit of 100 first connections." });
        return;
      }
    }

    const { error } = await updateConnectionRequestDetails(conn.id, {
      how_met: formatHowMet(vals.description, vals.year),
      connection_type: vals.connectionType,
    });
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }
    setEditingSent(null);
    if (currentUserId) await refresh(currentUserId);
    setMessage({ type: "success", text: "Request updated." });
  }

  async function cancelSent(conn: ConnectionRow) {
    const { error } = await deleteConnection(conn.id);
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }
    if (currentUserId) await refresh(currentUserId);
    setMessage({ type: "success", text: "Request deleted." });
  }

  async function acceptReceived(conn: ConnectionRow) {
    // Check if user has reached the 100 first connection limit when accepting a first connection request
    if (conn.connection_type === "first" && currentUserId) {
      const { count, error: countError } = await getFirstConnectionCount(currentUserId);
      if (countError) {
        setMessage({ type: "error", text: "Failed to check connection limit. Please try again." });
        return;
      }
      if (count >= 100) {
        setMessage({ type: "error", text: "You cannot accept this first connection request. You have reached the limit of 100 first connections." });
        return;
      }
    }
    
    const { error } = await updateConnectionStatus(conn.id, "accepted");
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }
    if (currentUserId) await refresh(currentUserId);
    setMessage({ type: "success", text: "Connection accepted." });
  }

  async function rejectReceived(conn: ConnectionRow) {
    const { error } = await updateConnectionStatus(conn.id, "rejected");
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }
    if (currentUserId) await refresh(currentUserId);
    setMessage({ type: "success", text: "Connection rejected." });
  }

  async function amendReceived(conn: ConnectionRow) {
    const vals = formValues[conn.id];
    if (!vals || !currentUserId) return;
    if (vals.year && !/^\d{4}$/.test(vals.year)) {
      setMessage({ type: "error", text: "Year must be a 4-digit number." });
      return;
    }

    // Check if upgrading to first connection and if user has reached limit
    if (conn.connection_type === "one_point_five" && vals.connectionType === "first") {
      const { count, error: countError } = await getFirstConnectionCount(currentUserId);
      if (countError) {
        setMessage({ type: "error", text: "Failed to check connection limit. Please try again." });
        return;
      }
      if (count >= 100) {
        setMessage({ type: "error", text: "You cannot change to 1st connection. You have reached the limit of 100 first connections." });
        return;
      }
    }

    // Atomically counter via server (swap requester/recipient or upsert reverse)
    try {
      const res = await fetch("/api/connections/counter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: conn.id,
          currentUserId,
          how_met: formatHowMet(vals.description, vals.year),
          connection_type: vals.connectionType,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setMessage({
          type: "error",
          text: j?.error?.message || "Failed to amend",
        });
        return;
      }
    } catch (e) {
      setMessage({ type: "error", text: (e as Error).message });
      return;
    }
    setEditingReceived(null);
    await refresh(currentUserId);
    setMessage({ type: "success", text: "Counter request sent." });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading inbox…</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Received Requests */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-bold mb-4">
            Received Requests ({received.length})
          </h3>
          {received.length === 0 ? (
            <p className="text-sm text-gray-500">No pending requests.</p>
          ) : (
            <div className="space-y-3">
              {received.map((conn) => {
                const isUpgradeRequest = conn.status === 'accepted' && conn.upgrade_requested_type;
                const otherUser = conn.requester_id === currentUserId ? conn.recipient : conn.requester;
                
                return (
                  <div
                    key={conn.id}
                    className={`p-4 rounded-lg border ${
                      isUpgradeRequest 
                        ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700'
                        : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
                    }`}
                  >
                    {isUpgradeRequest ? (
                      // Upgrade Request UI
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div
                            className="font-semibold cursor-pointer hover:underline"
                            onClick={() => onOpenProfile?.(otherUser.id)}
                          >
                            {otherUser.preferred_name || otherUser.name}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            Wants to upgrade to 1st connection
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            Current: {conn.connection_type === 'first' ? '1st' : '1.5'} connection
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              const { error } = await acceptConnectionTypeUpgrade(conn.id);
                              if (error) {
                                setMessage({ type: "error", text: error.message });
                              } else {
                                setMessage({ type: "success", text: "Upgrade accepted!" });
                                if (currentUserId) await refresh(currentUserId);
                              }
                            }}
                            className="px-3 py-1 rounded bg-green-600 text-white text-sm hover:bg-green-700"
                          >
                            Accept
                          </button>
                          <button
                            onClick={async () => {
                              const { error } = await rejectConnectionTypeUpgrade(conn.id);
                              if (error) {
                                setMessage({ type: "error", text: error.message });
                              } else {
                                setMessage({ type: "success", text: "Upgrade declined" });
                                if (currentUserId) await refresh(currentUserId);
                              }
                            }}
                            className="px-3 py-1 rounded bg-red-600 text-white text-sm hover:bg-red-700"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ) : (
                      // Regular Connection Request UI
                      <>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <div
                                className="font-semibold cursor-pointer hover:underline"
                                onClick={() => onOpenProfile?.(conn.requester.id)}
                              >
                                {conn.requester.preferred_name || conn.requester.name}
                              </div>
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                  conn.connection_type === "first"
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                    : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                                }`}
                              >
                                {conn.connection_type === "first" ? "1st" : "1.5"}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500">
                              {stripYearFromHowMet(conn.how_met)}
                              {parseYearFromHowMet(conn.how_met)
                                ? ` • ${parseYearFromHowMet(conn.how_met)}`
                                : ""}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => acceptReceived(conn)}
                              className="px-3 py-1 text-sm rounded bg-green-600 text-white hover:bg-green-700"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => rejectReceived(conn)}
                              className="px-3 py-1 text-sm rounded bg-red-600 text-white hover:bg-red-700"
                            >
                              Reject
                            </button>
                            <button
                              onClick={() => startEditReceived(conn)}
                              className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
                            >
                              Amend
                            </button>
                          </div>
                        </div>

                        {editingReceived === conn.id && (
                          <div className="mt-3 space-y-3">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">
                                Connection Type
                              </label>
                              <select
                                className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                                value={formValues[conn.id]?.connectionType || "first"}
                                onChange={(e) =>
                                  changeField(conn.id, "connectionType", e.target.value)
                                }
                              >
                                <option value="first">1st Connection</option>
                                <option value="one_point_five">
                                  1.5 Connection
                                </option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">
                                Connection Description
                              </label>
                              <input
                                className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                                value={formValues[conn.id]?.description || ""}
                                onChange={(e) =>
                                  changeField(conn.id, "description", e.target.value)
                                }
                                placeholder="How you met and relationship"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">
                                Year (optional)
                              </label>
                              <input
                                className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                                value={formValues[conn.id]?.year || ""}
                                onChange={(e) =>
                                  changeField(conn.id, "year", e.target.value)
                                }
                                placeholder="e.g., 2023"
                              />
                            </div>
                            {null}
                            <div className="flex gap-2">
                              <button
                                onClick={() => amendReceived(conn)}
                                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                              >
                                Send Amended
                              </button>
                              <button
                                onClick={() => setEditingReceived(null)}
                                className="px-4 py-2 rounded bg-gray-500 text-white hover:bg-gray-600"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sent Requests */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-bold mb-4">
            Sent Requests ({sent.length})
          </h3>
          {sent.length === 0 ? (
            <p className="text-sm text-gray-500">No sent requests.</p>
          ) : (
            <div className="space-y-3">
              {sent.map((conn) => {
                const isUpgradeRequest = conn.status === 'accepted' && conn.upgrade_requested_type;
                const otherUser = conn.requester_id === currentUserId ? conn.recipient : conn.requester;
                
                return (
                  <div
                    key={conn.id}
                    className={`p-4 rounded-lg border ${
                      isUpgradeRequest 
                        ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700'
                        : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
                    }`}
                  >
                    {isUpgradeRequest ? (
                      // Upgrade Request UI (Sent by me)
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div
                            className="font-semibold cursor-pointer hover:underline"
                            onClick={() => onOpenProfile?.(otherUser.id)}
                          >
                            {otherUser.preferred_name || otherUser.name}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            Upgrade to 1st connection requested
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            Waiting for approval...
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            const { error } = await cancelConnectionTypeUpgradeRequest(conn.id);
                            if (error) {
                              setMessage({ type: "error", text: error.message });
                            } else {
                              setMessage({ type: "success", text: "Upgrade request cancelled" });
                              if (currentUserId) await refresh(currentUserId);
                            }
                          }}
                          className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          Cancel Request
                        </button>
                      </div>
                    ) : (
                      // Regular Connection Request UI
                      <>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <div
                                className="font-semibold cursor-pointer hover:underline"
                                onClick={() => onOpenProfile?.(conn.recipient.id)}
                              >
                                {conn.recipient.preferred_name || conn.recipient.name}
                              </div>
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                  conn.connection_type === "first"
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                    : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                                }`}
                              >
                                {conn.connection_type === "first" ? "1st" : "1.5"}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500">
                              {stripYearFromHowMet(conn.how_met)}
                              {parseYearFromHowMet(conn.how_met)
                                ? ` • ${parseYearFromHowMet(conn.how_met)}`
                                : ""}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => startEditSent(conn)}
                              className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
                            >
                              Amend
                            </button>
                            <button
                              onClick={() => cancelSent(conn)}
                              className="px-3 py-1 text-sm rounded bg-gray-600 text-white hover:bg-gray-700"
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        {editingSent === conn.id && (
                          <div className="mt-3 space-y-3">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">
                                Connection Type
                              </label>
                              <select
                                className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                                value={formValues[conn.id]?.connectionType || "first"}
                                onChange={(e) =>
                                  changeField(conn.id, "connectionType", e.target.value)
                                }
                              >
                                <option value="first">1st Connection</option>
                                <option value="one_point_five">
                                  1.5 Connection
                                </option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">
                                Connection Description
                              </label>
                              <input
                                className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                                value={formValues[conn.id]?.description || ""}
                                onChange={(e) =>
                                  changeField(conn.id, "description", e.target.value)
                                }
                                placeholder="How you met and relationship"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">
                                Year (optional)
                              </label>
                              <input
                                className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                                value={formValues[conn.id]?.year || ""}
                                onChange={(e) =>
                                  changeField(conn.id, "year", e.target.value)
                                }
                                placeholder="e.g., 2023"
                              />
                            </div>
                            {null}
                            <div className="flex gap-2">
                              <button
                                onClick={() => saveAmendSent(conn)}
                                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingSent(null)}
                                className="px-4 py-2 rounded bg-gray-500 text-white hover:bg-gray-600"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
