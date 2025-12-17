"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentUser } from "@/lib/supabase/queries";
import { Database } from "@/types/supabase";

type ItineraryRow = Database["public"]["Tables"]["itineraries"]["Row"];
type TravelerRow = Database["public"]["Tables"]["itinerary_travelers"]["Row"];
type SegmentRow = Database["public"]["Tables"]["itinerary_segments"]["Row"];
type ChecklistRow = Database["public"]["Tables"]["itinerary_checklists"]["Row"];
type TaskRow = Database["public"]["Tables"]["itinerary_tasks"]["Row"];
type CommentRow = Database["public"]["Tables"]["itinerary_comments"]["Row"];
type UserSummary = Pick<
  Database["public"]["Tables"]["users"]["Row"],
  "id" | "username" | "name" | "preferred_name" | "profile_image_url"
>;

type ItinerarySummary = ItineraryRow & {
  owner?: UserSummary | null;
  travelers?: TravelerRow[] | null;
};

type DetailedItinerary = ItineraryRow & {
  owner?: UserSummary | null;
  travelers?: (TravelerRow & { user?: UserSummary | null })[] | null;
  segments?:
    | (SegmentRow & {
        created_by_user?: UserSummary | null;
      })[]
    | null;
  checklists?:
    | (ChecklistRow & {
        tasks?:
          | (TaskRow & {
              assignee?: UserSummary | null;
            })[]
          | null;
      })[]
    | null;
};

type CommentWithAuthor = CommentRow & {
  author?: UserSummary | null;
};

type CreateFormState = {
  title: string;
  summary: string;
  description: string;
  startDate: string;
  endDate: string;
  timezone: string;
  visibility: string;
  coverImageUrl: string;
};

const DEFAULT_TIMEZONE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  } catch (error) {
    console.warn("Unable to resolve timezone", error);
    return "UTC";
  }
})();

function getInitialForm(): CreateFormState {
  return {
    title: "",
    summary: "",
    description: "",
    startDate: "",
    endDate: "",
    timezone: DEFAULT_TIMEZONE,
    visibility: "private",
    coverImageUrl: "",
  };
}

function formatDate(
  value: string | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat(
    undefined,
    options ?? {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );
  return formatter.format(date);
}

function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  const startLabel = formatDate(start);
  const endLabel = formatDate(end);
  if (startLabel && endLabel) {
    if (startLabel === endLabel) return startLabel;
    return `${startLabel} – ${endLabel}`;
  }
  if (startLabel) return `From ${startLabel}`;
  if (endLabel) return `Until ${endLabel}`;
  return "Dates TBD";
}

function formatSegmentTime(segment: SegmentRow): string {
  if (segment.is_all_day) {
    const day = formatDate(segment.start_time, {
      month: "short",
      day: "numeric",
    });
    return day ? `${day} · All day` : "All day";
  }
  const start = formatDate(segment.start_time, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const end = formatDate(segment.end_time, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  if (start && end) return `${start} → ${end}`;
  return start ?? end ?? "Timing TBD";
}

function avatarInitials(name?: string | null, fallback?: string | null) {
  const source = name?.trim() || fallback?.trim();
  if (!source) return "?";
  const normalized = source.replace(/\s+/g, " ");
  return normalized
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .slice(0, 2)
    .join("");
}

function travelerDisplayName(
  traveler: TravelerRow,
  usersById: Map<string, UserSummary>
): string {
  if (traveler.user_id) {
    const user = usersById.get(traveler.user_id);
    if (user) {
      return (
        user.preferred_name || user.name || user.username || "Unknown traveler"
      );
    }
  }
  if (traveler.email) return traveler.email;
  return "Traveler";
}

export default function ItineraryPlanner() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [itineraries, setItineraries] = useState<ItinerarySummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailedItinerary | null>(null);
  const [comments, setComments] = useState<CommentWithAuthor[]>([]);
  const [commentInput, setCommentInput] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>(() =>
    getInitialForm()
  );
  const [creating, setCreating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"itinerary" | "travelers">(
    "itinerary"
  );
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 5000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingUser(true);
      const { user } = await getCurrentUser();
      if (!cancelled) {
        setUserId(user?.id ?? null);
        setLoadingUser(false);
        if (!user) {
          setFeedback({
            type: "error",
            text: "You need to be signed in to manage itineraries.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadItineraries = useCallback(async (currentUserId: string) => {
    setListLoading(true);
    try {
      const response = await fetch(
        `/api/itineraries?user_id=${encodeURIComponent(currentUserId)}`,
        {
          cache: "no-store",
          headers: {
            "x-user-id": currentUserId,
          },
        }
      );
      if (!response.ok) {
        throw new Error(`Failed to load itineraries (${response.status})`);
      }
      const payload = await response.json();
      const items: ItinerarySummary[] = payload?.data ?? [];
      setItineraries(items);
      if (!items.length) {
        setDetail(null);
        setComments([]);
        setSelectedId(null);
        return;
      }
      setSelectedId((prev) => {
        if (prev && items.some((itinerary) => itinerary.id === prev)) {
          return prev;
        }
        return items[0].id;
      });
    } catch (error) {
      console.error(error);
      setFeedback({
        type: "error",
        text: "Unable to load itineraries right now.",
      });
      setItineraries([]);
      setDetail(null);
      setComments([]);
      setSelectedId(null);
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadComments = useCallback(
    async (itineraryId: string, currentUserId: string) => {
      try {
        const response = await fetch(
          `/api/itineraries/${encodeURIComponent(
            itineraryId
          )}/comments?user_id=${encodeURIComponent(currentUserId)}`,
          {
            cache: "no-store",
            headers: {
              "x-user-id": currentUserId,
            },
          }
        );
        if (!response.ok) {
          const errorPayload = await response.json().catch(() => ({}));
          const message =
            errorPayload?.error ||
            `Failed to load comments (${response.status ?? "unknown"})`;
          throw new Error(message);
        }
        const payload = await response.json();
        setComments(payload?.data ?? []);
      } catch (error) {
        console.error(error);
        setFeedback({
          type: "error",
          text:
            error instanceof Error && error.message
              ? error.message
              : "Unable to load itinerary comments.",
        });
        setComments([]);
      }
    },
    []
  );

  const loadItineraryDetail = useCallback(
    async (itineraryId: string, currentUserId: string) => {
      setDetailLoading(true);
      try {
        const response = await fetch(
          `/api/itineraries/${encodeURIComponent(
            itineraryId
          )}?user_id=${encodeURIComponent(currentUserId)}`,
          {
            cache: "no-store",
            headers: {
              "x-user-id": currentUserId,
            },
          }
        );
        if (!response.ok) {
          const errorPayload = await response.json().catch(() => ({}));
          const message =
            errorPayload?.error ||
            `Failed to load itinerary (${response.status ?? "unknown"})`;
          throw new Error(message);
        }
        const payload = await response.json();
        setDetail(payload?.data ?? null);
        await loadComments(itineraryId, currentUserId);
      } catch (error) {
        console.error(error);
        setFeedback({
          type: "error",
          text:
            error instanceof Error && error.message
              ? error.message
              : "Unable to load itinerary details.",
        });
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [loadComments]
  );

  useEffect(() => {
    if (!userId) return;
    loadItineraries(userId);
  }, [userId, loadItineraries]);

  useEffect(() => {
    if (!userId || !selectedId) return;
    loadItineraryDetail(selectedId, userId);
  }, [userId, selectedId, itineraries, loadItineraryDetail]);

  useEffect(() => {
    if (!itineraries.length) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) => {
      if (prev && itineraries.some((itinerary) => itinerary.id === prev)) {
        return prev;
      }
      return itineraries[0].id;
    });
  }, [itineraries]);

  const usersById = useMemo(() => {
    const map = new Map<string, UserSummary>();
    if (detail?.owner) {
      map.set(detail.owner.id, detail.owner);
    }
    if (detail?.travelers) {
      detail.travelers.forEach((traveler) => {
        const relatedUser = (
          traveler as {
            user?: UserSummary | null;
          }
        ).user;
        if (traveler.user_id && relatedUser) {
          map.set(traveler.user_id, relatedUser);
        }
      });
    }
    return map;
  }, [detail]);

  const selectedSummary = useMemo(() => {
    if (!selectedId) return null;
    return itineraries.find((itinerary) => itinerary.id === selectedId) ?? null;
  }, [itineraries, selectedId]);

  const handleSelectItinerary = useCallback(
    (itineraryId: string) => {
      setSelectedId(itineraryId);
      if (typeof window !== "undefined") {
        const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
        if (!isDesktop) {
          setSidebarOpen(false);
        }
      }
    },
    [setSelectedId, setSidebarOpen]
  );

  const handleCreateItinerary = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (!userId) {
      setFeedback({
        type: "error",
        text: "You need to be signed in before creating an itinerary.",
      });
      return;
    }
    if (!createForm.title.trim()) {
      setFeedback({ type: "error", text: "Title is required." });
      return;
    }

    setCreating(true);
    try {
      const response = await fetch("/api/itineraries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          owner_id: userId,
          title: createForm.title.trim(),
          summary: createForm.summary.trim() || undefined,
          description: createForm.description.trim() || undefined,
          start_date: createForm.startDate || undefined,
          end_date: createForm.endDate || undefined,
          timezone: createForm.timezone || undefined,
          visibility: createForm.visibility || undefined,
          status: "planning",
          cover_image_url: createForm.coverImageUrl.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Failed to create itinerary");
      }

      setFeedback({
        type: "success",
        text: "Itinerary created successfully!",
      });
      setCreateForm(getInitialForm());
      setShowCreateForm(false);
      await loadItineraries(userId);
    } catch (error) {
      console.error(error);
      setFeedback({
        type: "error",
        text: (error as Error).message || "Unable to create itinerary.",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleCommentSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (!userId || !selectedId) return;
    if (!commentInput.trim()) {
      setFeedback({ type: "error", text: "Add a note before sending." });
      return;
    }
    setCommentSubmitting(true);
    try {
      const response = await fetch(
        `/api/itineraries/${encodeURIComponent(selectedId)}/comments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: userId,
            body: commentInput.trim(),
          }),
        }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Failed to post comment");
      }
      setCommentInput("");
      await loadComments(selectedId, userId);
    } catch (error) {
      console.error(error);
      setFeedback({
        type: "error",
        text: (error as Error).message || "Unable to post comment.",
      });
    } finally {
      setCommentSubmitting(false);
    }
  };

  const travelerCount = detail?.travelers?.length ?? 0;
  const segmentCount = detail?.segments?.length ?? 0;
  const tripDurationLabel = useMemo(() => {
    if (!detail?.start_date || !detail?.end_date) return "Flexible timing";
    const start = new Date(detail.start_date);
    const end = new Date(detail.end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return "Flexible timing";
    }
    const diffDays =
      Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays <= 0) {
      return "Flexible timing";
    }
    return `${diffDays} day${diffDays === 1 ? "" : "s"}`;
  }, [detail?.start_date, detail?.end_date]);

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-medium shadow-sm ${
            feedback.type === "success"
              ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-950/40 dark:text-green-200"
              : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200"
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div
        className={`relative z-0 transition-[margin,padding] duration-300 ease-in-out ${
          sidebarOpen ? "lg:pl-[21rem] lg:pr-10 xl:pr-14" : "lg:px-10 xl:px-14"
        }`}
      >
        {sidebarOpen && (
          <div
            className="absolute inset-0 z-10 bg-gray-900/40 backdrop-blur-sm transition-opacity duration-300 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {!sidebarOpen && (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="absolute top-3 left-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            aria-controls="itinerary-sidebar"
            aria-label="Expand itinerary list"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 6l6 6-6 6"
              />
            </svg>
          </button>
        )}

        <aside
          id="itinerary-sidebar"
          className={`absolute inset-y-0 left-0 z-30 w-full sm:w-[18rem] lg:w-[19rem] transition-transform duration-300 ease-in-out ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-800 px-5 py-4">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Your itineraries
                </p>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {itineraries.length} total
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCreateForm((open) => !open)}
                  className="rounded-full bg-blue-600 text-white px-4 py-2 text-sm font-medium shadow hover:bg-blue-700 transition disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={loadingUser || listLoading}
                >
                  {showCreateForm ? "Close" : "New"}
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:text-gray-900 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                  aria-label="Collapse itinerary list"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 6l-6 6 6 6"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {showCreateForm && (
                <form
                  onSubmit={handleCreateItinerary}
                  className="space-y-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                      Title
                    </label>
                    <input
                      type="text"
                      value={createForm.title}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          title: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Tokyo R&D Summit"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                      Summary
                    </label>
                    <input
                      type="text"
                      value={createForm.summary}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          summary: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Investor roadshow & lab visits"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                      Description
                    </label>
                    <textarea
                      value={createForm.description}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          description: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={3}
                      placeholder="Outline objectives, concierge notes, travel preferences..."
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                        Start date
                      </label>
                      <input
                        type="date"
                        value={createForm.startDate}
                        onChange={(event) =>
                          setCreateForm((prev) => ({
                            ...prev,
                            startDate: event.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                        End date
                      </label>
                      <input
                        type="date"
                        value={createForm.endDate}
                        onChange={(event) =>
                          setCreateForm((prev) => ({
                            ...prev,
                            endDate: event.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                        Timezone
                      </label>
                      <input
                        type="text"
                        value={createForm.timezone}
                        onChange={(event) =>
                          setCreateForm((prev) => ({
                            ...prev,
                            timezone: event.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g. America/Los_Angeles"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                        Visibility
                      </label>
                      <select
                        value={createForm.visibility}
                        onChange={(event) =>
                          setCreateForm((prev) => ({
                            ...prev,
                            visibility: event.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="private">Private</option>
                        <option value="shared">Shared</option>
                        <option value="public">Public</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                      Cover image URL
                    </label>
                    <input
                      type="url"
                      value={createForm.coverImageUrl}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          coverImageUrl: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="https://"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-semibold shadow hover:bg-blue-700 transition disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={creating}
                  >
                    {creating ? "Creating..." : "Create itinerary"}
                  </button>
                </form>
              )}

              {listLoading ? (
                <div className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                  Loading itineraries...
                </div>
              ) : !itineraries.length ? (
                <div className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                  {loadingUser
                    ? "Checking your account..."
                    : "Create your first itinerary to get started."}
                </div>
              ) : (
                <ul className="divide-y divide-gray-200 dark:divide-gray-800">
                  {itineraries.map((itinerary) => {
                    const travelerTotal = Math.max(
                      itinerary.travelers?.length ?? 0,
                      1
                    );
                    return (
                      <li key={itinerary.id}>
                        <button
                          onClick={() => handleSelectItinerary(itinerary.id)}
                          className={`w-full px-5 py-4 text-left transition ${
                            selectedId === itinerary.id
                              ? "bg-blue-50/80 dark:bg-blue-900/20"
                              : "hover:bg-gray-50 dark:hover:bg-gray-900"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-base font-semibold text-gray-900 dark:text-white">
                                {itinerary.title}
                              </p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {formatDateRange(
                                  itinerary.start_date,
                                  itinerary.end_date
                                )}
                              </p>
                              {itinerary.summary && (
                                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                                  {itinerary.summary}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col items-end text-xs text-gray-500 dark:text-gray-400">
                              {itinerary.status && (
                                <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-1 uppercase tracking-wide font-semibold">
                                  {itinerary.status}
                                </span>
                              )}
                              <span className="mt-2">
                                {travelerTotal} traveler
                                {travelerTotal === 1 ? "" : "s"}
                              </span>
                              {itinerary.visibility && (
                                <span className="mt-1">
                                  Visibility: {itinerary.visibility}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </aside>

        <div
          className={`relative z-0 transition-[margin,padding] duration-300 ease-in-out ${
            sidebarOpen ? "lg:pl-[21rem]" : "lg:pl-0"
          }`}
        >
          <div className="space-y-6">
            {detailLoading && (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-6 text-sm text-gray-500 dark:text-gray-400">
                Syncing the itinerary workspace...
              </div>
            )}

            {!detailLoading && !detail && (
              <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm p-10 text-center text-sm text-gray-500 dark:text-gray-400">
                {selectedSummary
                  ? "We couldn’t load the itinerary details. Try refreshing."
                  : "Select an itinerary to see the collaboration workspace."}
              </div>
            )}

            {detail && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
                  {detail.cover_image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={detail.cover_image_url}
                      alt="Itinerary cover"
                      className="w-full h-48 object-cover"
                    />
                  )}
                  <div className="p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                          {detail.title}
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {formatDateRange(detail.start_date, detail.end_date)}
                          {detail.timezone ? ` · ${detail.timezone}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <div className="flex items-center gap-2">
                          <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200 flex items-center justify-center font-semibold">
                            {avatarInitials(
                              detail.owner?.preferred_name ||
                                detail.owner?.name,
                              detail.owner?.username
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {detail.owner?.preferred_name ||
                                detail.owner?.name ||
                                detail.owner?.username ||
                                "Owner"}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Host & orchestrator
                            </p>
                          </div>
                        </div>
                        <div className="h-10 border-l border-gray-200 dark:border-gray-700" />
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white text-center">
                            {travelerCount}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Traveler{travelerCount === 1 ? "" : "s"}
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white text-center">
                            {segmentCount}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Segments
                          </p>
                        </div>
                      </div>
                    </div>
                    {detail.summary && (
                      <p className="mt-4 text-base text-gray-700 dark:text-gray-200">
                        {detail.summary}
                      </p>
                    )}
                    {detail.description && (
                      <p className="mt-4 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                        {detail.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Tab Navigation */}
                <div className="border-b border-gray-200 dark:border-gray-800">
                  <nav className="flex gap-1" aria-label="Tabs">
                    <button
                      type="button"
                      onClick={() => setActiveTab("itinerary")}
                      className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                        activeTab === "itinerary"
                          ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                          />
                        </svg>
                        Itinerary
                        <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs">
                          {segmentCount}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("travelers")}
                      className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                        activeTab === "travelers"
                          ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 border border-b-0 border-gray-200 dark:border-gray-800 -mb-px"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
                          />
                        </svg>
                        Travelers
                        <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs">
                          {travelerCount}
                        </span>
                      </span>
                    </button>
                  </nav>
                </div>

                {/* Itinerary Tab Content */}
                {activeTab === "itinerary" && (
                  <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-6">
                    <div className="grid gap-10 lg:grid-cols-[1.7fr,1fr]">
                      <section>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                              Segments timeline
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              Curate logistics and highlights in chronological
                              order.
                            </p>
                          </div>
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {segmentCount} scheduled
                          </span>
                        </div>
                        <div className="mt-5 space-y-4">
                          {!segmentCount && (
                            <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                              No segments yet. Add your flights, hotel blocks,
                              and experiences next.
                            </div>
                          )}
                          {detail.segments?.map((segment) => (
                            <article
                              key={segment.id}
                              className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40 px-4 py-4"
                            >
                              <div className="flex flex-col gap-3 lg:flex-row lg:justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                    {segment.title}
                                  </p>
                                  <p className="text-xs uppercase tracking-wide text-blue-600 dark:text-blue-300">
                                    {segment.type}
                                  </p>
                                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                                    {formatSegmentTime(segment)}
                                  </p>
                                  {segment.location_name && (
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                      {segment.location_name}
                                    </p>
                                  )}
                                  {segment.description && (
                                    <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                                      {segment.description}
                                    </p>
                                  )}
                                </div>
                                <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1 lg:text-right">
                                  {segment.provider_name && (
                                    <p>{segment.provider_name}</p>
                                  )}
                                  {segment.confirmation_code && (
                                    <p>Ref#: {segment.confirmation_code}</p>
                                  )}
                                  {segment.transport_number && (
                                    <p>Route: {segment.transport_number}</p>
                                  )}
                                  {segment.cost_amount &&
                                    segment.cost_currency && (
                                      <p>
                                        {segment.cost_currency}{" "}
                                        {segment.cost_amount}
                                      </p>
                                    )}
                                </div>
                              </div>
                              {segment.metadata && (
                                <details className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                                  <summary className="cursor-pointer font-medium text-gray-700 dark:text-gray-200">
                                    Metadata
                                  </summary>
                                  <pre className="mt-2 whitespace-pre-wrap break-words text-xs bg-black/5 dark:bg-white/5 rounded-lg px-3 py-2">
                                    {JSON.stringify(segment.metadata, null, 2)}
                                  </pre>
                                </details>
                              )}
                            </article>
                          ))}
                        </div>
                      </section>

                      <section>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          Checklists
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Track sourcing tasks, concierge asks, and follow-ups.
                        </p>
                        <div className="mt-5 space-y-4">
                          {!detail.checklists?.length && (
                            <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                              Build mission checklists to coordinate sourcing,
                              tickets, and concierge requests.
                            </div>
                          )}
                          {detail.checklists?.map((checklist) => (
                            <div
                              key={checklist.id}
                              className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40 px-4 py-3"
                            >
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                  {checklist.title}
                                </p>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {checklist.tasks?.length ?? 0} task
                                  {(checklist.tasks?.length ?? 0) === 1
                                    ? ""
                                    : "s"}
                                </span>
                              </div>
                              <ul className="mt-3 space-y-2">
                                {checklist.tasks?.map((task) => (
                                  <li
                                    key={task.id}
                                    className="flex items-start justify-between text-sm text-gray-600 dark:text-gray-300"
                                  >
                                    <div>
                                      <p className="font-medium text-gray-900 dark:text-white">
                                        {task.title}
                                      </p>
                                      {task.notes && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                          {task.notes}
                                        </p>
                                      )}
                                    </div>
                                    <div className="text-right text-xs text-gray-500 dark:text-gray-400 space-y-1">
                                      {task.assignee?.preferred_name ||
                                      task.assignee?.name ||
                                      task.assignee?.username ? (
                                        <p>
                                          Owner:{" "}
                                          {task.assignee?.preferred_name ||
                                            task.assignee?.name ||
                                            task.assignee?.username}
                                        </p>
                                      ) : null}
                                      {task.due_at && (
                                        <p>Due {formatDate(task.due_at)}</p>
                                      )}
                                      {task.status && <p>{task.status}</p>}
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  </div>
                )}

                {/* Travelers Tab Content */}
                {activeTab === "travelers" && (
                  <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          Travelers & Roles
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Manage who&apos;s joining and their responsibilities
                        </p>
                      </div>
                      <button
                        type="button"
                        className="rounded-full bg-blue-600 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-blue-700 transition"
                      >
                        Invite traveler
                      </button>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {!detail.travelers?.length && (
                        <div className="px-6 py-12 text-center">
                          <div className="mx-auto h-12 w-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                            <svg
                              className="h-6 w-6 text-gray-400 dark:text-gray-500"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={1.5}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
                              />
                            </svg>
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            No travelers yet
                          </p>
                          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                            Invite friends and family to collaborate on this
                            trip
                          </p>
                        </div>
                      )}
                      {detail.travelers?.map((traveler, index) => {
                        const displayName = travelerDisplayName(
                          traveler,
                          usersById
                        );
                        const key =
                          traveler.id ||
                          traveler.user_id ||
                          `${traveler.itinerary_id || "traveler"}-${index}`;
                        return (
                          <div
                            key={key}
                            className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-950/40 transition-colors"
                          >
                            <div className="flex items-center gap-4">
                              <div
                                className="h-11 w-11 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-sm font-semibold text-white shadow-sm"
                                style={{
                                  background: traveler.color_hex
                                    ? traveler.color_hex
                                    : undefined,
                                }}
                              >
                                {avatarInitials(displayName)}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                  {displayName}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                                    {traveler.role || "Traveler"}
                                  </span>
                                  {traveler.invitation_status && (
                                    <span
                                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                        traveler.invitation_status ===
                                        "accepted"
                                          ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                                          : traveler.invitation_status ===
                                            "declined"
                                          ? "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                                          : "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300"
                                      }`}
                                    >
                                      {traveler.invitation_status}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {traveler.email && (
                                <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
                                  {traveler.email}
                                </span>
                              )}
                              <div
                                className={`flex items-center gap-1 text-xs ${
                                  traveler.notifications_enabled
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-gray-400 dark:text-gray-500"
                                }`}
                              >
                                <svg
                                  className="h-4 w-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={1.5}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
                                  />
                                </svg>
                                <span className="hidden sm:inline">
                                  {traveler.notifications_enabled
                                    ? "On"
                                    : "Off"}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 transition-colors"
                              >
                                <svg
                                  className="h-5 w-5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={1.5}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
                                  />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Comments Section */}
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                      Comments
                      {comments.length > 0 && (
                        <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                          ({comments.length})
                        </span>
                      )}
                    </h3>
                  </div>

                  {/* Comment Input - Top like social media */}
                  <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-950/30">
                    <form onSubmit={handleCommentSubmit} className="flex gap-3">
                      <div className="h-9 w-9 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200 flex items-center justify-center text-xs font-semibold">
                        {avatarInitials(
                          detail?.owner?.preferred_name || detail?.owner?.name,
                          detail?.owner?.username
                        )}
                      </div>
                      <div className="flex-1">
                        <textarea
                          value={commentInput}
                          onChange={(event) =>
                            setCommentInput(event.target.value)
                          }
                          className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                          rows={1}
                          placeholder="Add a comment..."
                          onFocus={(e) => {
                            e.target.rows = 3;
                          }}
                          onBlur={(e) => {
                            if (!e.target.value.trim()) e.target.rows = 1;
                          }}
                        />
                        {commentInput.trim() && (
                          <div className="mt-2 flex justify-end">
                            <button
                              type="submit"
                              className="rounded-full bg-blue-600 text-white px-4 py-1.5 text-sm font-medium shadow-sm hover:bg-blue-700 transition disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={commentSubmitting}
                            >
                              {commentSubmitting ? "Posting..." : "Post"}
                            </button>
                          </div>
                        )}
                      </div>
                    </form>
                  </div>

                  {/* Comments List */}
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {!comments.length && (
                      <div className="px-6 py-12 text-center">
                        <div className="mx-auto h-12 w-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                          <svg
                            className="h-6 w-6 text-gray-400 dark:text-gray-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                            />
                          </svg>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          No comments yet
                        </p>
                        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                          Be the first to start the conversation
                        </p>
                      </div>
                    )}
                    {comments.map((comment) => (
                      <div key={comment.id} className="px-6 py-4">
                        <div className="flex gap-3">
                          <div className="h-9 w-9 shrink-0 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-semibold text-gray-600 dark:text-gray-300">
                            {avatarInitials(
                              comment.author?.preferred_name ||
                                comment.author?.name,
                              comment.author?.username
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                {comment.author?.preferred_name ||
                                  comment.author?.name ||
                                  comment.author?.username ||
                                  "Anonymous"}
                              </span>
                              <span className="text-xs text-gray-400 dark:text-gray-500">
                                ·
                              </span>
                              <span className="text-xs text-gray-400 dark:text-gray-500">
                                {formatDate(comment.created_at, {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                }) || "Just now"}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words">
                              {comment.body}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
