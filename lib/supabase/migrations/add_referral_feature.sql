-- Referrals table: symmetric introduction (like matchmaking) with professional context
CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id),
  user1_id UUID NOT NULL REFERENCES users(id),
  user2_id UUID NOT NULL REFERENCES users(id),
  context TEXT NOT NULL,
  match_id UUID REFERENCES matches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT different_parties CHECK (
    user1_id != user2_id
    AND referrer_id != user1_id
    AND referrer_id != user2_id
  )
);

-- Indexes
CREATE INDEX idx_referrals_user1 ON referrals(user1_id);
CREATE INDEX idx_referrals_user2 ON referrals(user2_id);
CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);

-- RLS Policies
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY referrals_select ON referrals FOR SELECT
  USING (auth.uid() IN (referrer_id, user1_id, user2_id));

CREATE POLICY referrals_insert ON referrals FOR INSERT
  WITH CHECK (auth.uid() = referrer_id);
