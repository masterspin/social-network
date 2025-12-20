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
  visibility: string;
};

type SegmentFormState = {
  type: string;
  title: string;
  description: string;
  locationName: string;
  startTime: string;
  endTime: string;
  timezone: string;
  isAllDay: boolean;
  providerName: string;
  confirmationCode: string;
  transportNumber: string;
  costAmount: string;
  costCurrency: string;
};

const SEGMENT_TYPES = [
  { value: "flight", label: "Flight" },
  { value: "hotel", label: "Hotel" },
  { value: "activity", label: "Activity" },
  { value: "transport", label: "Transport" },
  { value: "meal", label: "Meal" },
  { value: "custom", label: "Other" },
];

function getInitialSegmentForm(): SegmentFormState {
  return {
    type: "activity",
    title: "",
    description: "",
    locationName: "",
    startTime: "",
    endTime: "",
    timezone: DEFAULT_TIMEZONE,
    isAllDay: false,
    providerName: "",
    confirmationCode: "",
    transportNumber: "",
    costAmount: "",
    costCurrency: "USD",
  };
}

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
    visibility: "private",
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
  const [showSegmentForm, setShowSegmentForm] = useState(false);
  const [segmentForm, setSegmentForm] = useState<SegmentFormState>(() =>
    getInitialSegmentForm()
  );
  const [creatingSegment, setCreatingSegment] = useState(false);
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [editHeaderForm, setEditHeaderForm] = useState<CreateFormState>(
    getInitialForm()
  );
  const [updatingHeader, setUpdatingHeader] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editSegmentForm, setEditSegmentForm] = useState<SegmentFormState>(
    getInitialSegmentForm()
  );
  const [updatingSegment, setUpdatingSegment] = useState(false);
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
          visibility: createForm.visibility || undefined,
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

  const handleCreateSegment = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (!userId || !selectedId) {
      setFeedback({
        type: "error",
        text: "You need to select an itinerary first.",
      });
      return;
    }
    if (!segmentForm.title.trim()) {
      setFeedback({ type: "error", text: "Segment title is required." });
      return;
    }

    setCreatingSegment(true);
    try {
      const response = await fetch(
        `/api/itineraries/${encodeURIComponent(selectedId)}/segments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: userId,
            type: segmentForm.type,
            title: segmentForm.title.trim(),
            description: segmentForm.description.trim() || null,
            location_name: segmentForm.locationName.trim() || null,
            start_time: segmentForm.startTime || null,
            end_time: segmentForm.endTime || null,
            is_all_day: segmentForm.isAllDay,
            provider_name: segmentForm.providerName.trim() || null,
            confirmation_code: segmentForm.confirmationCode.trim() || null,
            transport_number: segmentForm.transportNumber.trim() || null,
            timezone: segmentForm.timezone,
            cost_amount: segmentForm.costAmount
              ? parseFloat(segmentForm.costAmount)
              : null,
            cost_currency: segmentForm.costCurrency || null,
          }),
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Failed to create segment");
      }

      setFeedback({
        type: "success",
        text: "Segment added to your itinerary!",
      });
      setSegmentForm(getInitialSegmentForm());
      setShowSegmentForm(false);
      // Reload the itinerary detail to show the new segment
      await loadItineraryDetail(selectedId, userId);
    } catch (error) {
      console.error(error);
      setFeedback({
        type: "error",
        text: (error as Error).message || "Unable to create segment.",
      });
    } finally {
      setCreatingSegment(false);
    }
  };
  const handleUpdateItinerary = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userId || !selectedId || !detail) return;
    setUpdatingHeader(true);
    try {
      const response = await fetch(
        `/api/itineraries/${encodeURIComponent(selectedId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner_id: userId,
            title: editHeaderForm.title,
            visibility: editHeaderForm.visibility,
          }),
        }
      );
      if (!response.ok) throw new Error("Failed to update itinerary");
      setFeedback({ type: "success", text: "Itinerary updated!" });
      setIsEditingHeader(false);
      setIsEditingTitle(false);
      await loadItineraryDetail(selectedId, userId);
      await loadItineraries(userId);
    } catch (error) {
      setFeedback({ type: "error", text: "Failed to update itinerary." });
    } finally {
      setUpdatingHeader(false);
    }
  };

  const handleUpdateSegment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !selectedId || !editingSegmentId) return;
    setUpdatingSegment(true);
    try {
      const response = await fetch(
        `/api/itineraries/${encodeURIComponent(
          selectedId
        )}/segments/${encodeURIComponent(editingSegmentId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            type: editSegmentForm.type,
            title: editSegmentForm.title,
            description: editSegmentForm.description,
            location_name: editSegmentForm.locationName,
            start_time: editSegmentForm.startTime,
            end_time: editSegmentForm.endTime,
            is_all_day: editSegmentForm.isAllDay,
            provider_name: editSegmentForm.providerName,
            confirmation_code: editSegmentForm.confirmationCode,
            transport_number: editSegmentForm.transportNumber,
            timezone: editSegmentForm.timezone,
            cost_amount: editSegmentForm.costAmount
              ? parseFloat(editSegmentForm.costAmount)
              : null,
            cost_currency: editSegmentForm.costCurrency,
          }),
        }
      );
      if (!response.ok) throw new Error("Failed to update segment");
      setFeedback({ type: "success", text: "Segment updated!" });
      setEditingSegmentId(null);
      await loadItineraryDetail(selectedId, userId);
    } catch (error) {
      setFeedback({ type: "error", text: "Failed to update segment." });
    } finally {
      setUpdatingSegment(false);
    }
  };

  const handleDeleteSegment = async (segmentId: string) => {
    if (
      !userId ||
      !selectedId ||
      !window.confirm("Are you sure you want to delete this segment?")
    )
      return;
    try {
      const response = await fetch(
        `/api/itineraries/${encodeURIComponent(
          selectedId
        )}/segments/${encodeURIComponent(
          segmentId
        )}?user_id=${encodeURIComponent(userId)}`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error("Failed to delete segment");
      setFeedback({ type: "success", text: "Segment deleted." });
      await loadItineraryDetail(selectedId, userId);
    } catch (error) {
      setFeedback({ type: "error", text: "Failed to delete segment." });
    }
  };

  const startEditingHeader = () => {
    if (!detail) return;
    setEditHeaderForm({
      title: detail.title || "",
      visibility: detail.visibility || "private",
    });
    setIsEditingHeader(true);
  };

  const startEditingSegment = (segment: SegmentRow) => {
    setEditSegmentForm({
      type: segment.type || "activity",
      title: segment.title || "",
      description: segment.description || "",
      locationName: segment.location_name || "",
      startTime: segment.start_time ? segment.start_time.slice(0, 16) : "",
      endTime: segment.end_time ? segment.end_time.slice(0, 16) : "",
      isAllDay: segment.is_all_day || false,
      providerName: segment.provider_name || "",
      confirmationCode: segment.confirmation_code || "",
      transportNumber: segment.transport_number || "",
      costAmount: segment.cost_amount ? segment.cost_amount.toString() : "",
      costCurrency: segment.cost_currency || "USD",
      timezone:
        (segment as any).timezone ||
        (segment as any).metadata?.timezone ||
        DEFAULT_TIMEZONE,
    });
    setEditingSegmentId(segment.id);
  };

  const travelerCount = detail?.travelers?.length ?? 0;
  const segmentCount = detail?.segments?.length ?? 0;

  const inferredDates = useMemo(() => {
    if (!detail?.segments?.length) return { start: null, end: null };
    let minStart: Date | null = null;
    let maxEnd: Date | null = null;
    detail.segments.forEach((s) => {
      if (s.start_time) {
        const d = new Date(s.start_time);
        if (!minStart || d < minStart) minStart = d;
        if (!maxEnd || d > maxEnd) maxEnd = d;
      }
      if (s.end_time) {
        const d = new Date(s.end_time);
        if (!maxEnd || d > maxEnd) maxEnd = d;
      }
    });
    return {
      start: minStart ? (minStart as Date).toISOString() : null,
      end: maxEnd ? (maxEnd as Date).toISOString() : null,
    };
  }, [detail?.segments]);

  const tripDurationLabel = useMemo(() => {
    const { start: startDateStr, end: endDateStr } = inferredDates;
    if (!startDateStr || !endDateStr) return "Flexible timing";
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return "Flexible timing";
    }
    const diffDays =
      Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays <= 0) {
      return "Flexible timing";
    }
    return `${diffDays} day${diffDays === 1 ? "" : "s"}`;
  }, [inferredDates]);

  return (
    <div className="flex flex-col h-full">
      {feedback && (
        <div className="px-6 py-4">
          <div
            className={`rounded-xl border px-4 py-3 text-sm font-medium shadow-sm ${
              feedback.type === "success"
                ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-950/40 dark:text-green-200"
                : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200"
            }`}
          >
            {feedback.text}
          </div>
        </div>
      )}

      <div
        className={`relative z-0 flex-1 h-full transition-[padding] duration-300 ease-in-out px-4 sm:px-6 ${
          sidebarOpen ? "lg:pl-[21rem] lg:pr-10" : "lg:px-10 lg:pl-16"
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
          className={`absolute inset-y-0 left-0 z-30 w-full sm:w-[18rem] lg:w-[19rem] transition-transform duration-300 ease-in-out border-r border-gray-100 dark:border-gray-800 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col bg-white dark:bg-gray-900 shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800 px-6 py-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Collection
                </p>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">
                  {itineraries.length} Itineraries
                </h2>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setShowCreateForm((open) => !open)}
                  className={`flex h-10 items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold shadow-sm transition-all duration-200 active:scale-95 ${
                    showCreateForm
                      ? "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200"
                      : "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-500/20"
                  }`}
                  disabled={loadingUser || listLoading}
                >
                  {showCreateForm ? (
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  )}
                  <span>{showCreateForm ? "Close" : "New"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-100 bg-white text-gray-400 shadow-sm transition-all hover:text-gray-900 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500 @lg:hidden"
                  aria-label="Collapse itinerary list"
                >
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 19l-7-7 7-7"
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
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                        Visibility
                      </label>
                      <select className="mt-1 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="private">Private</option>
                        <option value="shared">Shared</option>
                        <option value="public">Public</option>
                      </select>
                    </div>
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
                <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
                  {itineraries.map((itinerary) => {
                    const travelerTotal = Math.max(
                      itinerary.travelers?.length ?? 0,
                      1
                    );
                    const isSelected = selectedId === itinerary.id;

                    return (
                      <div key={itinerary.id} className="p-2">
                        <button
                          onClick={() => handleSelectItinerary(itinerary.id)}
                          className={`group relative w-full rounded-2xl p-4 text-left transition-all duration-300 ${
                            isSelected
                              ? "bg-blue-50 dark:bg-blue-900/20 shadow-sm ring-1 ring-blue-100 dark:ring-blue-800/50"
                              : "hover:bg-gray-50 dark:hover:bg-gray-800/40"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h3
                                className={`truncate text-sm font-bold tracking-tight ${
                                  isSelected
                                    ? "text-blue-900 dark:text-blue-100"
                                    : "text-gray-900 dark:text-white"
                                }`}
                              >
                                {itinerary.title}
                              </h3>
                            </div>

                            <p className="mt-1 text-[12px] font-medium text-gray-500 dark:text-gray-400">
                              {formatDateRange(
                                itinerary.start_date,
                                itinerary.end_date
                              )}
                            </p>

                            <div className="mt-3 flex items-center justify-between gap-2">
                              <div className="flex -space-x-2">
                                {[...Array(Math.min(travelerTotal, 3))].map(
                                  (_, i) => (
                                    <div
                                      key={i}
                                      className="h-6 w-6 rounded-full border-2 border-white bg-gray-200 dark:border-gray-900 dark:bg-gray-700"
                                    />
                                  )
                                )}
                                {travelerTotal > 3 && (
                                  <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-[10px] font-bold text-gray-500 dark:border-gray-900 dark:bg-gray-800">
                                    +{travelerTotal - 3}
                                  </div>
                                )}
                              </div>
                              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                                {itinerary.visibility}
                              </span>
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </aside>

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
              <div className="group relative rounded-[2rem] border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xl shadow-gray-200/50 dark:shadow-none overflow-hidden transition-all duration-500">
                <div className="h-3 bg-gradient-to-r from-blue-600 to-indigo-600 w-full" />

                {isEditingHeader && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                      className="absolute inset-0 bg-black/60 backdrop-blur-md"
                      onClick={() => setIsEditingHeader(false)}
                    />
                    <div className="relative w-full max-w-3xl bg-white dark:bg-gray-900 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                      <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-950/50">
                        <h3 className="text-xl font-black text-gray-900 dark:text-white">
                          Settings
                        </h3>
                        <button
                          onClick={() => setIsEditingHeader(false)}
                          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                        >
                          <svg
                            className="h-5 w-5 text-gray-400"
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

                      <div className="flex-1 overflow-y-auto p-8 space-y-10">
                        {/* Visibility Section */}
                        <form
                          onSubmit={handleUpdateItinerary}
                          className="space-y-6"
                        >
                          <div>
                            <label className="block text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">
                              Visibility & Privacy
                            </label>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              {["private", "shared", "public"].map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() =>
                                    setEditHeaderForm({
                                      ...editHeaderForm,
                                      visibility: v,
                                    })
                                  }
                                  className={`p-4 rounded-2xl border-2 text-left transition-all ${
                                    editHeaderForm.visibility === v
                                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/10"
                                      : "border-gray-100 dark:border-gray-800 hover:border-gray-200"
                                  }`}
                                >
                                  <p className="font-bold text-gray-900 dark:text-white capitalize mb-1">
                                    {v}
                                  </p>
                                  <p className="text-[10px] text-gray-500">
                                    {v === "private" && "Only travelers"}
                                    {v === "shared" && "Connections only"}
                                    {v === "public" && "Visible to everyone"}
                                  </p>
                                </button>
                              ))}
                            </div>
                          </div>
                        </form>

                        <div className="border-t border-gray-100 dark:border-gray-800" />

                        {/* Participants Section */}
                        <div className="space-y-6">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-bold text-gray-900 dark:text-white">
                                Participants
                              </h4>
                              <p className="text-xs text-gray-500">
                                Collaborate with others on this journey
                              </p>
                            </div>
                            <button className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition">
                              Invite +
                            </button>
                          </div>

                          <div className="divide-y divide-gray-50 dark:divide-gray-800 border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden">
                            {detail.travelers?.map((traveler, index) => {
                              const displayName = travelerDisplayName(
                                traveler,
                                usersById
                              );
                              return (
                                <div
                                  key={index}
                                  className="px-5 py-4 flex items-center justify-between bg-white dark:bg-gray-900/50"
                                >
                                  <div className="flex items-center gap-3">
                                    <div
                                      className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600"
                                      style={{
                                        background:
                                          traveler.color_hex || undefined,
                                      }}
                                    >
                                      {avatarInitials(displayName)}
                                    </div>
                                    <div>
                                      <p className="text-sm font-bold text-gray-900 dark:text-white">
                                        {displayName}
                                      </p>
                                      <p className="text-[10px] uppercase font-black text-gray-400">
                                        {traveler.role}
                                      </p>
                                    </div>
                                  </div>
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-50 dark:bg-gray-800 text-gray-500 uppercase">
                                    {traveler.invitation_status}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex justify-end gap-4 pt-4">
                          <button
                            type="button"
                            onClick={() => setIsEditingHeader(false)}
                            className="px-6 py-3 text-sm font-bold text-gray-500 hover:text-gray-900"
                          >
                            Close
                          </button>
                          <button
                            onClick={() => handleUpdateItinerary()}
                            disabled={updatingHeader}
                            className="px-8 py-3 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 disabled:opacity-50"
                          >
                            {updatingHeader ? "Saving..." : "Save Settings"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-8 lg:p-10 relative">
                  <div className="absolute top-8 right-8 lg:top-10 lg:right-10">
                    <button
                      onClick={startEditingHeader}
                      className="p-3 rounded-full bg-gray-50/50 dark:bg-gray-800/50 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-300 shadow-sm border border-gray-100 dark:border-gray-800 backdrop-blur-sm"
                      aria-label="Itinerary settings"
                    >
                      <svg
                        className="h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                    </button>
                  </div>

                  <div className="mb-8 pr-16">
                    {isEditingTitle ? (
                      <div className="flex-1 min-w-0 pr-4">
                        <input
                          type="text"
                          autoFocus
                          value={editHeaderForm.title}
                          onChange={(e) =>
                            setEditHeaderForm({
                              ...editHeaderForm,
                              title: e.target.value,
                            })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleUpdateItinerary();
                            if (e.key === "Escape") setIsEditingTitle(false);
                          }}
                          onBlur={() => {
                            if (editHeaderForm.title === detail.title)
                              setIsEditingTitle(false);
                          }}
                          className="w-full bg-gray-50 dark:bg-gray-800/50 text-4xl font-black text-gray-900 dark:text-white px-4 py-2 rounded-2xl border-2 border-blue-500/20 focus:border-blue-500 focus:outline-none transition-all"
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => handleUpdateItinerary()}
                            className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold shadow-lg"
                          >
                            {updatingHeader ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={() => setIsEditingTitle(false)}
                            className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg text-xs font-bold"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="group/title relative inline-block">
                        <h2
                          className="text-4xl font-black text-gray-900 dark:text-white tracking-tight cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-all flex items-center gap-3"
                          onClick={() => {
                            if (detail.owner_id === userId) {
                              setEditHeaderForm({
                                title: detail.title || "",
                                visibility: detail.visibility || "private",
                              });
                              setIsEditingTitle(true);
                            }
                          }}
                        >
                          {detail.title}
                          {detail.owner_id === userId && (
                            <svg
                              className="h-6 w-6 opacity-0 group-hover/title:opacity-100 transition-opacity text-blue-500"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2.5}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                              />
                            </svg>
                          )}
                        </h2>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-col gap-1">
                      <p className="flex items-center gap-2 text-lg font-semibold text-gray-700 dark:text-gray-300">
                        <svg
                          className="h-5 w-5 text-blue-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        {formatDateRange(
                          inferredDates.start,
                          inferredDates.end
                        )}
                      </p>
                      <p className="text-sm font-medium text-gray-400 dark:text-gray-500 ml-7">
                        {tripDurationLabel}
                      </p>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 p-0.5 shadow-lg shadow-blue-500/20">
                          <div className="h-full w-full rounded-full bg-white dark:bg-gray-900 flex items-center justify-center font-bold text-blue-600 dark:text-blue-400">
                            {avatarInitials(
                              detail.owner?.preferred_name ||
                                detail.owner?.name,
                              detail.owner?.username
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                            Host
                          </p>
                          <p className="text-sm font-bold text-gray-900 dark:text-white">
                            {detail.owner?.preferred_name ||
                              detail.owner?.name ||
                              detail.owner?.username ||
                              "Owner"}
                          </p>
                        </div>
                      </div>

                      <div className="h-10 w-px bg-gray-100 dark:bg-gray-800" />

                      <div className="flex gap-6">
                        <div className="text-center">
                          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                            Travelers
                          </p>
                          <p className="text-lg font-black text-gray-900 dark:text-white leading-tight">
                            {travelerCount}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                            Segments
                          </p>
                          <p className="text-lg font-black text-gray-900 dark:text-white leading-tight">
                            {segmentCount}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Itinerary Tab Content - Timeline View */}
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden pt-8">
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
                  {/* Header */}
                  <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Trip Timeline
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {segmentCount} segment{segmentCount === 1 ? "" : "s"}{" "}
                        planned
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSegmentForm(true)}
                      className="rounded-full bg-blue-600 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-blue-700 transition flex items-center gap-2"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      Add segment
                    </button>
                  </div>

                  {/* Segment Creation Form Modal */}
                  {showSegmentForm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                      <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setShowSegmentForm(false)}
                      />
                      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-800">
                        <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Add New Segment
                          </h3>
                          <button
                            type="button"
                            onClick={() => setShowSegmentForm(false)}
                            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 transition"
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
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>
                        <form
                          onSubmit={handleCreateSegment}
                          className="p-6 space-y-4"
                        >
                          {/* Segment Type */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Type
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                              {SEGMENT_TYPES.map((type) => (
                                <button
                                  key={type.value}
                                  type="button"
                                  onClick={() =>
                                    setSegmentForm((prev) => ({
                                      ...prev,
                                      type: type.value,
                                    }))
                                  }
                                  className={`px-3 py-2 text-sm font-medium rounded-lg border transition ${
                                    segmentForm.type === type.value
                                      ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-500"
                                      : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                                  }`}
                                >
                                  {type.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Title */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Title *
                            </label>
                            <input
                              type="text"
                              value={segmentForm.title}
                              onChange={(e) =>
                                setSegmentForm((prev) => ({
                                  ...prev,
                                  title: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="e.g., Flight to Tokyo, Hotel Check-in"
                              required
                            />
                          </div>

                          {/* Description */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Description
                            </label>
                            <textarea
                              value={segmentForm.description}
                              onChange={(e) =>
                                setSegmentForm((prev) => ({
                                  ...prev,
                                  description: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              rows={2}
                              placeholder="Add any notes or details..."
                            />
                          </div>

                          {/* Location */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Location
                            </label>
                            <input
                              type="text"
                              value={segmentForm.locationName}
                              onChange={(e) =>
                                setSegmentForm((prev) => ({
                                  ...prev,
                                  locationName: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="e.g., Narita Airport, Park Hyatt Tokyo"
                            />
                          </div>

                          {/* Date/Time */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Start
                              </label>
                              <input
                                type="datetime-local"
                                value={segmentForm.startTime}
                                onChange={(e) =>
                                  setSegmentForm((prev) => ({
                                    ...prev,
                                    startTime: e.target.value,
                                  }))
                                }
                                disabled={segmentForm.isAllDay}
                                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                End
                              </label>
                              <input
                                type="datetime-local"
                                value={segmentForm.endTime}
                                onChange={(e) =>
                                  setSegmentForm((prev) => ({
                                    ...prev,
                                    endTime: e.target.value,
                                  }))
                                }
                                disabled={segmentForm.isAllDay}
                                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                              />
                            </div>
                          </div>

                          {/* All Day Toggle */}
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={segmentForm.isAllDay}
                              onChange={(e) =>
                                setSegmentForm((prev) => ({
                                  ...prev,
                                  isAllDay: e.target.checked,
                                }))
                              }
                              className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              All day event
                            </span>
                          </label>

                          {/* Provider & Confirmation */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Provider
                              </label>
                              <input
                                type="text"
                                value={segmentForm.providerName}
                                onChange={(e) =>
                                  setSegmentForm((prev) => ({
                                    ...prev,
                                    providerName: e.target.value,
                                  }))
                                }
                                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="e.g., United, Marriott"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Confirmation #
                              </label>
                              <input
                                type="text"
                                value={segmentForm.confirmationCode}
                                onChange={(e) =>
                                  setSegmentForm((prev) => ({
                                    ...prev,
                                    confirmationCode: e.target.value,
                                  }))
                                }
                                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="ABC123"
                              />
                            </div>
                          </div>

                          {/* Transport Number (for flights/transport) */}
                          {(segmentForm.type === "flight" ||
                            segmentForm.type === "transport") && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {segmentForm.type === "flight"
                                  ? "Flight Number"
                                  : "Route/Line"}
                              </label>
                              <input
                                type="text"
                                value={segmentForm.transportNumber}
                                onChange={(e) =>
                                  setSegmentForm((prev) => ({
                                    ...prev,
                                    transportNumber: e.target.value,
                                  }))
                                }
                                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder={
                                  segmentForm.type === "flight"
                                    ? "UA 123"
                                    : "Line 4"
                                }
                              />
                            </div>
                          )}
                          {/* Timezone */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Timezone
                            </label>
                            <input
                              type="text"
                              value={segmentForm.timezone}
                              onChange={(e) =>
                                setSegmentForm((prev) => ({
                                  ...prev,
                                  timezone: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="e.g. UTC, America/New_York"
                            />
                          </div>
                          {/* Cost */}
                          <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-2">
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Cost
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                value={segmentForm.costAmount}
                                onChange={(e) =>
                                  setSegmentForm((prev) => ({
                                    ...prev,
                                    costAmount: e.target.value,
                                  }))
                                }
                                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="0.00"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Currency
                              </label>
                              <select
                                value={segmentForm.costCurrency}
                                onChange={(e) =>
                                  setSegmentForm((prev) => ({
                                    ...prev,
                                    costCurrency: e.target.value,
                                  }))
                                }
                                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="USD">USD</option>
                                <option value="EUR">EUR</option>
                                <option value="GBP">GBP</option>
                                <option value="JPY">JPY</option>
                                <option value="CAD">CAD</option>
                                <option value="AUD">AUD</option>
                              </select>
                            </div>
                          </div>

                          {/* Submit */}
                          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                            <button
                              type="button"
                              onClick={() => setShowSegmentForm(false)}
                              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={creatingSegment}
                              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {creatingSegment ? "Adding..." : "Add Segment"}
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}

                  {/* Timeline */}
                  <div className="p-6">
                    {!segmentCount && (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                          <svg
                            className="h-8 w-8 text-gray-400 dark:text-gray-500"
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
                        </div>
                        <p className="text-base font-medium text-gray-900 dark:text-white">
                          Start building your itinerary
                        </p>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-sm">
                          Add flights, hotels, activities, and more. Each
                          segment becomes a node on your timeline.
                        </p>
                      </div>
                    )}

                    {segmentCount > 0 && (
                      <div className="relative">
                        <div className="pointer-events-none absolute left-12 top-6 bottom-6 w-0.5 bg-gradient-to-b from-blue-500 via-blue-400 to-blue-300 dark:from-blue-600 dark:via-blue-500 dark:to-blue-400" />

                        <div className="rounded-[1.75rem] border border-gray-200 dark:border-gray-800 bg-gradient-to-b from-white via-gray-50 to-gray-100/60 dark:from-gray-950 dark:via-gray-900/40 dark:to-gray-900/10 shadow-inner">
                          {detail.segments?.map((segment, index) => {
                            const isFirst = index === 0;
                            const isLast =
                              index === (detail.segments?.length ?? 0) - 1;
                            const isEven = index % 2 === 0;
                            const typeConfig: Record<
                              string,
                              {
                                icon: React.ReactNode;
                                color: string;
                                bgColor: string;
                              }
                            > = {
                              flight: {
                                icon: (
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
                                      d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                                    />
                                  </svg>
                                ),
                                color: "text-sky-600 dark:text-sky-400",
                                bgColor: "bg-sky-100 dark:bg-sky-900/40",
                              },
                              hotel: {
                                icon: (
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
                                      d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z"
                                    />
                                  </svg>
                                ),
                                color: "text-purple-600 dark:text-purple-400",
                                bgColor: "bg-purple-100 dark:bg-purple-900/40",
                              },
                              activity: {
                                icon: (
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
                                      d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                                    />
                                  </svg>
                                ),
                                color: "text-amber-600 dark:text-amber-400",
                                bgColor: "bg-amber-100 dark:bg-amber-900/40",
                              },
                              transport: {
                                icon: (
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
                                      d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
                                    />
                                  </svg>
                                ),
                                color: "text-green-600 dark:text-green-400",
                                bgColor: "bg-green-100 dark:bg-green-900/40",
                              },
                              meal: {
                                icon: (
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
                                      d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.87c1.355 0 2.697.055 4.024.165C17.155 8.51 18 9.473 18 10.608v2.513m-3-4.87v-1.5m-6 1.5v-1.5m12 9.75l-1.5.75a3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0L3 16.5m15-3.38a48.474 48.474 0 00-6-.37c-2.032 0-4.034.125-6 .37m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.17c0 .62-.504 1.124-1.125 1.124H4.125A1.125 1.125 0 013 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 016 13.12M12.265 3.11a.375.375 0 11-.53 0L12 2.845l.265.265zm-3 0a.375.375 0 11-.53 0L9 2.845l.265.265zm6 0a.375.375 0 11-.53 0L15 2.845l.265.265z"
                                    />
                                  </svg>
                                ),
                                color: "text-rose-600 dark:text-rose-400",
                                bgColor: "bg-rose-100 dark:bg-rose-900/40",
                              },
                            };
                            const config = typeConfig[
                              segment.type.toLowerCase()
                            ] || {
                              icon: (
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
                                    d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                                  />
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                                  />
                                </svg>
                              ),
                              color: "text-blue-600 dark:text-blue-400",
                              bgColor: "bg-blue-100 dark:bg-blue-900/40",
                            };

                            return (
                              <div
                                key={segment.id}
                                className={`group relative pl-24 pr-8 py-8 transition-colors ${
                                  !isLast
                                    ? "border-b border-white/60 dark:border-gray-800/70"
                                    : ""
                                } ${
                                  isEven
                                    ? "bg-white/80 dark:bg-gray-900/30"
                                    : "bg-white/60 dark:bg-gray-900/10"
                                }`}
                              >
                                <div
                                  className={`absolute left-8 top-8 w-8 h-8 rounded-full ${config.bgColor} ${config.color} flex items-center justify-center ring-4 ring-white dark:ring-gray-900 shadow-sm`}
                                >
                                  {config.icon}
                                </div>

                                {/* Content */}
                                <div className="flex flex-col gap-4">
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex flex-wrap items-center gap-2 mb-1">
                                        <span
                                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${config.bgColor} ${config.color}`}
                                        >
                                          {segment.type}
                                        </span>
                                        {segment.confirmation_code && (
                                          <span className="text-xs text-gray-400 dark:text-gray-500">
                                            #{segment.confirmation_code}
                                          </span>
                                        )}
                                      </div>
                                      <h4 className="text-base font-semibold text-gray-900 dark:text-white truncate">
                                        {segment.title}
                                      </h4>
                                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        {formatSegmentTime(segment)}
                                      </p>
                                      {segment.location_name && (
                                        <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-1">
                                          <svg
                                            className="h-3.5 w-3.5"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={1.5}
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                                            />
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                                            />
                                          </svg>
                                          {segment.location_name}
                                        </p>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {segment.cost_amount &&
                                        segment.cost_currency && (
                                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg px-2 py-1">
                                            {segment.cost_currency}{" "}
                                            {segment.cost_amount}
                                          </span>
                                        )}
                                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                        {detail.owner_id === userId && (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                startEditingSegment(segment)
                                              }
                                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/30 transition"
                                              title="Edit segment"
                                            >
                                              <svg
                                                className="h-4 w-4"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                                strokeWidth={2}
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                                                />
                                              </svg>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleDeleteSegment(segment.id)
                                              }
                                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/30 transition"
                                              title="Delete segment"
                                            >
                                              <svg
                                                className="h-4 w-4"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                                strokeWidth={2}
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                                />
                                              </svg>
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {segment.description && (
                                    <p className="text-sm text-gray-600 dark:text-gray-300">
                                      {segment.description}
                                    </p>
                                  )}

                                  {(segment.provider_name ||
                                    segment.transport_number) && (
                                    <div className="flex flex-wrap gap-2">
                                      {segment.provider_name && (
                                        <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg px-2 py-1">
                                          <svg
                                            className="h-3 w-3"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={1.5}
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z"
                                            />
                                          </svg>
                                          {segment.provider_name}
                                        </span>
                                      )}
                                      {segment.transport_number && (
                                        <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg px-2 py-1">
                                          <svg
                                            className="h-3 w-3"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={1.5}
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5l-3.9 19.5m-2.1-19.5l-3.9 19.5"
                                            />
                                          </svg>
                                          {segment.transport_number}
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  <details className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-800 bg-white/40 dark:bg-transparent">
                                    <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center justify-between">
                                      <span className="flex items-center gap-2">
                                        <svg
                                          className="h-4 w-4 text-gray-400"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                          strokeWidth={1.5}
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                          />
                                        </svg>
                                        Checklist
                                      </span>
                                      <span className="text-xs text-gray-400 dark:text-gray-500">
                                        0 / 0 complete
                                      </span>
                                    </summary>
                                    <div className="px-4 pb-4">
                                      <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 px-3 py-4 text-center">
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                          No tasks yet for this segment
                                        </p>
                                        <button
                                          type="button"
                                          className="mt-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                                        >
                                          + Add task
                                        </button>
                                      </div>
                                    </div>
                                  </details>
                                </div>

                                {isFirst && (
                                  <div className="absolute left-[46px] top-3 w-3 h-3 rounded-full bg-blue-500 ring-4 ring-white dark:ring-gray-900" />
                                )}
                                {isLast && (
                                  <div className="absolute left-[46px] bottom-3 w-3 h-3 rounded-full bg-blue-300 dark:bg-blue-500 ring-4 ring-white dark:ring-gray-900" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* General Checklists (not segment-specific) */}
                  {detail.checklists && detail.checklists.length > 0 && (
                    <div className="border-t border-gray-200 dark:border-gray-800 px-6 py-4">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                        <svg
                          className="h-4 w-4 text-gray-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
                          />
                        </svg>
                        Trip Checklists
                      </h4>
                      <div className="space-y-3">
                        {detail.checklists.map((checklist) => (
                          <div
                            key={checklist.id}
                            className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40"
                          >
                            <div className="px-4 py-3 flex items-center justify-between">
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {checklist.title}
                              </p>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {checklist.tasks?.length ?? 0} task
                                {(checklist.tasks?.length ?? 0) === 1
                                  ? ""
                                  : "s"}
                              </span>
                            </div>
                            {checklist.tasks && checklist.tasks.length > 0 && (
                              <div className="border-t border-gray-200 dark:border-gray-800 px-4 py-2 space-y-1">
                                {checklist.tasks.map((task) => (
                                  <div
                                    key={task.id}
                                    className="flex items-center gap-3 py-1"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={task.status === "completed"}
                                      readOnly
                                      className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span
                                      className={`text-sm ${
                                        task.status === "completed"
                                          ? "text-gray-400 line-through"
                                          : "text-gray-700 dark:text-gray-300"
                                      }`}
                                    >
                                      {task.title}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Comments Section */}
              <div className="space-y-6">
                {editingSegmentId && (
                  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div
                      className="absolute inset-0 bg-black/60 backdrop-blur-md"
                      onClick={() => setEditingSegmentId(null)}
                    />
                    <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-[2.5rem] shadow-2xl p-8 overflow-y-auto max-h-[90vh]">
                      <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-6">
                        Edit Segment
                      </h3>
                      <form
                        onSubmit={handleUpdateSegment}
                        className="space-y-6"
                      >
                        <div className="grid grid-cols-2 gap-6">
                          <div className="col-span-2">
                            <label className="block text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">
                              Title
                            </label>
                            <input
                              type="text"
                              value={editSegmentForm.title}
                              onChange={(e) =>
                                setEditSegmentForm({
                                  ...editSegmentForm,
                                  title: e.target.value,
                                })
                              }
                              className="w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-5 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">
                              Type
                            </label>
                            <select
                              value={editSegmentForm.type}
                              onChange={(e) =>
                                setEditSegmentForm({
                                  ...editSegmentForm,
                                  type: e.target.value,
                                })
                              }
                              className="w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-5 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                              {SEGMENT_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">
                              Timezone
                            </label>
                            <input
                              type="text"
                              value={editSegmentForm.timezone}
                              onChange={(e) =>
                                setEditSegmentForm({
                                  ...editSegmentForm,
                                  timezone: e.target.value,
                                })
                              }
                              className="w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-5 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">
                              Location
                            </label>
                            <input
                              type="text"
                              value={editSegmentForm.locationName}
                              onChange={(e) =>
                                setEditSegmentForm({
                                  ...editSegmentForm,
                                  locationName: e.target.value,
                                })
                              }
                              className="w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-5 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">
                              Start Time
                            </label>
                            <input
                              type="datetime-local"
                              value={editSegmentForm.startTime}
                              onChange={(e) =>
                                setEditSegmentForm({
                                  ...editSegmentForm,
                                  startTime: e.target.value,
                                })
                              }
                              className="w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-5 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">
                              End Time
                            </label>
                            <input
                              type="datetime-local"
                              value={editSegmentForm.endTime}
                              onChange={(e) =>
                                setEditSegmentForm({
                                  ...editSegmentForm,
                                  endTime: e.target.value,
                                })
                              }
                              className="w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-5 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">
                              Description
                            </label>
                            <textarea
                              value={editSegmentForm.description}
                              onChange={(e) =>
                                setEditSegmentForm({
                                  ...editSegmentForm,
                                  description: e.target.value,
                                })
                              }
                              className="w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-5 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none h-24"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-4 pt-6 border-t border-gray-100 dark:border-gray-800">
                          <button
                            type="button"
                            onClick={() => setEditingSegmentId(null)}
                            className="px-6 py-3 text-sm font-bold text-gray-500 hover:text-gray-900"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={updatingSegment}
                            className="px-8 py-3 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 disabled:opacity-50"
                          >
                            {updatingSegment ? "Saving..." : "Save Changes"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

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
                  <div className="px-6 py-8 space-y-8">
                    {!comments.length && (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="h-16 w-16 rounded-full bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center mb-4 transition-transform hover:scale-110 duration-500">
                          <svg
                            className="h-8 w-8 text-gray-300 dark:text-gray-600"
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
                        <p className="text-sm font-bold text-gray-400 dark:text-gray-500">
                          No comments yet
                        </p>
                      </div>
                    )}
                    {comments.map((comment) => {
                      const isOwner = comment.author_id === detail?.owner_id;
                      return (
                        <div
                          key={comment.id}
                          className="group relative flex gap-4"
                        >
                          <div className="h-11 w-11 shrink-0 rounded-full bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 border border-blue-100 dark:border-blue-900/30 flex items-center justify-center text-sm font-black text-blue-600 dark:text-blue-400 shadow-sm transition-transform group-hover:scale-110">
                            {avatarInitials(
                              comment.author?.preferred_name ||
                                comment.author?.name,
                              comment.author?.username
                            )}
                          </div>
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-gray-900 dark:text-white">
                                  {comment.author?.preferred_name ||
                                    comment.author?.name ||
                                    comment.author?.username ||
                                    "Traveler"}
                                </span>
                                {isOwner && (
                                  <span className="inline-flex items-center rounded-full bg-blue-500 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-white">
                                    Owner
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                {comment.created_at
                                  ? new Date(
                                      comment.created_at
                                    ).toLocaleDateString()
                                  : "Just now"}
                              </span>
                            </div>
                            <div className="relative p-4 bg-gray-50 dark:bg-gray-800/40 rounded-2xl rounded-tl-none border border-gray-100 dark:border-gray-800/50 transition-colors group-hover:bg-white dark:group-hover:bg-gray-800/60 group-hover:shadow-xl group-hover:shadow-gray-200/50 dark:group-hover:shadow-none">
                              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 leading-relaxed">
                                {comment.body}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
