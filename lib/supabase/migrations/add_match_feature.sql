-- Match Feature Schema
-- Allows users to match two of their first connections together

-- Matches table: tracks who matched whom
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  matchmaker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK (user1_id <> user2_id),
  CHECK (matchmaker_id <> user1_id),
  CHECK (matchmaker_id <> user2_id),
  -- Ensure same pair isn't matched multiple times (regardless of order)
  CONSTRAINT unique_match UNIQUE (user1_id, user2_id),
  CONSTRAINT unique_match_reverse CHECK (user1_id < user2_id)
);

-- Match chats: tracks the chat status for each participant
CREATE TABLE IF NOT EXISTS match_chats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(match_id, user_id)
);

-- Match messages: stores chat messages between matched users
CREATE TABLE IF NOT EXISTS match_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK (message <> '')
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_matches_matchmaker_id ON matches(matchmaker_id);
CREATE INDEX IF NOT EXISTS idx_matches_user1_id ON matches(user1_id);
CREATE INDEX IF NOT EXISTS idx_matches_user2_id ON matches(user2_id);
CREATE INDEX IF NOT EXISTS idx_match_chats_match_id ON match_chats(match_id);
CREATE INDEX IF NOT EXISTS idx_match_chats_user_id ON match_chats(user_id);
CREATE INDEX IF NOT EXISTS idx_match_messages_match_id ON match_messages(match_id);
CREATE INDEX IF NOT EXISTS idx_match_messages_sender_id ON match_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_match_messages_created_at ON match_messages(created_at);

-- RLS Policies

-- Matches: Users can see matches they're involved in (as matchmaker or matched person)
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own matches"
  ON matches FOR SELECT
  USING (
    auth.uid() = matchmaker_id OR
    auth.uid() = user1_id OR
    auth.uid() = user2_id
  );

CREATE POLICY "Users can create matches for their connections"
  ON matches FOR INSERT
  WITH CHECK (auth.uid() = matchmaker_id);

-- Match chats: Users can only see their own chat status
ALTER TABLE match_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own match chats"
  ON match_chats FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can create match chats"
  ON match_chats FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their own match chats"
  ON match_chats FOR UPDATE
  USING (auth.uid() = user_id);

-- Match messages: Users can see messages for matches they're part of and haven't deleted
ALTER TABLE match_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages in their active matches"
  ON match_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM match_chats
      WHERE match_chats.match_id = match_messages.match_id
        AND match_chats.user_id = auth.uid()
        AND match_chats.is_active = true
    )
  );

CREATE POLICY "Users can send messages in their active matches"
  ON match_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM match_chats
      WHERE match_chats.match_id = match_messages.match_id
        AND match_chats.user_id = auth.uid()
        AND match_chats.is_active = true
    )
  );

-- Function to create a match and initialize chat rooms
CREATE OR REPLACE FUNCTION create_match(
  p_matchmaker_id UUID,
  p_user1_id UUID,
  p_user2_id UUID
) RETURNS UUID AS $$
DECLARE
  v_match_id UUID;
  v_lower_id UUID;
  v_higher_id UUID;
BEGIN
  -- Ensure user1_id < user2_id for uniqueness constraint
  IF p_user1_id < p_user2_id THEN
    v_lower_id := p_user1_id;
    v_higher_id := p_user2_id;
  ELSE
    v_lower_id := p_user2_id;
    v_higher_id := p_user1_id;
  END IF;

  -- Create the match
  INSERT INTO matches (matchmaker_id, user1_id, user2_id)
  VALUES (p_matchmaker_id, v_lower_id, v_higher_id)
  RETURNING id INTO v_match_id;

  -- Create chat rooms for both users
  INSERT INTO match_chats (match_id, user_id, is_active)
  VALUES 
    (v_match_id, v_lower_id, true),
    (v_match_id, v_higher_id, true);

  RETURN v_match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
