-- Referrals table: tracks the referral request and acceptance state
CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id),
  candidate_id UUID NOT NULL REFERENCES users(id),
  opportunity_holder_id UUID NOT NULL REFERENCES users(id),
  context TEXT NOT NULL,                    -- opportunity description
  candidate_message TEXT,                   -- editable intro message (set on candidate accept)
  candidate_accepted BOOLEAN DEFAULT FALSE,
  opportunity_holder_accepted BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'declined')),
  match_id UUID REFERENCES matches(id),     -- set when both accept
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT different_parties CHECK (
    candidate_id != opportunity_holder_id
    AND referrer_id != candidate_id
    AND referrer_id != opportunity_holder_id
  )
);

-- Indexes
CREATE INDEX idx_referrals_candidate ON referrals(candidate_id) WHERE status = 'pending';
CREATE INDEX idx_referrals_opportunity_holder ON referrals(opportunity_holder_id) WHERE status = 'pending';
CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);

-- RLS Policies
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- Participants can view referrals they're part of
CREATE POLICY referrals_select ON referrals FOR SELECT
  USING (auth.uid() IN (referrer_id, candidate_id, opportunity_holder_id));

-- Only referrer can create
CREATE POLICY referrals_insert ON referrals FOR INSERT
  WITH CHECK (auth.uid() = referrer_id);

-- Participants can update their acceptance (handled via function)
CREATE POLICY referrals_update ON referrals FOR UPDATE
  USING (auth.uid() IN (candidate_id, opportunity_holder_id));

-- Function: respond to referral (handles dual-accept logic)
CREATE OR REPLACE FUNCTION respond_to_referral(
  p_referral_id UUID,
  p_user_id UUID,
  p_accept BOOLEAN,
  p_message TEXT DEFAULT NULL
) RETURNS TABLE(referral_id UUID, status TEXT, match_id UUID) AS $$
DECLARE
  v_referral referrals%ROWTYPE;
  v_new_match_id UUID;
BEGIN
  -- Lock and fetch referral
  SELECT * INTO v_referral FROM referrals WHERE id = p_referral_id FOR UPDATE;

  IF v_referral IS NULL THEN
    RAISE EXCEPTION 'Referral not found';
  END IF;

  IF v_referral.status != 'pending' THEN
    RAISE EXCEPTION 'Referral already resolved';
  END IF;

  -- Handle decline
  IF NOT p_accept THEN
    UPDATE referrals SET status = 'declined' WHERE id = p_referral_id;
    RETURN QUERY SELECT p_referral_id, 'declined'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Handle accept based on role
  IF p_user_id = v_referral.candidate_id THEN
    UPDATE referrals
    SET candidate_accepted = TRUE, candidate_message = COALESCE(p_message, candidate_message)
    WHERE id = p_referral_id;
  ELSIF p_user_id = v_referral.opportunity_holder_id THEN
    UPDATE referrals SET opportunity_holder_accepted = TRUE WHERE id = p_referral_id;
  ELSE
    RAISE EXCEPTION 'User not a participant';
  END IF;

  -- Re-fetch to check if both accepted
  SELECT * INTO v_referral FROM referrals WHERE id = p_referral_id;

  IF v_referral.candidate_accepted AND v_referral.opportunity_holder_accepted THEN
    -- Create match (ensure user1 < user2 for uniqueness)
    INSERT INTO matches (matchmaker_id, user1_id, user2_id)
    VALUES (
      v_referral.referrer_id,
      LEAST(v_referral.candidate_id, v_referral.opportunity_holder_id),
      GREATEST(v_referral.candidate_id, v_referral.opportunity_holder_id)
    )
    RETURNING id INTO v_new_match_id;

    -- Create match_chats for both participants
    INSERT INTO match_chats (match_id, user_id, is_active)
    VALUES
      (v_new_match_id, v_referral.candidate_id, TRUE),
      (v_new_match_id, v_referral.opportunity_holder_id, TRUE);

    -- Insert candidate's intro message as first message
    INSERT INTO match_messages (match_id, sender_id, message)
    VALUES (v_new_match_id, v_referral.candidate_id, v_referral.candidate_message);

    -- Update referral status
    UPDATE referrals SET status = 'connected', match_id = v_new_match_id WHERE id = p_referral_id;

    RETURN QUERY SELECT p_referral_id, 'connected'::TEXT, v_new_match_id;
  ELSE
    RETURN QUERY SELECT p_referral_id, 'pending'::TEXT, NULL::UUID;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
