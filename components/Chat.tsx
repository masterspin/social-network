"use client";

import { useEffect, useState, useRef } from "react";
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load initial messages and set up real-time subscription
  useEffect(() => {
    let mounted = true;

    async function loadMessages() {
      try {
        const res = await fetch(
          `/api/match/messages?match_id=${encodeURIComponent(matchId)}`
        );
        const json = await res.json();

        if (!mounted) return;

        if (!res.ok) {
          setError(json?.error || "Failed to load messages");
          setLoading(false);
          return;
        }

        setMessages(json.data || []);
        setLoading(false);
      } catch (e) {
        if (!mounted) return;
        setError((e as Error).message);
        setLoading(false);
      }
    }

    // Set up real-time subscription
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
        async (payload) => {
          // Fetch the full message with sender details
          const res = await fetch(
            `/api/match/messages?match_id=${encodeURIComponent(matchId)}`
          );
          const json = await res.json();

          if (res.ok && json.data) {
            // Find the new message
            const newMsg = json.data.find(
              (msg: Message) => msg.id === payload.new.id
            );
            if (newMsg) {
              setMessages((prev) => {
                // Avoid duplicates
                if (prev.find((m) => m.id === newMsg.id)) return prev;
                return [...prev, newMsg];
              });
            }
          }
        }
      )
      .subscribe();

    channelRef.current = channel;
    loadMessages();

    return () => {
      mounted = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [matchId, supabase]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    setError(null);

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
        setSending(false);
        return;
      }

      setNewMessage("");
      setSending(false);
    } catch (e) {
      setError((e as Error).message);
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
