"use client";

import { useCallback, useEffect, useState } from "react";
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
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { Inbox as InboxIcon } from "lucide-react";

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

type InboxProps = {
  onOpenProfile?: (userId: string) => void;
};

export default function Inbox({ onOpenProfile }: InboxProps = {}) {
  const { toast } = useToast();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [received, setReceived] = useState<ConnectionRow[]>([]);
  const [sent, setSent] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state for amending
  const [editingSent, setEditingSent] = useState<string | null>(null);
  const [editingReceived, setEditingReceived] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<
    Record<string, { description: string; year: string; connectionType: "first" | "one_point_five" }>
  >({});

  const refresh = useCallback(async (userId: string) => {
    try {
      const res = await fetch(`/api/inbox?userId=${encodeURIComponent(userId)}`);
      const json = await res.json();
      if (!res.ok) {
        toast(json?.error?.message || "Failed to load inbox", "error");
        setReceived([]);
        setSent([]);
        return;
      }
      const data = json?.data || { received: [], sent: [], upgradeRequests: [] };

      const upgradeRequestsReceived = (data.upgradeRequests as ConnectionRow[] || []).filter(
        (conn: ConnectionRow) => conn.upgrade_requested_by !== userId
      );
      const upgradeRequestsSent = (data.upgradeRequests as ConnectionRow[] || []).filter(
        (conn: ConnectionRow) => conn.upgrade_requested_by === userId
      );

      setReceived([...(data.received as ConnectionRow[] || []), ...upgradeRequestsReceived]);
      setSent([...(data.sent as ConnectionRow[] || []), ...upgradeRequestsSent]);
    } catch (e) {
      toast((e as Error).message, "error");
      setReceived([]);
      setSent([]);
    }
  }, [toast]);

  useEffect(() => {
    (async () => {
      const { user } = await getCurrentUser();
      if (!user) { setLoading(false); return; }
      setCurrentUserId(user.id);
      await refresh(user.id);
      setLoading(false);
    })();
  }, [refresh]);

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
    setFormValues((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function saveAmendSent(conn: ConnectionRow) {
    const vals = formValues[conn.id];
    if (!vals) return;
    if (vals.year && !/^\d{4}$/.test(vals.year)) {
      toast("Year must be a 4-digit number.", "error");
      return;
    }
    if (conn.connection_type === "one_point_five" && vals.connectionType === "first" && currentUserId) {
      const { count, error: countError } = await getFirstConnectionCount(currentUserId);
      if (countError) { toast("Failed to check connection limit. Please try again.", "error"); return; }
      if (count >= 100) { toast("You have reached the limit of 100 first connections.", "error"); return; }
    }
    const { error } = await updateConnectionRequestDetails(conn.id, {
      how_met: formatHowMet(vals.description, vals.year),
      connection_type: vals.connectionType,
    });
    if (error) { toast(error.message, "error"); return; }
    setEditingSent(null);
    if (currentUserId) await refresh(currentUserId);
    toast("Request updated.");
  }

  async function cancelSent(conn: ConnectionRow) {
    const { error } = await deleteConnection(conn.id);
    if (error) { toast(error.message, "error"); return; }
    if (currentUserId) await refresh(currentUserId);
    toast("Request deleted.");
  }

  async function acceptReceived(conn: ConnectionRow) {
    if (conn.connection_type === "first" && currentUserId) {
      const { count, error: countError } = await getFirstConnectionCount(currentUserId);
      if (countError) { toast("Failed to check connection limit. Please try again.", "error"); return; }
      if (count >= 100) { toast("You have reached the limit of 100 first connections.", "error"); return; }
    }
    const { error } = await updateConnectionStatus(conn.id, "accepted");
    if (error) { toast(error.message, "error"); return; }
    if (currentUserId) await refresh(currentUserId);
    toast("Connection accepted.");
  }

  async function rejectReceived(conn: ConnectionRow) {
    const { error } = await updateConnectionStatus(conn.id, "rejected");
    if (error) { toast(error.message, "error"); return; }
    if (currentUserId) await refresh(currentUserId);
    toast("Connection rejected.");
  }

  async function amendReceived(conn: ConnectionRow) {
    const vals = formValues[conn.id];
    if (!vals || !currentUserId) return;
    if (vals.year && !/^\d{4}$/.test(vals.year)) {
      toast("Year must be a 4-digit number.", "error");
      return;
    }
    if (conn.connection_type === "one_point_five" && vals.connectionType === "first") {
      const { count, error: countError } = await getFirstConnectionCount(currentUserId);
      if (countError) { toast("Failed to check connection limit. Please try again.", "error"); return; }
      if (count >= 100) { toast("You have reached the limit of 100 first connections.", "error"); return; }
    }
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
      if (!res.ok) { toast(j?.error?.message || "Failed to amend", "error"); return; }
    } catch (e) {
      toast((e as Error).message, "error");
      return;
    }
    setEditingReceived(null);
    await refresh(currentUserId);
    toast("Counter request sent.");
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Received Requests */}
        <Card>
          <h3 className="text-sm font-semibold mb-4">
            Received Requests{received.length > 0 && (
              <span className="ml-1.5 text-gray-500 font-normal">({received.length})</span>
            )}
          </h3>
          {received.length === 0 ? (
            <EmptyState
              icon={InboxIcon}
              title="All clear"
              description="No pending connection requests"
            />
          ) : (
            <div className="space-y-3">
              {received.map((conn) => {
                const isUpgradeRequest = conn.status === "accepted" && conn.upgrade_requested_type;
                const otherUser = conn.requester_id === currentUserId ? conn.recipient : conn.requester;

                return (
                  <div
                    key={conn.id}
                    className={`p-4 rounded-lg border ${
                      isUpgradeRequest
                        ? "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800"
                        : "bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700"
                    }`}
                  >
                    {isUpgradeRequest ? (
                      <div className="flex items-start gap-3">
                        <Avatar size="sm" name={otherUser.name} imageUrl={otherUser.profile_image_url} className="flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <button
                            className="font-medium text-sm hover:underline text-left"
                            onClick={() => onOpenProfile?.(otherUser.id)}
                          >
                            {otherUser.preferred_name || otherUser.name}
                          </button>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                            Wants to upgrade to 1st connection
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Current: {conn.connection_type === "first" ? "1st" : "1.5"} connection
                          </p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={async () => {
                              const { error } = await acceptConnectionTypeUpgrade(conn.id);
                              if (error) toast(error.message, "error");
                              else { toast("Upgrade accepted!"); if (currentUserId) await refresh(currentUserId); }
                            }}
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={async () => {
                              const { error } = await rejectConnectionTypeUpgrade(conn.id);
                              if (error) toast(error.message, "error");
                              else { toast("Upgrade declined"); if (currentUserId) await refresh(currentUserId); }
                            }}
                          >
                            Decline
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start gap-3">
                          <Avatar size="sm" name={conn.requester.name} imageUrl={conn.requester.profile_image_url} className="flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                className="font-medium text-sm hover:underline text-left"
                                onClick={() => onOpenProfile?.(conn.requester.id)}
                              >
                                {conn.requester.preferred_name || conn.requester.name}
                              </button>
                              <Badge variant={conn.connection_type === "first" ? "first" : "onePointFive"} />
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {stripYearFromHowMet(conn.how_met)}
                              {parseYearFromHowMet(conn.how_met) ? ` · ${parseYearFromHowMet(conn.how_met)}` : ""}
                            </p>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            <Button size="sm" variant="primary" onClick={() => acceptReceived(conn)}>
                              Accept
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => rejectReceived(conn)}>
                              Reject
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => startEditReceived(conn)}>
                              Amend
                            </Button>
                          </div>
                        </div>

                        {editingReceived === conn.id && (
                          <div className="mt-4 space-y-3 pl-11">
                            <Select
                              label="Connection Type"
                              value={formValues[conn.id]?.connectionType || "first"}
                              onChange={(e) => changeField(conn.id, "connectionType", e.target.value)}
                            >
                              <option value="first">1st Connection</option>
                              <option value="one_point_five">1.5 Connection</option>
                            </Select>
                            <Input
                              label="Connection Description"
                              value={formValues[conn.id]?.description || ""}
                              onChange={(e) => changeField(conn.id, "description", e.target.value)}
                              placeholder="How you met and relationship"
                            />
                            <Input
                              label="Year (optional)"
                              value={formValues[conn.id]?.year || ""}
                              onChange={(e) => changeField(conn.id, "year", e.target.value)}
                              placeholder="e.g., 2023"
                            />
                            <div className="flex gap-2">
                              <Button size="sm" variant="primary" onClick={() => amendReceived(conn)}>
                                Send Amended
                              </Button>
                              <Button size="sm" variant="secondary" onClick={() => setEditingReceived(null)}>
                                Cancel
                              </Button>
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
        </Card>

        {/* Sent Requests */}
        <Card>
          <h3 className="text-sm font-semibold mb-4">
            Sent Requests{sent.length > 0 && (
              <span className="ml-1.5 text-gray-500 font-normal">({sent.length})</span>
            )}
          </h3>
          {sent.length === 0 ? (
            <EmptyState
              icon={InboxIcon}
              title="Nothing sent"
              description="No outgoing connection requests"
            />
          ) : (
            <div className="space-y-3">
              {sent.map((conn) => {
                const isUpgradeRequest = conn.status === "accepted" && conn.upgrade_requested_type;
                const otherUser = conn.requester_id === currentUserId ? conn.recipient : conn.requester;

                return (
                  <div
                    key={conn.id}
                    className={`p-4 rounded-lg border ${
                      isUpgradeRequest
                        ? "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800"
                        : "bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700"
                    }`}
                  >
                    {isUpgradeRequest ? (
                      <div className="flex items-start gap-3">
                        <Avatar size="sm" name={otherUser.name} imageUrl={otherUser.profile_image_url} className="flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <button
                            className="font-medium text-sm hover:underline text-left"
                            onClick={() => onOpenProfile?.(otherUser.id)}
                          >
                            {otherUser.preferred_name || otherUser.name}
                          </button>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                            Upgrade to 1st connection requested
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">Waiting for approval...</p>
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={async () => {
                            const { error } = await cancelConnectionTypeUpgradeRequest(conn.id);
                            if (error) toast(error.message, "error");
                            else { toast("Upgrade request cancelled"); if (currentUserId) await refresh(currentUserId); }
                          }}
                        >
                          Cancel Request
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start gap-3">
                          <Avatar size="sm" name={conn.recipient.name} imageUrl={conn.recipient.profile_image_url} className="flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                className="font-medium text-sm hover:underline text-left"
                                onClick={() => onOpenProfile?.(conn.recipient.id)}
                              >
                                {conn.recipient.preferred_name || conn.recipient.name}
                              </button>
                              <Badge variant={conn.connection_type === "first" ? "first" : "onePointFive"} />
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {stripYearFromHowMet(conn.how_met)}
                              {parseYearFromHowMet(conn.how_met) ? ` · ${parseYearFromHowMet(conn.how_met)}` : ""}
                            </p>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            <Button size="sm" variant="ghost" onClick={() => startEditSent(conn)}>
                              Amend
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => cancelSent(conn)}>
                              Delete
                            </Button>
                          </div>
                        </div>

                        {editingSent === conn.id && (
                          <div className="mt-4 space-y-3 pl-11">
                            <Select
                              label="Connection Type"
                              value={formValues[conn.id]?.connectionType || "first"}
                              onChange={(e) => changeField(conn.id, "connectionType", e.target.value)}
                            >
                              <option value="first">1st Connection</option>
                              <option value="one_point_five">1.5 Connection</option>
                            </Select>
                            <Input
                              label="Connection Description"
                              value={formValues[conn.id]?.description || ""}
                              onChange={(e) => changeField(conn.id, "description", e.target.value)}
                              placeholder="How you met and relationship"
                            />
                            <Input
                              label="Year (optional)"
                              value={formValues[conn.id]?.year || ""}
                              onChange={(e) => changeField(conn.id, "year", e.target.value)}
                              placeholder="e.g., 2023"
                            />
                            <div className="flex gap-2">
                              <Button size="sm" variant="primary" onClick={() => saveAmendSent(conn)}>
                                Save
                              </Button>
                              <Button size="sm" variant="secondary" onClick={() => setEditingSent(null)}>
                                Cancel
                              </Button>
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
        </Card>
      </div>
    </div>
  );
}
