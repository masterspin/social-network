-- Change segment times from timestamptz to text to avoid timezone conversion
-- This allows storing times exactly as the user enters them

ALTER TABLE itinerary_segments 
  ALTER COLUMN start_time TYPE TEXT USING start_time::TEXT,
  ALTER COLUMN end_time TYPE TEXT USING end_time::TEXT;

-- Update the check constraint to work with text
ALTER TABLE itinerary_segments 
  DROP CONSTRAINT IF EXISTS itinerary_segments_start_time_check;

-- Note: We're removing the time ordering check since comparing text dates is unreliable
-- The application should handle validation
