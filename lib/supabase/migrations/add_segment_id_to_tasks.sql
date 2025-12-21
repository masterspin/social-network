-- Add segment_id to itinerary_tasks table to support segment-specific checklist items
ALTER TABLE itinerary_tasks
ADD COLUMN segment_id UUID REFERENCES itinerary_segments(id) ON DELETE CASCADE;

-- Create an index for faster queries by segment
CREATE INDEX idx_itinerary_tasks_segment_id ON itinerary_tasks(segment_id);

-- Update the status values to be simpler for checklist items
-- Keep the existing CHECK constraint but note that 'open' = not completed, 'done' = completed
