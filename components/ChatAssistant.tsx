"use client";

import { useState, useRef, useEffect } from "react";
import { SegmentAutofillPlan } from "@/lib/autofill/types";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  plans?: SegmentAutofillPlan[];
};

type ChatAssistantProps = {
  itineraryId: string;
  userId: string;
  onApplyPlan: (plan: SegmentAutofillPlan) => void | Promise<void>;
  existingSegments?: Array<{
    id?: string;
    type: string;
    title: string;
    start_time?: string;
    location_name?: string;
  }>;
};

export default function ChatAssistant({
  itineraryId,
  userId,
  onApplyPlan,
  existingSegments = [],
}: ChatAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi! I'm your travel assistant. I can help you find flights and hotels for your itinerary. Just ask me something like 'Find flights from NYC to London' or 'Search for hotels in Paris'.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch(`/api/itineraries/${itineraryId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          message: input,
          history: messages
            .filter((m) => m.id !== "welcome")
            .map((m) => ({ role: m.role, content: m.content })),
          context: { existing_segments: existingSegments },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get response");
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.message || "I found some options for you:",
        plans: data.plans,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : "Unknown error"
          }`,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-3 text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
          />
        </svg>
        <span className="font-medium">AI Assistant</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 h-[600px] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white">
        <div className="flex items-center gap-2">
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
          <span className="font-semibold">Travel Assistant</span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="hover:bg-white/20 rounded-lg p-1 transition"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"
              }`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 ${message.role === "user"
                ? "bg-blue-500 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                }`}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>

              {/* Plan Cards */}
              {message.plans && message.plans.length > 0 && (
                <div className="mt-3 space-y-2">
                  {message.plans.map((plan, idx) => {
                    const createCount = plan.actions.filter(a => a.type === 'create').length;
                    const deleteCount = plan.actions.filter(a => a.type === 'delete').length;

                    // Get titles of segments to be deleted
                    const deleteSegmentTitles = plan.actions
                      .filter(a => a.type === 'delete')
                      .map(action => {
                        if (action.type === 'delete') {
                          const seg = existingSegments.find(s => s.id === action.segmentId);
                          return seg?.title || 'Unknown segment';
                        }
                        return '';
                      })
                      .filter(Boolean);

                    // Get create action details
                    const createSegments = plan.actions
                      .filter((a): a is { type: 'create'; segment: any } => a.type === 'create')
                      .map(action => action.segment);

                    return (
                      <div
                        key={idx}
                        className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">
                              {plan.title}
                            </p>
                            {plan.description && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                {plan.description}
                              </p>
                            )}

                            {/* Show flight details for create actions */}
                            {createSegments.length > 0 && (
                              <div className="mt-2 space-y-2">
                                {createSegments.map((seg, i) => (
                                  <div key={i} className="text-xs bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2">
                                    <p className="font-medium text-gray-900 dark:text-gray-100">{seg.title}</p>
                                    {seg.start_time && (
                                      <p className="text-gray-600 dark:text-gray-400 mt-1">
                                        {new Date(seg.start_time).toLocaleString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          hour: 'numeric',
                                          minute: '2-digit'
                                        })}
                                        {seg.end_time && ` → ${new Date(seg.end_time).toLocaleString('en-US', {
                                          hour: 'numeric',
                                          minute: '2-digit'
                                        })}`}
                                      </p>
                                    )}
                                    {seg.provider_name && (
                                      <p className="text-gray-600 dark:text-gray-400">
                                        {seg.provider_name}
                                        {seg.transport_number && ` ${seg.transport_number}`}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Show which segments will be deleted */}
                            {deleteSegmentTitles.length > 0 && (
                              <div className="mt-2 text-xs text-gray-700 dark:text-gray-300">
                                <p className="font-medium mb-1">Will remove:</p>
                                <ul className="list-disc list-inside space-y-0.5">
                                  {deleteSegmentTitles.map((title, i) => (
                                    <li key={i} className="truncate">{title}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <div className="mt-2 flex gap-2 text-xs text-gray-600 dark:text-gray-400">
                              {createCount > 0 && (
                                <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded">
                                  +{createCount} segment{createCount > 1 ? 's' : ''}
                                </span>
                              )}
                              {deleteCount > 0 && (
                                <span className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-0.5 rounded">
                                  -{deleteCount} segment{deleteCount > 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => onApplyPlan(plan)}
                          className="mt-3 w-full bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium py-2 px-3 rounded-lg transition"
                        >
                          Apply Plan
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-2">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-800 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about flights or hotels..."
            disabled={isLoading}
            className="flex-1 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-4 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-xl px-4 py-2 transition disabled:cursor-not-allowed"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
