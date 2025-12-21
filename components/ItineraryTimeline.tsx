"use client";

import React, { useMemo } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { Database } from "@/types/supabase";
import {
    Plane,
    Hotel,
    Car,
    Star,
    Utensils,
    CircleDot,
    Calendar as CalendarIcon,
    MapPin,
    Clock,
} from "lucide-react";

type SegmentRow = Database["public"]["Tables"]["itinerary_segments"]["Row"];

interface ItineraryTimelineProps {
    segments: SegmentRow[];
    onSegmentClick?: (segment: SegmentRow) => void;
}

const TYPE_COLORS: Record<string, string> = {
    flight: "#0ea5e9", // sky-500
    stay: "#6366f1", // indigo-500
    transport: "#22c5e0", // green-500
    ground: "#22c5e0",
    custom: "#22c5e0",
    activity: "#f59e0b", // amber-500
    meal: "#f43f5e", // rose-500
    other: "#3b82f6", // blue-500
};

const TYPE_ICONS: Record<string, React.ElementType> = {
    flight: Plane,
    stay: Hotel,
    transport: Car,
    ground: Car,
    custom: Car,
    activity: Star,
    meal: Utensils,
    other: CircleDot,
};

export default function ItineraryTimeline({
    segments,
    onSegmentClick,
}: ItineraryTimelineProps) {
    const events = useMemo(() => {
        return (segments || []).map((seg) => {
            // Ensure start_time exists, otherwise default to now
            const start = seg.start_time ? new Date(seg.start_time) : new Date();

            let end = seg.end_time ? new Date(seg.end_time) : null;
            // Default duration 1 hour if no end time
            if (!end) {
                end = new Date(start.getTime() + 60 * 60 * 1000);
            }

            const type = seg.type?.toLowerCase() || "other";
            const color = TYPE_COLORS[type] || TYPE_COLORS["other"];

            return {
                id: seg.id,
                title: seg.title || "Untitled",
                start,
                end,
                backgroundColor: color,
                borderColor: color,
                extendedProps: {
                    segment: seg,
                    type: type,
                    location: seg.location_name || seg.location_address,
                },
            };
        });
    }, [segments]);

    // Determine initial date
    const initialDate = useMemo(() => {
        if (segments && segments.length > 0 && segments[0].start_time) {
            return new Date(segments[0].start_time);
        }
        return new Date();
    }, [segments]);

    // Calculate dynamic time range for the day view (min/max hours)
    const { slotMinTime, slotMaxTime } = useMemo(() => {
        if (!segments || segments.length === 0)
            return { slotMinTime: "06:00:00", slotMaxTime: "24:00:00" };

        let minMinutes = 24 * 60;
        let maxMinutes = 0;

        for (const seg of segments) {
            const start = seg.start_time ? new Date(seg.start_time) : new Date();
            let end = seg.end_time ? new Date(seg.end_time) : null;
            if (!end) end = new Date(start.getTime() + 60 * 60 * 1000); // 1h default

            const isSameDay =
                start.getDate() === end.getDate() &&
                start.getMonth() === end.getMonth() &&
                start.getFullYear() === end.getFullYear();

            if (!isSameDay) {
                // Spans midnight: maximize range to ensure visibility of both
                // the late-night portion (day 1) and early-morning portion (day 2)
                minMinutes = 0;
                maxMinutes = 24 * 60;
                break;
            }

            const sM = start.getHours() * 60 + start.getMinutes();
            const eM = end.getHours() * 60 + end.getMinutes();

            if (sM < minMinutes) minMinutes = sM;
            if (eM > maxMinutes) maxMinutes = eM;
        }

        // Add buffer
        if (minMinutes > 0) minMinutes = Math.max(0, minMinutes - 60);
        if (maxMinutes < 24 * 60) maxMinutes = Math.min(24 * 60, maxMinutes + 60);

        // Minimum visible height (5 hours)
        if (maxMinutes - minMinutes < 5 * 60) {
            maxMinutes = Math.min(24 * 60, minMinutes + 5 * 60);
        }

        const formatTime = (minutes: number) => {
            const h = Math.floor(minutes / 60)
                .toString()
                .padStart(2, "0");
            const m = (minutes % 60).toString().padStart(2, "0");
            return `${h}:${m}:00`;
        };

        return {
            slotMinTime: formatTime(minMinutes),
            slotMaxTime: formatTime(maxMinutes),
        };
    }, [segments]);

    const renderEventContent = (eventInfo: any) => {
        const { event } = eventInfo;
        const { type, location } = event.extendedProps;
        const Icon = TYPE_ICONS[type] || CircleDot;
        const timeText = eventInfo.timeText;

        return (
            <div className="flex flex-col h-full w-full overflow-hidden p-0.5">
                <div className="flex items-center gap-1 text-xs font-bold leading-tight">
                    <Icon className="h-3 w-3 shrink-0" />
                    <span className="truncate">{event.title}</span>
                </div>
                <div className="mt-0.5 text-[10px] opacity-90 truncate flex items-center gap-1">
                    {timeText && <span>{timeText}</span>}
                </div>
                {location && (
                    <div className="mt-0.5 text-[10px] opacity-80 truncate flex items-center gap-1">
                        <MapPin className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{location}</span>
                    </div>
                )}
            </div>
        );
    };

    if (!segments || segments.length === 0) {
        return (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-12 text-center text-gray-500 dark:text-gray-400">
                <CalendarIcon className="h-10 w-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                <p>No segments to display on the calendar.</p>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shadow-sm p-4">
            <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView="timeGridWeek"
                headerToolbar={{
                    left: "prev,next today",
                    center: "title",
                    right: "dayGridMonth,timeGridWeek,timeGridDay",
                }}
                initialDate={initialDate}
                events={events}
                eventContent={renderEventContent}
                eventClick={(info) => {
                    if (onSegmentClick && info.event.extendedProps.segment) {
                        onSegmentClick(info.event.extendedProps.segment);
                    }
                }}
                height="800px"
                slotMinTime={slotMinTime}
                slotMaxTime={slotMaxTime}
                allDaySlot={false}
                nowIndicator={true}
                dayMaxEvents={true}
            />

            <style jsx global>{`
        /* General Calendar Variables */
        .fc {
          --fc-border-color: rgba(229, 231, 235, 0.5) !important; /* gray-200 with opacity */
          --fc-page-bg-color: #ffffff;
          --fc-neutral-bg-color: rgba(243, 244, 246, 0.5); /* gray-100 */
          --fc-list-event-hover-bg-color: #f3f4f6;
          --fc-today-bg-color: transparent !important; /* Remove default today highlight */
          --fc-now-indicator-color: #ef4444; /* red-500 */
          font-family: inherit;
        }

        .dark .fc {
          --fc-border-color: rgba(55, 65, 81, 0.4) !important; /* gray-700 with opacity */
          --fc-page-bg-color: #111827; /* gray-900 */
          --fc-neutral-bg-color: rgba(31, 41, 55, 0.5); /* gray-800 */
        }

        /* --- Toolbar Cleaning --- */
        .fc .fc-toolbar {
            margin-bottom: 1.5rem !important;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .fc .fc-toolbar-title {
            font-size: 1.25rem !important;
            font-weight: 700;
            color: #111827;
        }
        .dark .fc .fc-toolbar-title {
            color: #f3f4f6;
        }

        .fc .fc-button {
            background: transparent;
            border: 1px solid #e5e7eb;
            color: #4b5563;
            font-weight: 500;
            font-size: 0.875rem;
            padding: 0.4rem 0.8rem;
            border-radius: 0.5rem;
            box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
            transition: all 0.15s ease;
            text-transform: capitalize;
        }
        .dark .fc .fc-button {
            border-color: #374151;
            color: #d1d5db;
        }

        .fc .fc-button:hover {
            background-color: #f9fafb;
            color: #111827;
            border-color: #d1d5db;
        }
        .dark .fc .fc-button:hover {
            background-color: #1f2937;
            color: #f9fafb;
            border-color: #4b5563;
        }

        .fc .fc-button-primary:not(:disabled).fc-button-active,
        .fc .fc-button-primary:not(:disabled):active {
            background-color: #f3f4f6;
            color: #111827;
            border-color: #d1d5db;
            box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.06);
        }
        .dark .fc .fc-button-primary:not(:disabled).fc-button-active,
        .dark .fc .fc-button-primary:not(:disabled):active {
            background-color: #374151;
            color: #f9fafb;
            border-color: #4b5563;
        }

        .fc .fc-button:focus {
            box-shadow: none !important;
            ring: 2px solid #e5e7eb;
        }

        /* --- Grid & Cells --- */
        .fc-theme-standard td, .fc-theme-standard th {
            border-color: var(--fc-border-color);
        }
        
        /* Remove outer border only */
        .fc-theme-standard .fc-scrollgrid {
            border: none !important;
        }

        /* Header Cells */
        .fc-col-header-cell-cushion {
            padding-top: 10px !important;
            padding-bottom: 10px !important;
            font-size: 0.75rem;
            text-transform: uppercase;
            font-weight: 600;
            letter-spacing: 0.05em;
            color: #6b7280;
        }
        .dark .fc-col-header-cell-cushion {
            color: #9ca3af;
        }
        
        /* Cleaner Time Axis & Remove Horizontal Lines */
        .fc-timegrid-slot-label-cushion {
            font-size: 0.75rem;
            color: #9ca3af;
            font-weight: 500;
        }

        /* Hide horizontal grid lines */
        .fc-timegrid-slot, 
        .fc-timegrid-slot-lane,
        .fc-timegrid-slot-minor {
            border-top: none !important;
            border-bottom: none !important;
        }
        
        /* Keep vertical dividers for days */
        .fc-day-other .fc-timegrid-col-frame {
             /* maintain vertical structure */
        }
        
        /* Events */
        .fc-event {
            border: none !important;
            border-radius: 6px !important;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            transition: transform 0.1s ease, box-shadow 0.1s ease;
        }
        
        .fc-event:hover {
            transform: translateY(-1px);
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
            z-index: 50;
        }

        /* Today Column Highlight - subtle vertical gradient or just standard */
        .fc-day-today {
            background-color: rgba(249, 250, 251, 0.6) !important;
        }
        .dark .fc-day-today {
            background-color: rgba(31, 41, 55, 0.3) !important;
        }
        
        /* Now Indicator */
        .fc-timegrid-now-indicator-line {
            border-color: #ef4444;
            border-width: 2px;
        }
        .fc-timegrid-now-indicator-arrow {
            border-color: #ef4444;
            border-width: 5px;
        }

      `}</style>
        </div>
    );
}
