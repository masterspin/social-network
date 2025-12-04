-- Migration to remove unused privacy columns from users table
-- Run this in your Supabase SQL Editor

-- First, drop the RLS policies that reference these columns
DROP POLICY IF EXISTS "Users can view profiles based on connection distance" ON users;
DROP POLICY IF EXISTS "Users can view social links based on user visibility" ON social_links;

-- Drop the columns
ALTER TABLE users 
  DROP COLUMN IF EXISTS visibility_level,
  DROP COLUMN IF EXISTS show_profile_image,
  DROP COLUMN IF EXISTS show_full_name,
  DROP COLUMN IF EXISTS show_gender,
  DROP COLUMN IF EXISTS show_social_links;

-- Recreate the RLS policy for users without visibility_level check
CREATE POLICY "Users can view profiles based on connection distance"
  ON users FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      -- Can always see yourself
      id = auth.uid() 
      OR
      -- Can see others if not blocked
      (
        NOT EXISTS (
          SELECT 1 FROM blocked_users 
          WHERE (blocker_id = id AND blocked_id = auth.uid())
            OR (blocker_id = auth.uid() AND blocked_id = id)
        )
      )
    )
  );

-- Recreate the social links policy without show_social_links check
CREATE POLICY "Users can view social links based on user visibility"
  ON social_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = social_links.user_id
    )
  );
