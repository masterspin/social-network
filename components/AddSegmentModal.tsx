"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SegmentAutofillSuggestion } from "@/lib/autofill/types";
import {
  DEFAULT_TIMEZONE,
  SEGMENT_TYPE_OPTIONS,
  SMART_FILL_SUPPORTED_TYPES,
  EndpointKey,
  EndpointMetadataField,
  SegmentFormState,
  SegmentLegForm,
  SegmentType,
  buildMetadataPayload,
  createEmptyLeg,
  getEndpointFieldValueFromState,
  getInitialSegmentForm,
  getTypeConfig,
  mergeSmartSuggestion,
  parseUsdCostInput,
  supportsLegsForType,
  toAutofillType,
  updateEndpointFieldState,
} from "@/components/segments/segmentForm";

type FeedbackPayload = {
  type: "success" | "error";
  text: string;
};

type AddSegmentModalProps = {
  open: boolean;
  itineraryId: string | null;
  userId: string | null;
  onClose: () => void;
  onSegmentCreated?: () => Promise<void> | void;
  onFeedback?: (payload: FeedbackPayload) => void;
};

export default function AddSegmentModal({
  open,
  itineraryId,
  userId,
  onClose,
  onSegmentCreated,
  onFeedback,
}: AddSegmentModalProps) {
  const [segmentForm, setSegmentForm] = useState<SegmentFormState>(() =>
    getInitialSegmentForm()
  );
  const [legsExpanded, setLegsExpanded] = useState(true);
  const [smartFillInput, setSmartFillInput] = useState("");
  const [smartFillDate, setSmartFillDate] = useState("");
  const [smartFillSuggestion, setSmartFillSuggestion] =
    useState<SegmentAutofillSuggestion | null>(null);
  const [smartFillLoading, setSmartFillLoading] = useState(false);
  const [smartFillError, setSmartFillError] = useState<string | null>(null);
  const [creatingSegment, setCreatingSegment] = useState(false);

  const resetSegmentForm = useCallback(() => {
    setSegmentForm(getInitialSegmentForm());
    setSmartFillInput("");
    setSmartFillDate("");
    setSmartFillSuggestion(null);
    setSmartFillError(null);
    setSmartFillLoading(false);
    setLegsExpanded(true);
  }, []);

  const handleClose = useCallback(() => {
    resetSegmentForm();
    onClose();
  }, [onClose, resetSegmentForm]);

  useEffect(() => {
    if (!open) {
      resetSegmentForm();
    }
  }, [open, resetSegmentForm]);

  const handleCreateLegAdd = useCallback(() => {
    setSegmentForm((prev) => ({
      ...prev,
      legs: [...prev.legs, createEmptyLeg()],
    }));
  }, []);

  const handleCreateLegChange = useCallback(
    (legId: string, field: keyof SegmentLegForm, value: string) => {
      setSegmentForm((prev) => ({
        ...prev,
        legs: prev.legs.map((leg) =>
          leg.id === legId ? { ...leg, [field]: value } : leg
        ),
      }));
    },
    []
  );

  const handleCreateLegRemove = useCallback((legId: string) => {
    setSegmentForm((prev) => ({
      ...prev,
      legs: prev.legs.filter((leg) => leg.id !== legId),
    }));
  }, []);

  const handleEndpointFieldChange = useCallback(
    (endpoint: EndpointKey, field: EndpointMetadataField, value: string) => {
      setSegmentForm((prev) =>
        updateEndpointFieldState(prev, endpoint, field, value)
      );
    },
    []
  );

  const smartFillSupported = SMART_FILL_SUPPORTED_TYPES.has(segmentForm.type);
  const showLegsEditor = supportsLegsForType(segmentForm.type);
  const isFlightSegment = segmentForm.type === "flight";

  useEffect(() => {
    setSegmentForm((prev) => {
      const supports = supportsLegsForType(prev.type);
      if (supports && prev.legs.length === 0) {
        return { ...prev, legs: [createEmptyLeg()] };
      }
      if (!supports && prev.legs.length > 0) {
        return { ...prev, legs: [] };
      }
      return prev;
    });
  }, [segmentForm.type]);

  const createFormTypeConfig = useMemo(
    () => getTypeConfig(segmentForm.type),
    [segmentForm.type]
  );
  const smartFillPlaceholder = createFormTypeConfig.smartFillHint;
  const {
    titlePlaceholder,
    descriptionPlaceholder,
    locationLabel,
    locationPlaceholder,
    providerLabel,
    providerPlaceholder,
    confirmationLabel,
    confirmationPlaceholder,
    referenceLabel,
    referencePlaceholder,
    seatLabel,
    seatPlaceholder,
  } = createFormTypeConfig;

  const locationLabelText = locationLabel || "Location";
  const providerLabelText = providerLabel || "Provider";
  const confirmationLabelText = confirmationLabel || "Confirmation";
  const titlePlaceholderText = titlePlaceholder || "Segment title";
  const descriptionPlaceholderText =
    descriptionPlaceholder || "Add any notes or details";
  const locationPlaceholderText =
    locationPlaceholder || "Where is this happening?";
  const providerPlaceholderText = providerPlaceholder || "Company or host";
  const confirmationPlaceholderText =
    confirmationPlaceholder || "Confirmation or booking code";
  const referencePlaceholderText = referencePlaceholder || "Reference";
  const seatPlaceholderText = seatPlaceholder || "Seat info";
  const referenceLabelText = referenceLabel || "Reference";
  const seatLabelText = seatLabel || "Seat";
  const showReferenceField = Boolean(referenceLabel);
  const showSeatField = Boolean(createFormTypeConfig.showSeatInput);

  const smartFillDateCandidate =
    smartFillDate ||
    (segmentForm.startTime ? segmentForm.startTime.slice(0, 10) : undefined);

  const departureAirportValue = getEndpointFieldValueFromState(
    segmentForm,
    "departure",
    "airport",
    segmentForm.locationName
  );
  const departureTerminalValue = getEndpointFieldValueFromState(
    segmentForm,
    "departure",
    "terminal"
  );
  const departureGateValue = getEndpointFieldValueFromState(
    segmentForm,
    "departure",
    "gate"
  );
  const departureTimezoneValue = getEndpointFieldValueFromState(
    segmentForm,
    "departure",
    "timezone"
  );
  const arrivalAirportValue = getEndpointFieldValueFromState(
    segmentForm,
    "arrival",
    "airport",
    segmentForm.locationAddress
  );
  const arrivalTerminalValue = getEndpointFieldValueFromState(
    segmentForm,
    "arrival",
    "terminal"
  );
  const arrivalGateValue = getEndpointFieldValueFromState(
    segmentForm,
    "arrival",
    "gate"
  );
  const arrivalTimezoneValue = getEndpointFieldValueFromState(
    segmentForm,
    "arrival",
    "timezone"
  );

  const handleSmartFill = useCallback(async () => {
    setSmartFillError(null);
    if (!segmentForm.type) {
      setSmartFillError("Select a segment type first.");
      return;
    }
    if (!smartFillSupported) {
      setSmartFillError(
        "Smart fill is only available for flights, trains, stays, meals, and activities right now."
      );
      return;
    }

    const fallbackQuery =
      segmentForm.transportNumber.trim() ||
      segmentForm.title.trim() ||
      segmentForm.locationName.trim();
    const query = smartFillInput.trim() || fallbackQuery;
    if (!query) {
      setSmartFillError("Add a quick description or code to smart fill.");
      return;
    }

    const latValue = Number.parseFloat(segmentForm.locationLat);
    const lngValue = Number.parseFloat(segmentForm.locationLng);
    const hasContext = Number.isFinite(latValue) && Number.isFinite(lngValue);
    const autofillType = toAutofillType(segmentForm.type);

    setSmartFillLoading(true);
    try {
      const response = await fetch("/api/segments/autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: autofillType,
          query,
          date: smartFillDateCandidate,
          context: hasContext
            ? { lat: latValue, lng: lngValue, radiusMeters: 20000 }
            : undefined,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          (payload as { error?: string })?.error ||
            "Unable to fetch smart fill data."
        );
      }

      const suggestion = (payload as { data?: SegmentAutofillSuggestion })
        ?.data;
      if (!suggestion) {
        throw new Error("No suggestions were returned for that input.");
      }

      setSegmentForm((prev) => mergeSmartSuggestion(prev, suggestion));
      setSmartFillSuggestion(suggestion);
      setSmartFillError(null);
      onFeedback?.({
        type: "success",
        text: "Smart fill applied. Feel free to tweak the details.",
      });
    } catch (error) {
      setSmartFillError(
        error instanceof Error
          ? error.message
          : "Unable to complete smart fill."
      );
    } finally {
      setSmartFillLoading(false);
    }
  }, [
    segmentForm,
    smartFillInput,
    smartFillSupported,
    smartFillDateCandidate,
    onFeedback,
  ]);

  const clearSmartFillSuggestion = useCallback(() => {
    setSmartFillSuggestion(null);
    setSmartFillError(null);
  }, []);

  const handleCreateSegment = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!userId || !itineraryId) {
        onFeedback?.({
          type: "error",
          text: "You need to select an itinerary first.",
        });
        return;
      }
      if (!segmentForm.title.trim()) {
        onFeedback?.({ type: "error", text: "Segment title is required." });
        return;
      }

      setCreatingSegment(true);
      try {
        const latValue = Number.parseFloat(segmentForm.locationLat);
        const lngValue = Number.parseFloat(segmentForm.locationLng);
        const metadataPayload = buildMetadataPayload(segmentForm);
        const costAmountValue = parseUsdCostInput(segmentForm.costAmount);

        const response = await fetch(
          `/api/itineraries/${encodeURIComponent(itineraryId)}/segments`,
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
              location_address: segmentForm.locationAddress.trim() || null,
              location_lat: Number.isFinite(latValue) ? latValue : null,
              location_lng: Number.isFinite(lngValue) ? lngValue : null,
              start_time: segmentForm.startTime || null,
              end_time: segmentForm.endTime || null,
              is_all_day: segmentForm.isAllDay,
              provider_name: segmentForm.providerName.trim() || null,
              confirmation_code: segmentForm.confirmationCode.trim() || null,
              transport_number: segmentForm.transportNumber.trim() || null,
              seat_info: segmentForm.seatInfo.trim() || null,
              timezone: segmentForm.timezone || DEFAULT_TIMEZONE,
              cost_amount: costAmountValue,
              cost_currency: costAmountValue !== null ? "USD" : null,
              metadata: metadataPayload,
            }),
          }
        );

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error || "Failed to create segment");
        }

        onFeedback?.({
          type: "success",
          text: "Segment added to your itinerary!",
        });
        await onSegmentCreated?.();
        handleClose();
      } catch (error) {
        onFeedback?.({
          type: "error",
          text:
            error instanceof Error && error.message
              ? error.message
              : "Unable to create segment.",
        });
      } finally {
        setCreatingSegment(false);
      }
    },
    [
      userId,
      itineraryId,
      segmentForm,
      onSegmentCreated,
      onFeedback,
      handleClose,
    ]
  );

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div className="relative w-full max-w-4xl lg:max-w-5xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-800">
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 px-8 py-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Add New Segment
          </h3>
          <button
            type="button"
            onClick={handleClose}
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
        <form onSubmit={handleCreateSegment} className="p-6 lg:p-8 space-y-6">
          {smartFillSupported && (
            <div className="rounded-2xl border border-dashed border-blue-200/70 dark:border-blue-800/70 bg-blue-50/50 dark:bg-blue-900/10 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                    Smart fill
                  </p>
                  <p className="text-xs text-blue-700/80 dark:text-blue-200/70">
                    Use free data sources to pre-fill this segment, then tweak
                    anything.
                  </p>
                </div>
                {smartFillSuggestion && (
                  <button
                    type="button"
                    onClick={clearSmartFillSuggestion}
                    className="text-xs font-semibold text-blue-700 hover:text-blue-900 dark:text-blue-300"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  value={smartFillInput}
                  onChange={(event) => setSmartFillInput(event.target.value)}
                  placeholder={smartFillPlaceholder}
                  className="w-full rounded-lg border border-blue-200/70 dark:border-blue-800/70 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={smartFillDate}
                    onChange={(event) => setSmartFillDate(event.target.value)}
                    className="flex-1 rounded-lg border border-blue-200/70 dark:border-blue-800/70 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleSmartFill}
                    disabled={smartFillLoading}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    {smartFillLoading ? "Filling..." : "Auto fill"}
                  </button>
                </div>
              </div>
              {smartFillError && (
                <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                  {smartFillError}
                </p>
              )}
              {smartFillSuggestion && (
                <div className="rounded-xl border border-blue-200/70 dark:border-blue-800/70 bg-white/80 dark:bg-gray-900/40 px-3 py-3">
                  <p className="text-xs font-semibold text-blue-900 dark:text-blue-100">
                    Filled via {smartFillSuggestion.source ?? "smart fill"}
                  </p>
                  {smartFillSuggestion.highlights?.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {smartFillSuggestion.highlights!.map((highlight) => (
                        <span
                          key={`${highlight.label}-${highlight.value}`}
                          className="inline-flex items-center rounded-full bg-blue-100/70 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                        >
                          <span className="mr-1 text-blue-500">●</span>
                          {highlight.label}: {highlight.value}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-blue-900/70 dark:text-blue-200/70">
                      We filled the available fields – you can still edit before
                      saving.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Type
              </label>
              <select
                value={segmentForm.type}
                onChange={(event) =>
                  setSegmentForm((prev) => ({
                    ...prev,
                    type: event.target.value as SegmentType,
                  }))
                }
                className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SEGMENT_TYPE_OPTIONS.map((typeOption) => (
                  <option key={typeOption.value} value={typeOption.value}>
                    {typeOption.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-2xl dark:border-gray-700 px-4 text-xs text-gray-500 dark:text-gray-400">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={segmentForm.title}
                  onChange={(event) =>
                    setSegmentForm((prev) => ({
                      ...prev,
                      title: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={titlePlaceholderText}
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Cost (USD)
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm font-semibold text-gray-500 dark:text-gray-400">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={segmentForm.costAmount}
                  onChange={(event) =>
                    setSegmentForm((prev) => ({
                      ...prev,
                      costAmount: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 pl-7 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-950/40 p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
                  Location & timing
                </p>
                {segmentForm.locationAddress && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {segmentForm.locationAddress}
                  </span>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {locationLabelText}
                  </label>
                  <input
                    type="text"
                    value={segmentForm.locationName}
                    onChange={(event) =>
                      setSegmentForm((prev) => ({
                        ...prev,
                        locationName: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={locationPlaceholderText}
                  />
                </div>
                {isFlightSegment && (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/40 px-4 py-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
                          Departure
                        </p>
                        <span className="text-[11px] text-gray-400 dark:text-gray-500">
                          Takeoff details
                        </span>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Airport or city
                        </label>
                        <input
                          type="text"
                          value={departureAirportValue}
                          onChange={(event) =>
                            handleEndpointFieldChange(
                              "departure",
                              "airport",
                              event.target.value
                            )
                          }
                          className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="e.g., SFO · International"
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Terminal
                          </label>
                          <input
                            type="text"
                            value={departureTerminalValue}
                            onChange={(event) =>
                              handleEndpointFieldChange(
                                "departure",
                                "terminal",
                                event.target.value
                              )
                            }
                            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Terminal / concourse"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Gate
                          </label>
                          <input
                            type="text"
                            value={departureGateValue}
                            onChange={(event) =>
                              handleEndpointFieldChange(
                                "departure",
                                "gate",
                                event.target.value
                              )
                            }
                            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Gate"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Timezone
                        </label>
                        <input
                          type="text"
                          value={departureTimezoneValue}
                          onChange={(event) =>
                            handleEndpointFieldChange(
                              "departure",
                              "timezone",
                              event.target.value
                            )
                          }
                          className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="America/Los_Angeles"
                        />
                      </div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/40 px-4 py-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
                          Arrival
                        </p>
                        <span className="text-[11px] text-gray-400 dark:text-gray-500">
                          Landing details
                        </span>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Airport or city
                        </label>
                        <input
                          type="text"
                          value={arrivalAirportValue}
                          onChange={(event) =>
                            handleEndpointFieldChange(
                              "arrival",
                              "airport",
                              event.target.value
                            )
                          }
                          className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="e.g., NRT · Terminal 1"
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Terminal
                          </label>
                          <input
                            type="text"
                            value={arrivalTerminalValue}
                            onChange={(event) =>
                              handleEndpointFieldChange(
                                "arrival",
                                "terminal",
                                event.target.value
                              )
                            }
                            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Terminal / concourse"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Gate
                          </label>
                          <input
                            type="text"
                            value={arrivalGateValue}
                            onChange={(event) =>
                              handleEndpointFieldChange(
                                "arrival",
                                "gate",
                                event.target.value
                              )
                            }
                            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Gate"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Timezone
                        </label>
                        <input
                          type="text"
                          value={arrivalTimezoneValue}
                          onChange={(event) =>
                            handleEndpointFieldChange(
                              "arrival",
                              "timezone",
                              event.target.value
                            )
                          }
                          className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Asia/Tokyo"
                        />
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Start time
                    </label>
                    <input
                      type="datetime-local"
                      value={segmentForm.startTime}
                      onChange={(event) =>
                        setSegmentForm((prev) => ({
                          ...prev,
                          startTime: event.target.value,
                        }))
                      }
                      disabled={segmentForm.isAllDay}
                      className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      End time
                    </label>
                    <input
                      type="datetime-local"
                      value={segmentForm.endTime}
                      onChange={(event) =>
                        setSegmentForm((prev) => ({
                          ...prev,
                          endTime: event.target.value,
                        }))
                      }
                      disabled={segmentForm.isAllDay}
                      className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-950/40 p-4 sm:p-5 space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description
                  </label>
                  <textarea
                    value={segmentForm.description}
                    onChange={(event) =>
                      setSegmentForm((prev) => ({
                        ...prev,
                        description: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={descriptionPlaceholderText}
                    rows={4}
                  />
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {providerLabelText}
                    </label>
                    <input
                      type="text"
                      value={segmentForm.providerName}
                      onChange={(event) =>
                        setSegmentForm((prev) => ({
                          ...prev,
                          providerName: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={providerPlaceholderText}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {confirmationLabelText}
                    </label>
                    <input
                      type="text"
                      value={segmentForm.confirmationCode}
                      onChange={(event) =>
                        setSegmentForm((prev) => ({
                          ...prev,
                          confirmationCode: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={confirmationPlaceholderText}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Reference / number
                    </label>
                    <input
                      type="text"
                      value={segmentForm.transportNumber}
                      onChange={(event) =>
                        setSegmentForm((prev) => ({
                          ...prev,
                          transportNumber: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Ticket, booking, or reference"
                    />
                  </div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {showReferenceField && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {referenceLabelText}
                    </label>
                    <input
                      type="text"
                      value={segmentForm.transportNumber}
                      onChange={(event) =>
                        setSegmentForm((prev) => ({
                          ...prev,
                          transportNumber: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={referencePlaceholderText}
                    />
                  </div>
                )}
                {showSeatField && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {seatLabelText}
                    </label>
                    <input
                      type="text"
                      value={segmentForm.seatInfo}
                      onChange={(event) =>
                        setSegmentForm((prev) => ({
                          ...prev,
                          seatInfo: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={seatPlaceholderText}
                    />
                  </div>
                )}
              </div>
            </section>

            {showLegsEditor && (
              <section className="rounded-2xl border border-blue-200/70 dark:border-blue-800/70 bg-white/60 dark:bg-gray-950/40 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-500/70">
                      Hops & legs
                    </p>
                    <p className="text-xs text-blue-900/70 dark:text-blue-200/70">
                      Break the route into specific hops.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setLegsExpanded((prev) => !prev)}
                      className="inline-flex items-center rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm hover:bg-blue-50 dark:bg-blue-900/30 dark:text-blue-100"
                    >
                      {legsExpanded ? "Hide" : "Show"} legs
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateLegAdd}
                      className="inline-flex items-center rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm hover:bg-blue-50 dark:bg-blue-900/30 dark:text-blue-100"
                    >
                      + Add leg
                    </button>
                  </div>
                </div>
                {legsExpanded && (
                  <div className="mt-4 space-y-4">
                    {segmentForm.legs.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-blue-200/80 dark:border-blue-800/60 bg-white dark:bg-gray-950/70 p-6 text-center text-sm text-blue-600 dark:text-blue-200">
                        No legs yet — add hops to keep connections clear.
                      </div>
                    ) : (
                      segmentForm.legs.map((leg, index) => (
                        <div
                          key={leg.id}
                          className="rounded-2xl border border-blue-200/70 dark:border-blue-800/60 bg-white dark:bg-gray-950/70 p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                              Leg {index + 1}
                            </p>
                            <button
                              type="button"
                              onClick={() => handleCreateLegRemove(leg.id)}
                              disabled={segmentForm.legs.length === 1}
                              className="text-xs font-semibold text-red-500 disabled:text-gray-400"
                            >
                              Remove
                            </button>
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                                Origin
                              </label>
                              <input
                                type="text"
                                value={leg.origin}
                                onChange={(event) =>
                                  handleCreateLegChange(
                                    leg.id,
                                    "origin",
                                    event.target.value
                                  )
                                }
                                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Airport or station"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                                Destination
                              </label>
                              <input
                                type="text"
                                value={leg.destination}
                                onChange={(event) =>
                                  handleCreateLegChange(
                                    leg.id,
                                    "destination",
                                    event.target.value
                                  )
                                }
                                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Airport or station"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                                Departure
                              </label>
                              <input
                                type="datetime-local"
                                value={leg.departureTime}
                                onChange={(event) =>
                                  handleCreateLegChange(
                                    leg.id,
                                    "departureTime",
                                    event.target.value
                                  )
                                }
                                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                                Arrival
                              </label>
                              <input
                                type="datetime-local"
                                value={leg.arrivalTime}
                                onChange={(event) =>
                                  handleCreateLegChange(
                                    leg.id,
                                    "arrivalTime",
                                    event.target.value
                                  )
                                }
                                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                                Carrier
                              </label>
                              <input
                                type="text"
                                value={leg.carrier}
                                onChange={(event) =>
                                  handleCreateLegChange(
                                    leg.id,
                                    "carrier",
                                    event.target.value
                                  )
                                }
                                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Airline / rail"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                                Number
                              </label>
                              <input
                                type="text"
                                value={leg.number}
                                onChange={(event) =>
                                  handleCreateLegChange(
                                    leg.id,
                                    "number",
                                    event.target.value
                                  )
                                }
                                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="UA 120"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                                Seat
                              </label>
                              <input
                                type="text"
                                value={leg.seat}
                                onChange={(event) =>
                                  handleCreateLegChange(
                                    leg.id,
                                    "seat",
                                    event.target.value
                                  )
                                }
                                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="12A"
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </section>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
            <button
              type="button"
              onClick={handleClose}
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
  );
}
