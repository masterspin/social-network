"use client";

import { useState } from "react";

interface AddFlightModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: FlightFormData) => Promise<void>;
  smartFillEnabled?: boolean;
  onSmartFill?: (query: string, date: string) => Promise<void>;
  smartFillSuggestion?: {
    source?: string;
    highlights?: Array<{ label: string; value: string }>;
  } | null;
  onClearSmartFill?: () => void;
  smartFillLoading?: boolean;
  smartFillError?: string | null;
}

export interface FlightFormData {
  type: "flight";
  title: string;
  description: string;
  costAmount: string;
  // Departure
  departureAirport: string;
  departureTerminal: string;
  departureGate: string;
  departureTime: string;
  departureTimezone: string;
  // Arrival
  arrivalAirport: string;
  arrivalTerminal: string;
  arrivalGate: string;
  arrivalTime: string;
  arrivalTimezone: string;
  // Info
  airline: string;
  confirmationCode: string;
  flightNumber: string;
  seatInfo: string;
}

export default function AddFlightModal({
  isOpen,
  onClose,
  onSubmit,
  smartFillEnabled = false,
  onSmartFill,
  smartFillSuggestion,
  onClearSmartFill,
  smartFillLoading = false,
  smartFillError = null,
}: AddFlightModalProps) {
  const [formData, setFormData] = useState<FlightFormData>({
    type: "flight",
    title: "",
    description: "",
    costAmount: "",
    departureAirport: "",
    departureTerminal: "",
    departureGate: "",
    departureTime: "",
    departureTimezone: "",
    arrivalAirport: "",
    arrivalTerminal: "",
    arrivalGate: "",
    arrivalTime: "",
    arrivalTimezone: "",
    airline: "",
    confirmationCode: "",
    flightNumber: "",
    seatInfo: "",
  });

  const [smartFillInput, setSmartFillInput] = useState("");
  const [smartFillDate, setSmartFillDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      alert("Please enter a title");
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      // Reset form
      setFormData({
        type: "flight",
        title: "",
        description: "",
        costAmount: "",
        departureAirport: "",
        departureTerminal: "",
        departureGate: "",
        departureTime: "",
        departureTimezone: "",
        arrivalAirport: "",
        arrivalTerminal: "",
        arrivalGate: "",
        arrivalTime: "",
        arrivalTimezone: "",
        airline: "",
        confirmationCode: "",
        flightNumber: "",
        seatInfo: "",
      });
      onClose();
    } catch (error) {
      console.error("Error submitting form:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSmartFill = async () => {
    if (onSmartFill) {
      await onSmartFill(smartFillInput, smartFillDate);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-4xl lg:max-w-5xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-800">
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 px-8 py-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Add Flight Segment
          </h3>
          <button
            type="button"
            onClick={onClose}
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

        <form onSubmit={handleSubmit} className="p-6 lg:p-8 space-y-6">
          {smartFillEnabled && (
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
                {smartFillSuggestion && onClearSmartFill && (
                  <button
                    type="button"
                    onClick={onClearSmartFill}
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
                  onChange={(e) => setSmartFillInput(e.target.value)}
                  placeholder="Flight number · e.g., UA 120"
                  className="w-full rounded-lg border border-blue-200/70 dark:border-blue-800/70 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={smartFillDate}
                    onChange={(e) => setSmartFillDate(e.target.value)}
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
            </div>
          )}

          {/* Title and Cost */}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, title: e.target.value }))
                }
                className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="UA120 · SFO → NRT"
                required
              />
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
                  value={formData.costAmount}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      costAmount: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 pl-7 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          {/* Location & Timing */}
          <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-950/40 p-4 sm:p-5 space-y-4">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
              Location & timing
            </p>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {/* Departure */}
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
                    value={formData.departureAirport}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        departureAirport: e.target.value,
                      }))
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
                      value={formData.departureTerminal}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          departureTerminal: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Terminal"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Gate
                    </label>
                    <input
                      type="text"
                      value={formData.departureGate}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          departureGate: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Gate"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Date & time
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.departureTime}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        departureTime: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Timezone
                  </label>
                  <input
                    type="text"
                    value={formData.departureTimezone}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        departureTimezone: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="America/Los_Angeles"
                  />
                </div>
              </div>

              {/* Arrival */}
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
                    value={formData.arrivalAirport}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        arrivalAirport: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Haneda · Terminal 3"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Terminal
                    </label>
                    <input
                      type="text"
                      value={formData.arrivalTerminal}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          arrivalTerminal: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Terminal"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Gate / carousel
                    </label>
                    <input
                      type="text"
                      value={formData.arrivalGate}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          arrivalGate: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Gate or belt"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Date & time
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.arrivalTime}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        arrivalTime: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Timezone
                  </label>
                  <input
                    type="text"
                    value={formData.arrivalTimezone}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        arrivalTimezone: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Asia/Tokyo"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Info */}
          <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-950/40 p-4 sm:p-5 space-y-4">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
              Info
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Airline
                </label>
                <input
                  type="text"
                  value={formData.airline}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      airline: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="United Airlines"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Confirmation
                </label>
                <input
                  type="text"
                  value={formData.confirmationCode}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      confirmationCode: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="ABC123"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Flight number
                </label>
                <input
                  type="text"
                  value={formData.flightNumber}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      flightNumber: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="UA 120"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Seat / Cabin
                </label>
                <input
                  type="text"
                  value={formData.seatInfo}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      seatInfo: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="12A · Polaris"
                />
              </div>
            </div>
          </section>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Adding..." : "Add Flight"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
