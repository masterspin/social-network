-- Redesign referrals: symmetric model (like matchmaking), immediate connection, no accept flow

-- 1. Drop the stored function (no more accept/decline flow)
DROP FUNCTION IF EXISTS respond_to_referral(UUID, UUID, BOOLEAN, TEXT);

-- 2. Drop old indexes
DROP INDEX IF EXISTS idx_referrals_candidate;
DROP INDEX IF EXISTS idx_referrals_opportunity_holder;

-- 3. Drop old RLS policies
DROP POLICY IF EXISTS referrals_select ON referrals;
DROP POLICY IF EXISTS referrals_insert ON referrals;
DROP POLICY IF EXISTS referrals_update ON referrals;

-- 4. Drop old constraint
ALTER TABLE referrals DROP CONSTRAINT IF EXISTS different_parties;

-- 5. Drop asymmetric columns
ALTER TABLE referrals
  DROP COLUMN IF EXISTS candidate_message,
  DROP COLUMN IF EXISTS candidate_accepted,
  DROP COLUMN IF EXISTS opportunity_holder_accepted,
  DROP COLUMN IF EXISTS status;

-- 6. Rename columns to symmetric
ALTER TABLE referrals RENAME COLUMN candidate_id TO user1_id;
ALTER TABLE referrals RENAME COLUMN opportunity_holder_id TO user2_id;

-- 7. Add symmetric constraint (all three different)
ALTER TABLE referrals ADD CONSTRAINT different_parties CHECK (
  user1_id != user2_id
  AND referrer_id != user1_id
  AND referrer_id != user2_id
);

-- 8. Rename foreign key constraints to match new column names
ALTER TABLE referrals RENAME CONSTRAINT referrals_candidate_id_fkey TO referrals_user1_id_fkey;
ALTER TABLE referrals RENAME CONSTRAINT referrals_opportunity_holder_id_fkey TO referrals_user2_id_fkey;

-- 9. New indexes
CREATE INDEX idx_referrals_user1 ON referrals(user1_id);
CREATE INDEX idx_referrals_user2 ON referrals(user2_id);

-- 9. New RLS policies
CREATE POLICY referrals_select ON referrals FOR SELECT
  USING (auth.uid() IN (referrer_id, user1_id, user2_id));

CREATE POLICY referrals_insert ON referrals FOR INSERT
  WITH CHECK (auth.uid() = referrer_id);
