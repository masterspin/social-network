export type SegmentAutofillType =
  | "flight"
  | "train"
  | "hotel"
  | "meal"
  | "activity"
  | "transport"
  | "custom";

export type SegmentAutofillRequest = {
  type: SegmentAutofillType;
  query: string;
  date?: string;
  context?: {
    lat?: number;
    lng?: number;
    timezone?: string;
    radiusMeters?: number;
  } | null;
  metadata?: Record<string, unknown> | null;
};

export type SegmentAutofillHighlight = {
  label: string;
  value: string;
};

export type SegmentAutofillSuggestion = {
  type: SegmentAutofillType;
  title?: string | null;
  description?: string | null;
  location_name?: string | null;
  location_address?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  is_all_day?: boolean | null;
  provider_name?: string | null;
  confirmation_code?: string | null;
  transport_number?: string | null;
  timezone?: string | null;
  metadata?: Record<string, unknown> | null;
  highlights?: SegmentAutofillHighlight[] | null;
  source?: string | null;
};

export type PlanAction =
  | { type: "create"; segment: SegmentAutofillSuggestion }
  | { type: "delete"; segmentId: string };

export type SegmentAutofillPlan = {
  title: string;
  description?: string;
  actions: PlanAction[];
};
