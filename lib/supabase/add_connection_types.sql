-- Add connection types to the connections table
-- This migration adds support for 1st and 1.5 connections

-- Add connection_type column with default value
ALTER TABLE connections 
ADD COLUMN IF NOT EXISTS connection_type TEXT DEFAULT 'first' 
CHECK (connection_type IN ('first', 'one_point_five'));

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_connections_type ON connections(connection_type);
CREATE INDEX IF NOT EXISTS idx_connections_requester_type ON connections(requester_id, connection_type);

-- Function to count first connections for a user
CREATE OR REPLACE FUNCTION count_first_connections(user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  conn_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO conn_count
  FROM connections
  WHERE (requester_id = user_id OR recipient_id = user_id)
    AND connection_type = 'first'
    AND status = 'accepted';
  
  RETURN conn_count;
END;
$$ LANGUAGE plpgsql;

-- Function to validate first connection limit before insert
CREATE OR REPLACE FUNCTION check_first_connection_limit()
RETURNS TRIGGER AS $$
DECLARE
  requester_count INTEGER;
  recipient_count INTEGER;
BEGIN
  -- Only check for first connections
  IF NEW.connection_type = 'first' THEN
    -- Count requester's first connections
    SELECT count_first_connections(NEW.requester_id) INTO requester_count;
    
    -- Check if requester exceeds limit
    IF requester_count >= 100 THEN
      RAISE EXCEPTION 'Cannot create more than 100 first connections. User % has % first connections.', 
        NEW.requester_id, requester_count;
    END IF;
    
    -- If status is already accepted, also check recipient's count
    IF NEW.status = 'accepted' THEN
      SELECT count_first_connections(NEW.recipient_id) INTO recipient_count;
      
      IF recipient_count >= 100 THEN
        RAISE EXCEPTION 'Cannot create more than 100 first connections. User % has % first connections.', 
          NEW.recipient_id, recipient_count;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to validate first connection limit before update (when accepting)
CREATE OR REPLACE FUNCTION check_first_connection_limit_on_update()
RETURNS TRIGGER AS $$
DECLARE
  requester_count INTEGER;
  recipient_count INTEGER;
BEGIN
  -- Only check when changing to accepted status for first connections
  IF NEW.connection_type = 'first' AND NEW.status = 'accepted' AND OLD.status != 'accepted' THEN
    -- Count both users' first connections
    SELECT count_first_connections(NEW.requester_id) INTO requester_count;
    SELECT count_first_connections(NEW.recipient_id) INTO recipient_count;
    
    IF requester_count >= 100 THEN
      RAISE EXCEPTION 'Cannot accept connection. User % has reached the limit of 100 first connections (current: %).', 
        NEW.requester_id, requester_count;
    END IF;
    
    IF recipient_count >= 100 THEN
      RAISE EXCEPTION 'Cannot accept connection. User % has reached the limit of 100 first connections (current: %).', 
        NEW.recipient_id, recipient_count;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to enforce the limit
DROP TRIGGER IF EXISTS check_first_connection_limit_trigger ON connections;
CREATE TRIGGER check_first_connection_limit_trigger
  BEFORE INSERT ON connections
  FOR EACH ROW
  EXECUTE FUNCTION check_first_connection_limit();

DROP TRIGGER IF EXISTS check_first_connection_limit_update_trigger ON connections;
CREATE TRIGGER check_first_connection_limit_update_trigger
  BEFORE UPDATE ON connections
  FOR EACH ROW
  EXECUTE FUNCTION check_first_connection_limit_on_update();

-- Update existing connections to have a default type (all become 'first' by default)
UPDATE connections 
SET connection_type = 'first' 
WHERE connection_type IS NULL;
