-- Fix foreign key relationships for connections table
-- This ensures Supabase can find the relationships in queries

-- Drop and recreate the connections table with properly named foreign keys
-- Note: This will preserve existing data by using ALTER TABLE instead of DROP

-- First, drop existing foreign key constraints if they exist
ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_requester_id_fkey;
ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_recipient_id_fkey;

-- Add foreign key constraints with explicit names
ALTER TABLE connections 
  ADD CONSTRAINT connections_requester_id_fkey 
  FOREIGN KEY (requester_id) 
  REFERENCES users(id) 
  ON DELETE CASCADE;

ALTER TABLE connections 
  ADD CONSTRAINT connections_recipient_id_fkey 
  FOREIGN KEY (recipient_id) 
  REFERENCES users(id) 
  ON DELETE CASCADE;

-- Add connection_type column if it doesn't exist (needed for color-coded network graph)
ALTER TABLE connections 
  ADD COLUMN IF NOT EXISTS connection_type TEXT DEFAULT 'first' 
  CHECK (connection_type IN ('first', 'one_point_five'));

-- Verify the constraints are created
-- You can check in Supabase dashboard under Table Editor > connections > Foreign Keys
