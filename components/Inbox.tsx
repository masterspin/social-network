"use client";

import { useCallback, useEffect, useState } from "react";
import {
  deleteConnection,
  getCurrentUser,
  updateConnectionStatus,
} from "@/lib/api/queries";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { Inbox as InboxIcon } from "lucide-react";
import type { ConnectionRow as BaseConnectionRow } from "@/types/db";

type ConnectionUser = {
  id: string;
  name: string;
  preferred_name: string | null;
  profile_image_url: string | null;
};

type ConnectionRow = BaseConnectionRow & {
  requester: ConnectionUser;
  recipient: ConnectionUser;
};

type InboxProps = {
  onChanged?: () => void;
  onOpenProfile?: (userId: string) => void;
  refreshNonce?: number;
};

export default function Inbox({
  onChanged,
  onOpenProfile,
  refreshNonce = 0,
}: InboxProps = {}) {
  const { toast } = useToast();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [received, setReceived] = useState<ConnectionRow[]>([]);
  const [sent, setSent] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(
    async (userId: string) => {
      try {
        const res = await fetch(
          `/api/inbox?userId=${encodeURIComponent(userId)}`,
        );
        const json = await res.json();
        if (!res.ok) {
          toast(json?.error?.message || "Failed to load inbox", "error");
          setReceived([]);
          setSent([]);
          return;
        }
        setReceived((json?.data?.received as ConnectionRow[]) || []);
        setSent((json?.data?.sent as ConnectionRow[]) || []);
      } catch (e) {
        toast((e as Error).message, "error");
        setReceived([]);
        setSent([]);
      }
    },
    [toast],
  );

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
  }, [refresh]);

  useEffect(() => {
    if (!currentUserId) return;
    void refresh(currentUserId);
  }, [currentUserId, refresh, refreshNonce]);

  async function cancelSent(conn: ConnectionRow) {
    const { error } = await deleteConnection(conn.id);
    if (error) {
      toast((error as Error).message, "error");
      return;
    }
    if (currentUserId) await refresh(currentUserId);
    onChanged?.();
    toast("Request deleted.");
  }

  async function acceptReceived(conn: ConnectionRow) {
    const { error } = await updateConnectionStatus(conn.id, "accepted");
    if (error) {
      toast((error as Error).message, "error");
      return;
    }
    if (currentUserId) await refresh(currentUserId);
    onChanged?.();
    onOpenProfile?.(conn.requester.id);
    toast("Connection accepted.");
  }

  async function rejectReceived(conn: ConnectionRow) {
    const { error } = await updateConnectionStatus(conn.id, "rejected");
    if (error) {
      toast((error as Error).message, "error");
      return;
    }
    if (currentUserId) await refresh(currentUserId);
    onChanged?.();
    toast("Connection rejected.");
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-semibold">
            Received Requests
            {received.length > 0 && (
              <span className="ml-1.5 font-normal text-gray-500">
                ({received.length})
              </span>
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
              {received.map((conn) => (
                <div
                  key={conn.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800/50"
                >
                  <div className="flex items-start gap-3">
                    <Avatar
                      size="sm"
                      name={conn.requester.name}
                      imageUrl={conn.requester.profile_image_url}
                      className="mt-0.5 flex-shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <button
                        className="text-left text-sm font-medium hover:underline"
                        onClick={() => onOpenProfile?.(conn.requester.id)}
                      >
                        {conn.requester.preferred_name || conn.requester.name}
                      </button>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        Sent you a request
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => acceptReceived(conn)}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => rejectReceived(conn)}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-semibold">
            Sent Requests
            {sent.length > 0 && (
              <span className="ml-1.5 font-normal text-gray-500">
                ({sent.length})
              </span>
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
              {sent.map((conn) => (
                <div
                  key={conn.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800/50"
                >
                  <div className="flex items-start gap-3">
                    <Avatar
                      size="sm"
                      name={conn.recipient.name}
                      imageUrl={conn.recipient.profile_image_url}
                      className="mt-0.5 flex-shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <button
                        className="text-left text-sm font-medium hover:underline"
                        onClick={() => onOpenProfile?.(conn.recipient.id)}
                      >
                        {conn.recipient.preferred_name || conn.recipient.name}
                      </button>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        Awaiting response
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => cancelSent(conn)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
