-- Social Network Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL, -- Unique handle/username
  name TEXT NOT NULL,
  preferred_name TEXT,
  gender TEXT,
  bio TEXT,
  profile_image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Social links table
CREATE TABLE IF NOT EXISTS social_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- e.g., 'instagram', 'twitter', 'linkedin', etc.
  url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

-- Connections table (edges in the graph)
CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID NOT NULL,
  recipient_id UUID NOT NULL,
  how_met TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  connection_type TEXT DEFAULT 'first' CHECK (connection_type IN ('first', 'one_point_five')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK (requester_id <> recipient_id),
  UNIQUE(requester_id, recipient_id),
  CONSTRAINT connections_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT connections_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Blocked users table
CREATE TABLE IF NOT EXISTS blocked_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_connections_requester_id ON connections(requester_id);
CREATE INDEX IF NOT EXISTS idx_connections_recipient_id ON connections(recipient_id);
CREATE INDEX IF NOT EXISTS idx_connections_status ON connections(status);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker_id ON blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked_id ON blocked_users(blocked_id);
CREATE INDEX IF NOT EXISTS idx_social_links_user_id ON social_links(user_id);

-- Function to calculate shortest path between users (BFS)
CREATE OR REPLACE FUNCTION calculate_connection_distance(
  from_user_id UUID,
  to_user_id UUID
) RETURNS INTEGER AS $$
DECLARE
  distance INTEGER := 0;
  current_level UUID[];
  next_level UUID[];
  visited UUID[] := ARRAY[]::UUID[];
  current_user UUID;
BEGIN
  -- Check if same user
  IF from_user_id = to_user_id THEN
    RETURN 0;
  END IF;

  -- Initialize with starting user
  current_level := ARRAY[from_user_id];
  visited := ARRAY[from_user_id];

  -- BFS loop
  WHILE array_length(current_level, 1) > 0 AND distance < 10 LOOP
    distance := distance + 1;
    next_level := ARRAY[]::UUID[];

    -- For each user in current level
    FOREACH current_user IN ARRAY current_level LOOP
      -- Check if we reached the target
      IF current_user = to_user_id THEN
        RETURN distance - 1;
      END IF;

      -- Get all connected users
      next_level := array_cat(
        next_level,
        ARRAY(
          SELECT CASE 
            WHEN requester_id = current_user THEN recipient_id
            ELSE requester_id
          END
          FROM connections
          WHERE status = 'accepted'
            AND (requester_id = current_user OR recipient_id = current_user)
            AND CASE 
              WHEN requester_id = current_user THEN recipient_id
              ELSE requester_id
            END != ALL(visited)
        )
      );
    END LOOP;

    -- Mark all as visited
    visited := array_cat(visited, next_level);
    current_level := next_level;
  END LOOP;

  -- No connection found
  RETURN -1;
END;
$$ LANGUAGE plpgsql;

-- Row Level Security Policies

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view their own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

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

CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Social links policies
CREATE POLICY "Users can view social links based on user visibility"
  ON social_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = social_links.user_id
    )
  );

CREATE POLICY "Users can manage their own social links"
  ON social_links FOR ALL
  USING (auth.uid() = user_id);

-- Connections policies
CREATE POLICY "Users can view their connections"
  ON connections FOR SELECT
  USING (
    auth.uid() IN (requester_id, recipient_id)
    AND NOT EXISTS (
      SELECT 1 FROM blocked_users 
      WHERE (blocker_id = requester_id AND blocked_id = auth.uid())
        OR (blocker_id = recipient_id AND blocked_id = auth.uid())
        OR (blocker_id = auth.uid() AND blocked_id IN (requester_id, recipient_id))
    )
  );

CREATE POLICY "Users can view accepted connections in their network"
  ON connections FOR SELECT
  USING (
    status = 'accepted'
    AND NOT EXISTS (
      SELECT 1 FROM blocked_users 
      WHERE (blocker_id = requester_id AND blocked_id = auth.uid())
        OR (blocker_id = recipient_id AND blocked_id = auth.uid())
        OR (blocker_id = auth.uid() AND blocked_id IN (requester_id, recipient_id))
    )
  );

CREATE POLICY "Users can create connections"
  ON connections FOR INSERT
  WITH CHECK (auth.uid() IN (requester_id, recipient_id));

CREATE POLICY "Users can update their connection requests"
  ON connections FOR UPDATE
  USING (auth.uid() IN (requester_id, recipient_id));

-- Blocked users policies
CREATE POLICY "Users can view their own block list"
  ON blocked_users FOR SELECT
  USING (auth.uid() = blocker_id);

CREATE POLICY "Users can manage their own block list"
  ON blocked_users FOR ALL
  USING (auth.uid() = blocker_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_connections_updated_at
  BEFORE UPDATE ON connections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- High-level travel itinerary feature (see migrations/add_itinerary_feature.sql for full policies)

CREATE TABLE IF NOT EXISTS itineraries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  summary TEXT,
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  timezone TEXT,
  visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'shared', 'public')),
  status TEXT DEFAULT 'planning' CHECK (status IN ('planning', 'confirmed', 'completed', 'cancelled')),
  cover_image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS itinerary_travelers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email TEXT,
  role TEXT DEFAULT 'traveler' CHECK (role IN ('owner', 'traveler', 'viewer')),
  invitation_status TEXT DEFAULT 'pending' CHECK (invitation_status IN ('pending', 'accepted', 'declined')),
  color_hex TEXT,
  is_favorite BOOLEAN DEFAULT FALSE,
  notifications_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK (user_id IS NOT NULL OR email IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS itinerary_segments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('flight', 'lodging', 'ground', 'event', 'dining', 'cruise', 'note', 'custom')),
  title TEXT NOT NULL,
  description TEXT,
  location_name TEXT,
  location_address TEXT,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,
  is_all_day BOOLEAN DEFAULT FALSE,
  provider_name TEXT,
  confirmation_code TEXT,
  transport_number TEXT,
  seat_info TEXT,
  reminder_offset_minutes INTEGER,
  metadata JSONB DEFAULT '{}'::JSONB,
  cost_amount NUMERIC(12, 2),
  cost_currency TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK (start_time IS NULL OR end_time IS NULL OR end_time >= start_time)
);

CREATE TABLE IF NOT EXISTS itinerary_checklists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS itinerary_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  checklist_id UUID REFERENCES itinerary_checklists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  due_at TIMESTAMP WITH TIME ZONE,
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS itinerary_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  segment_id UUID REFERENCES itinerary_segments(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  parent_comment_id UUID REFERENCES itinerary_comments(id) ON DELETE CASCADE,
  is_private BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
