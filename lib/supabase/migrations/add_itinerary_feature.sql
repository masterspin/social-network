-- High-level travel itinerary feature schema

-- Core itineraries table
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

-- Registered travelers and collaborators
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

-- Individual trip segments (flights, lodging, events, etc.)
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

-- Shared checklists for preparation
CREATE TABLE IF NOT EXISTS itinerary_checklists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Checklist tasks
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

-- Comment threads on itineraries and segments
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_itineraries_owner_id ON itineraries(owner_id);
CREATE INDEX IF NOT EXISTS idx_itineraries_date_range ON itineraries(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_itinerary_travelers_itinerary_id ON itinerary_travelers(itinerary_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_itinerary_travelers_user_unique
  ON itinerary_travelers(itinerary_id, user_id)
  WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_itinerary_travelers_email_unique
  ON itinerary_travelers(itinerary_id, lower(email))
  WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_itinerary_segments_itinerary_id ON itinerary_segments(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_segments_time ON itinerary_segments(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_itinerary_checklists_itinerary_id ON itinerary_checklists(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_tasks_itinerary_id ON itinerary_tasks(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_comments_itinerary_id ON itinerary_comments(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_comments_parent_comment_id ON itinerary_comments(parent_comment_id);

-- Row level security
ALTER TABLE itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_travelers ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_comments ENABLE ROW LEVEL SECURITY;

-- Membership helper policy
CREATE POLICY "Itinerary members can view itineraries"
  ON itineraries FOR SELECT
  USING (
    auth.uid() = owner_id OR
    EXISTS (
      SELECT 1 FROM itinerary_travelers t
      WHERE t.itinerary_id = itineraries.id
        AND t.user_id = auth.uid()
        AND t.invitation_status = 'accepted'
    )
  );

CREATE POLICY "Itinerary owner manages itineraries"
  ON itineraries FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Itinerary members can view travelers"
  ON itinerary_travelers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM itineraries i
      WHERE i.id = itinerary_travelers.itinerary_id
        AND (
          auth.uid() = i.owner_id OR
          EXISTS (
            SELECT 1 FROM itinerary_travelers t2
            WHERE t2.itinerary_id = itinerary_travelers.itinerary_id
              AND t2.user_id = auth.uid()
              AND t2.invitation_status = 'accepted'
          )
        )
    )
  );

CREATE POLICY "Owners manage travelers"
  ON itinerary_travelers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM itineraries i
      WHERE i.id = itinerary_travelers.itinerary_id
        AND auth.uid() = i.owner_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM itineraries i
      WHERE i.id = itinerary_travelers.itinerary_id
        AND auth.uid() = i.owner_id
    )
  );

CREATE POLICY "Members can view segments"
  ON itinerary_segments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM itineraries i
      WHERE i.id = itinerary_segments.itinerary_id
        AND (
          auth.uid() = i.owner_id OR
          EXISTS (
            SELECT 1 FROM itinerary_travelers t
            WHERE t.itinerary_id = itinerary_segments.itinerary_id
              AND t.user_id = auth.uid()
              AND t.invitation_status = 'accepted'
          )
        )
    )
  );

CREATE POLICY "Owners manage segments"
  ON itinerary_segments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM itineraries i
      WHERE i.id = itinerary_segments.itinerary_id
        AND auth.uid() = i.owner_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM itineraries i
      WHERE i.id = itinerary_segments.itinerary_id
        AND auth.uid() = i.owner_id
    )
  );

CREATE POLICY "Members can view checklists"
  ON itinerary_checklists FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM itineraries i
      WHERE i.id = itinerary_checklists.itinerary_id
        AND (
          auth.uid() = i.owner_id OR
          EXISTS (
            SELECT 1 FROM itinerary_travelers t
            WHERE t.itinerary_id = itinerary_checklists.itinerary_id
              AND t.user_id = auth.uid()
              AND t.invitation_status = 'accepted'
          )
        )
    )
  );

CREATE POLICY "Owners manage checklists"
  ON itinerary_checklists FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM itineraries i
      WHERE i.id = itinerary_checklists.itinerary_id
        AND auth.uid() = i.owner_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM itineraries i
      WHERE i.id = itinerary_checklists.itinerary_id
        AND auth.uid() = i.owner_id
    )
  );

CREATE POLICY "Members can view tasks"
  ON itinerary_tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM itineraries i
      WHERE i.id = itinerary_tasks.itinerary_id
        AND (
          auth.uid() = i.owner_id OR
          EXISTS (
            SELECT 1 FROM itinerary_travelers t
            WHERE t.itinerary_id = itinerary_tasks.itinerary_id
              AND t.user_id = auth.uid()
              AND t.invitation_status = 'accepted'
          )
        )
    )
  );

CREATE POLICY "Members can update their assigned tasks"
  ON itinerary_tasks FOR UPDATE
  USING (
    auth.uid() = assignee_id
  )
  WITH CHECK (
    auth.uid() = assignee_id
  );

CREATE POLICY "Owners manage tasks"
  ON itinerary_tasks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM itineraries i
      WHERE i.id = itinerary_tasks.itinerary_id
        AND auth.uid() = i.owner_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM itineraries i
      WHERE i.id = itinerary_tasks.itinerary_id
        AND auth.uid() = i.owner_id
    )
  );

CREATE POLICY "Members can view comments"
  ON itinerary_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM itineraries i
      WHERE i.id = itinerary_comments.itinerary_id
        AND (
          auth.uid() = i.owner_id OR
          EXISTS (
            SELECT 1 FROM itinerary_travelers t
            WHERE t.itinerary_id = itinerary_comments.itinerary_id
              AND t.user_id = auth.uid()
              AND t.invitation_status = 'accepted'
          )
        )
    )
  );

CREATE POLICY "Members can comment"
  ON itinerary_comments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM itineraries i
      WHERE i.id = itinerary_comments.itinerary_id
        AND (
          auth.uid() = i.owner_id OR
          EXISTS (
            SELECT 1 FROM itinerary_travelers t
            WHERE t.itinerary_id = itinerary_comments.itinerary_id
              AND t.user_id = auth.uid()
              AND t.invitation_status = 'accepted'
          )
        )
    )
  );

CREATE POLICY "Members can update their comments"
  ON itinerary_comments FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- Updated_at triggers
CREATE TRIGGER update_itineraries_updated_at
  BEFORE UPDATE ON itineraries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_itinerary_travelers_updated_at
  BEFORE UPDATE ON itinerary_travelers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_itinerary_segments_updated_at
  BEFORE UPDATE ON itinerary_segments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_itinerary_checklists_updated_at
  BEFORE UPDATE ON itinerary_checklists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_itinerary_tasks_updated_at
  BEFORE UPDATE ON itinerary_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_itinerary_comments_updated_at
  BEFORE UPDATE ON itinerary_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
