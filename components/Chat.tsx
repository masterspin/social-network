"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Message = {
  id: string;
  sender_id: string;
  message: string;
  created_at: string;
  sender: {
    id: string;
    username: string;
    name: string;
    preferred_name: string | null;
    profile_image_url: string | null;
  };
};

type ChatProps = {
  matchId: string;
  currentUserId: string;
  otherUser: {
    id: string;
    username: string;
    name: string;
    preferred_name: string | null;
    profile_image_url: string | null;
  };
  onClose?: () => void;
  onDelete?: () => void;
};

function areMessagesEqual(a: Message[], b: Message[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (!right) return false;
    if (
      left.id !== right.id ||
      left.message !== right.message ||
      left.sender_id !== right.sender_id ||
      left.created_at !== right.created_at
    ) {
      return false;
    }
  }
  return true;
}

export default function Chat({
  matchId,
  currentUserId,
  otherUser,
  onClose,
  onDelete,
}: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<string>("idle");
  const [lastRealtimeEventAt, setLastRealtimeEventAt] = useState<string | null>(
    null
  );
  const [lastPollAt, setLastPollAt] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const senderCacheRef = useRef<Record<string, Message["sender"]>>({});

  useEffect(() => {
    senderCacheRef.current[otherUser.id] = {
      id: otherUser.id,
      username: otherUser.username,
      name: otherUser.name,
      preferred_name: otherUser.preferred_name,
      profile_image_url: otherUser.profile_image_url,
    };
  }, [otherUser]);

  useEffect(() => {
    if (!senderCacheRef.current[currentUserId]) {
      senderCacheRef.current[currentUserId] = {
        id: currentUserId,
        username: "",
        name: "",
        preferred_name: null,
        profile_image_url: null,
      };
    }
  }, [currentUserId]);

  const applyMessages = useCallback((incoming: Message[]) => {
    incoming.forEach((msg) => {
      if (msg.sender) {
        senderCacheRef.current[msg.sender.id] = msg.sender;
      }
    });
    setMessages((prev) => (areMessagesEqual(prev, incoming) ? prev : incoming));
  }, []);

  const fetchMessages = useCallback(async () => {
    const res = await fetch(
      `/api/match/messages?match_id=${encodeURIComponent(matchId)}`
    );
    const json = await res.json();

    if (!res.ok) {
      throw new Error(json?.error || "Failed to load messages");
    }

    return (json.data || []) as Message[];
  }, [matchId]);

  const upsertMessage = useCallback(
    (message: Message) => {
      let enriched: Message = message;

      if (!enriched.sender) {
        const cached = senderCacheRef.current[enriched.sender_id];
        if (cached) {
          enriched = { ...enriched, sender: cached };
        } else if (enriched.sender_id === otherUser.id) {
          enriched = {
            ...enriched,
            sender: {
              id: otherUser.id,
              username: otherUser.username,
              name: otherUser.name,
              preferred_name: otherUser.preferred_name,
              profile_image_url: otherUser.profile_image_url,
            },
          };
        }
      }

      if (enriched.sender) {
        senderCacheRef.current[enriched.sender.id] = enriched.sender;
      }

      setMessages((prev) => {
        const existingIndex = prev.findIndex((m) => m.id === enriched.id);
        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = enriched;
          return next;
        }

        const optimisticIndex = prev.findIndex((m) => {
          if (!m.id.startsWith("optimistic-")) return false;
          if (m.sender_id !== enriched.sender_id) return false;
          if (m.message.trim() !== enriched.message.trim()) return false;
          const optimisticTime = new Date(m.created_at).getTime();
          const enrichedTime = new Date(enriched.created_at).getTime();
          return Math.abs(optimisticTime - enrichedTime) < 30000;
        });

        if (optimisticIndex >= 0) {
          const next = [...prev];
          next[optimisticIndex] = enriched;
          next.sort(
            (a, b) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()
          );
          return next;
        }

        const next = [...prev, enriched];
        next.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        return next;
      });
    },
    [otherUser]
  );

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load initial messages
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchMessages();
        if (!cancelled) {
          applyMessages(data);
          setLastPollAt(new Date().toISOString());
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [fetchMessages, applyMessages]);

  useEffect(() => {
    setRealtimeStatus("connecting");
    console.log("[match_messages] setting up channel", matchId);
    const channel = supabase
      .channel(`match_messages:${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "match_messages",
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          console.log("[match_messages] change payload", payload);
          setLastRealtimeEventAt(new Date().toISOString());
          const row = payload?.new as
            | {
                id: string;
                sender_id: string;
                message: string;
                created_at: string;
              }
            | undefined;
          if (!row) return;

          const senderFromCache = senderCacheRef.current[row.sender_id];
          const fallbackSender =
            row.sender_id === otherUser.id
              ? {
                  id: otherUser.id,
                  username: otherUser.username,
                  name: otherUser.name,
                  preferred_name: otherUser.preferred_name,
                  profile_image_url: otherUser.profile_image_url,
                }
              : senderCacheRef.current[currentUserId];

          const senderInfo = senderFromCache ||
            fallbackSender || {
              id: row.sender_id,
              username: "",
              name: "",
              preferred_name: null,
              profile_image_url: null,
            };

          const message: Message = {
            id: row.id,
            sender_id: row.sender_id,
            message: row.message,
            created_at: row.created_at,
            sender: senderInfo,
          };

          upsertMessage(message);
        }
      )
      .subscribe((status) => {
        console.log("[match_messages] realtime status", status);
        setRealtimeStatus(String(status));
        if (status === "CHANNEL_ERROR") {
          console.error(
            "[match_messages] realtime channel error",
            channel.topic
          );
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setRealtimeStatus("idle");
    };
  }, [matchId, upsertMessage, otherUser, currentUserId]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchMessages()
        .then((data) => {
          applyMessages(data);
          setLastPollAt(new Date().toISOString());
        })
        .catch((e) => {
          console.error("[Match Messages poll]", e);
        });
    }, 15000);

    return () => clearInterval(interval);
  }, [fetchMessages, applyMessages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    setError(null);

    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticSender = senderCacheRef.current[currentUserId] || {
      id: currentUserId,
      username: "",
      name: "",
      preferred_name: null,
      profile_image_url: null,
    };
    senderCacheRef.current[currentUserId] = optimisticSender;
    const optimisticMessage: Message = {
      id: optimisticId,
      sender_id: currentUserId,
      message: newMessage.trim(),
      created_at: new Date().toISOString(),
      sender: optimisticSender,
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const res = await fetch("/api/match/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: matchId,
          sender_id: currentUserId,
          message: newMessage.trim(),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json?.error || "Failed to send message");
        setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId));
        return;
      }

      setNewMessage("");

      if (json?.data) {
        const responseMessage = Array.isArray(json.data)
          ? (json.data[0] as Message | undefined)
          : (json.data as Message | undefined);
        if (responseMessage) {
          setMessages((prev) =>
            prev.map((msg) => (msg.id === optimisticId ? responseMessage : msg))
          );
          upsertMessage(responseMessage);
        }
      }
    } catch (e) {
      setError((e as Error).message);
      setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId));
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Loading chat...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          {otherUser.profile_image_url ? (
            <img
              src={otherUser.profile_image_url}
              alt={otherUser.preferred_name || otherUser.name}
              className="w-10 h-10 rounded-full"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold">
              {(otherUser.preferred_name || otherUser.name)
                .charAt(0)
                .toUpperCase()}
            </div>
          )}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              {otherUser.preferred_name || otherUser.name}
            </h3>
            <p className="text-xs text-gray-500">@{otherUser.username}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {onDelete && (
            <button
              onClick={onDelete}
              className="px-3 py-1 text-sm rounded bg-red-600 text-white hover:bg-red-700"
            >
              Delete Chat
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="px-3 py-1 text-sm rounded bg-gray-600 text-white hover:bg-gray-700"
            >
              Close
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
        <span>Realtime: {realtimeStatus}</span>
        <span>
          Last realtime event:
          {lastRealtimeEventAt
            ? ` ${new Date(lastRealtimeEventAt).toLocaleTimeString()}`
            : " none"}
        </span>
        <span>
          Last poll:
          {lastPollAt
            ? ` ${new Date(lastPollAt).toLocaleTimeString()}`
            : " none"}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((msg) => {
            const isCurrentUser = msg.sender_id === currentUserId;
            return (
              <div
                key={msg.id}
                className={`flex ${
                  isCurrentUser ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[70%] rounded-lg px-4 py-2 ${
                    isCurrentUser
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  }`}
                >
                  {!isCurrentUser && (
                    <div className="text-xs font-semibold mb-1 opacity-75">
                      {msg.sender.preferred_name || msg.sender.name}
                    </div>
                  )}
                  <div className="break-words">{msg.message}</div>
                  <div
                    className={`text-xs mt-1 ${
                      isCurrentUser ? "text-blue-100" : "text-gray-500"
                    }`}
                  >
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error message */}
      {error && (
        <div className="px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={sendMessage}
        className="p-4 border-t border-gray-200 dark:border-gray-700"
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            disabled={sending}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={sending || !newMessage.trim()}
            className="px-6 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
