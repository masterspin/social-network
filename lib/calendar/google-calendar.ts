import { Database } from "@/types/supabase";

type SegmentRow = Database["public"]["Tables"]["itinerary_segments"]["Row"];

/**
 * Generate a Google Calendar URL for a single segment
 */
export function generateGoogleCalendarUrl(segment: SegmentRow): string {
    const baseUrl = "https://calendar.google.com/calendar/render";

    const params = new URLSearchParams();
    params.set("action", "TEMPLATE");

    // Title
    params.set("text", segment.title || "Itinerary Event");

    // Dates - Google Calendar expects format: YYYYMMDDTHHmmssZ
    if (segment.start_time) {
        const startDate = new Date(segment.start_time);
        params.set("dates", formatGoogleCalendarDate(startDate, segment.end_time));
    }

    // Location
    if (segment.location_name || segment.location_address) {
        params.set("location", segment.location_address || segment.location_name || "");
    }

    // Description - include all relevant details
    const description = buildSegmentDescription(segment);
    if (description) {
        params.set("details", description);
    }

    return `${baseUrl}?${params.toString()}`;
}

/**
 * Format dates for Google Calendar
 * Format: YYYYMMDDTHHmmssZ/YYYYMMDDTHHmmssZ
 */
function formatGoogleCalendarDate(startTime: Date, endTime?: string | null): string {
    const start = startTime.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

    if (endTime) {
        const end = new Date(endTime).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
        return `${start}/${end}`;
    }

    // Default to 1 hour duration if no end time
    const defaultEnd = new Date(startTime.getTime() + 60 * 60 * 1000);
    const end = defaultEnd.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    return `${start}/${end}`;
}

/**
 * Build detailed description for the calendar event
 */
function buildSegmentDescription(segment: SegmentRow): string {
    const lines: string[] = [];

    // Type
    lines.push(`Type: ${segment.type.charAt(0).toUpperCase() + segment.type.slice(1)}`);

    // Provider/Airline
    if (segment.provider_name) {
        lines.push(`Provider: ${segment.provider_name}`);
    }

    // Flight/Transport number
    if (segment.transport_number) {
        lines.push(`${segment.type === "flight" ? "Flight" : "Transport"} Number: ${segment.transport_number}`);
    }

    // Confirmation code
    if (segment.confirmation_code) {
        lines.push(`Confirmation: ${segment.confirmation_code}`);
    }

    // Seat info
    if (segment.seat_info) {
        lines.push(`Seat: ${segment.seat_info}`);
    }

    // Cost
    if (segment.cost_amount) {
        lines.push(`Cost: $${segment.cost_amount}`);
    }

    // Location details
    if (segment.location_name && segment.location_address) {
        lines.push(`\nLocation: ${segment.location_name}`);
        lines.push(`Address: ${segment.location_address}`);
    }

    // Parse metadata for additional details
    if (segment.metadata && typeof segment.metadata === "object") {
        const metadata = segment.metadata as Record<string, any>;

        // Flight-specific details
        if (segment.type === "flight") {
            const departure = metadata.departure as Record<string, any> | undefined;
            const arrival = metadata.arrival as Record<string, any> | undefined;

            if (departure) {
                lines.push(`\nDeparture:`);
                if (departure.airport) lines.push(`  Airport: ${departure.airport}`);
                if (departure.terminal) lines.push(`  Terminal: ${departure.terminal}`);
                if (departure.gate) lines.push(`  Gate: ${departure.gate}`);
            }

            if (arrival) {
                lines.push(`\nArrival:`);
                if (arrival.airport) lines.push(`  Airport: ${arrival.airport}`);
                if (arrival.terminal) lines.push(`  Terminal: ${arrival.terminal}`);
                if (arrival.gate) lines.push(`  Gate: ${arrival.gate}`);
            }

            // Multi-leg flights
            if (Array.isArray(metadata.legs) && metadata.legs.length > 0) {
                lines.push(`\nFlight Legs:`);
                metadata.legs.forEach((leg: any, idx: number) => {
                    lines.push(`  Leg ${idx + 1}: ${leg.origin || ""} → ${leg.destination || ""}`);
                    if (leg.carrier && leg.number) {
                        lines.push(`    ${leg.carrier}${leg.number}`);
                    }
                });
            }
        }

        // Hotel-specific details
        if (segment.type === "stay" && metadata.checkin && metadata.checkout) {
            lines.push(`\nCheck-in: ${metadata.checkin}`);
            lines.push(`Check-out: ${metadata.checkout}`);
        }
    }

    return lines.join("\n");
}

/**
 * Generate URLs for all segments in an itinerary
 */
export function generateAllSegmentsCalendarUrls(segments: SegmentRow[]): Array<{
    segment: SegmentRow;
    url: string;
}> {
    return segments
        .filter(seg => seg.start_time) // Only segments with start times
        .map(segment => ({
            segment,
            url: generateGoogleCalendarUrl(segment),
        }));
}

/**
 * Open multiple Google Calendar tabs (one for each segment)
 * Note: Browsers may block multiple popups, so this opens them sequentially with delays
 */
export function addAllToGoogleCalendar(segments: SegmentRow[]): void {
    const calendarUrls = generateAllSegmentsCalendarUrls(segments);

    if (calendarUrls.length === 0) {
        alert("No segments with dates to add to calendar");
        return;
    }

    // Open first one immediately
    window.open(calendarUrls[0].url, "_blank");

    // Open rest with delays to avoid popup blocker
    calendarUrls.slice(1).forEach((item, index) => {
        setTimeout(() => {
            window.open(item.url, "_blank");
        }, (index + 1) * 500); // 500ms delay between each
    });
}
