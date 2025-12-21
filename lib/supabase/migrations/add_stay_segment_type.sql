-- Add 'stay' to the allowed segment types in itinerary_segments table
ALTER TABLE itinerary_segments
DROP CONSTRAINT IF EXISTS itinerary_segments_type_check;

ALTER TABLE itinerary_segments
ADD CONSTRAINT itinerary_segments_type_check
CHECK (type IN ('flight', 'stay'));
