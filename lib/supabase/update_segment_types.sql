-- Rename this file to something that makes sense for your migration system or run in Supabase SQL Editor

-- 1. Drop the existing strict constraint
ALTER TABLE itinerary_segments
DROP CONSTRAINT IF EXISTS itinerary_segments_type_check;

-- 2. Add a new constraint that includes 'transport' and 'stay' (and keeps existing ones)
ALTER TABLE itinerary_segments
ADD CONSTRAINT itinerary_segments_type_check
CHECK (type IN (
  'flight', 
  'lodging', 
  'stay',      -- Added to support "stay" frontend type
  'ground', 
  'transport', -- Added to support "transport" frontend type
  'event', 
  'dining', 
  'cruise', 
  'note', 
  'custom'
));
