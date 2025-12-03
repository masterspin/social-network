"use client";

import { useEffect, useState } from "react";
import {
  getCurrentUser,
  updateConnectionStatus,
  deleteConnection,
  updateConnectionRequestDetails,
  getFirstConnectionCount,
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

export default function Inbox() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [received, setReceived] = useState<ConnectionRow[]>([]);
  const [sent, setSent] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // UI state for amending
  const [editingSent, setEditingSent] = useState<string | null>(null); // connection id
  const [editingReceived, setEditingReceived] = useState<string | null>(null); // connection id
  const [formValues, setFormValues] = useState<
    Record<string, { description: string; year: string }>
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
        return;
      }
      const data = json?.data || { received: [], sent: [] };
      setReceived((data.received as ConnectionRow[]) || []);
      setSent((data.sent as ConnectionRow[]) || []);
    } catch (e) {
      setMessage({ type: "error", text: (e as Error).message });
      setReceived([]);
      setSent([]);
    }
  }

  function startEditSent(conn: ConnectionRow) {
    setEditingSent(conn.id);
    setFormValues((prev) => ({
      ...prev,
      [conn.id]: {
        description: stripYearFromHowMet(conn.how_met),
        year: parseYearFromHowMet(conn.how_met),
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
      },
    }));
  }

  function changeField(
    id: string,
    field: "description" | "year",
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
    const { error } = await updateConnectionRequestDetails(conn.id, {
      how_met: formatHowMet(vals.description, vals.year),
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
    // Atomically counter via server (swap requester/recipient or upsert reverse)
    try {
      const res = await fetch("/api/connections/counter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: conn.id,
          currentUserId,
          how_met: formatHowMet(vals.description, vals.year),
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
              {received.map((conn) => (
                <div
                  key={conn.id}
                  className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">
                        {conn.requester.preferred_name || conn.requester.name}
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
                </div>
              ))}
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
              {sent.map((conn) => (
                <div
                  key={conn.id}
                  className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">
                        {conn.recipient.preferred_name || conn.recipient.name}
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
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
