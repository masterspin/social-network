-- Allow itineraries to have multiple owners and advanced visibility tiers

BEGIN;

ALTER TABLE itineraries
  ADD COLUMN IF NOT EXISTS visibility_detail TEXT DEFAULT 'private';

ALTER TABLE itineraries
  ADD CONSTRAINT itineraries_visibility_detail_check
  CHECK (visibility_detail IN ('private', 'first_connection', 'one_point_five', 'public'));

-- Temporarily backfill existing rows
UPDATE itineraries
SET visibility_detail = CASE visibility
  WHEN 'private' THEN 'private'
  WHEN 'shared' THEN 'first_connection'
  WHEN 'public' THEN 'public'
  ELSE 'private'
END
WHERE visibility_detail IS NULL;

-- Ensure traveler roles include co-owners
ALTER TABLE itinerary_travelers
  DROP CONSTRAINT IF EXISTS itinerary_travelers_role_check;

ALTER TABLE itinerary_travelers
  ADD CONSTRAINT itinerary_travelers_role_check
  CHECK (role IN ('owner', 'traveler', 'viewer'));

-- Owner invitation workflow
CREATE TABLE IF NOT EXISTS itinerary_owner_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  responded_at TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_invites_unique_pending
  ON itinerary_owner_invitations(itinerary_id, invitee_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_owner_invites_invitee
  ON itinerary_owner_invitations(invitee_id)
  WHERE status = 'pending';

-- RLS for owner invitations
ALTER TABLE itinerary_owner_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage owner invitations"
  ON itinerary_owner_invitations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM itinerary_travelers t
      WHERE t.itinerary_id = itinerary_owner_invitations.itinerary_id
        AND t.user_id = auth.uid()
        AND t.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM itinerary_travelers t
      WHERE t.itinerary_id = itinerary_owner_invitations.itinerary_id
        AND t.user_id = auth.uid()
        AND t.role = 'owner'
    )
  );

CREATE POLICY "Invitee can view and respond"
  ON itinerary_owner_invitations
  FOR SELECT USING (
    invitee_id = auth.uid()
  );

CREATE POLICY "Invitee can update status"
  ON itinerary_owner_invitations
  FOR UPDATE USING (
    invitee_id = auth.uid()
  ) WITH CHECK (
    invitee_id = auth.uid()
  );

-- Helper view to identify owners (including primary owner)
CREATE OR REPLACE VIEW itinerary_owners AS
SELECT i.id AS itinerary_id, i.owner_id AS user_id
FROM itineraries i
UNION
SELECT t.itinerary_id, t.user_id
FROM itinerary_travelers t
WHERE t.role = 'owner'
  AND t.user_id IS NOT NULL
  AND t.invitation_status = 'accepted';

COMMIT;
