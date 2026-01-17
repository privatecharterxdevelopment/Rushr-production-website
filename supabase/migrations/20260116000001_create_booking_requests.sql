-- Create booking_requests table for instant match bookings
CREATE TABLE IF NOT EXISTS booking_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES pro_contractors(id) ON DELETE CASCADE,
  homeowner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  description TEXT,
  location_name TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'completed')),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_booking_requests_contractor ON booking_requests(contractor_id);
CREATE INDEX IF NOT EXISTS idx_booking_requests_homeowner ON booking_requests(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_booking_requests_status ON booking_requests(status);
CREATE INDEX IF NOT EXISTS idx_booking_requests_created ON booking_requests(created_at DESC);

-- Enable RLS
ALTER TABLE booking_requests ENABLE ROW LEVEL SECURITY;

-- Policies for booking_requests
-- Contractors can view their own booking requests
CREATE POLICY "Contractors can view own booking requests"
  ON booking_requests FOR SELECT
  USING (contractor_id = auth.uid());

-- Homeowners can view their own booking requests
CREATE POLICY "Homeowners can view own booking requests"
  ON booking_requests FOR SELECT
  USING (homeowner_id = auth.uid());

-- Contractors can update their own booking requests (accept/decline)
CREATE POLICY "Contractors can update own booking requests"
  ON booking_requests FOR UPDATE
  USING (contractor_id = auth.uid())
  WITH CHECK (contractor_id = auth.uid());

-- Service role can do everything (for API)
CREATE POLICY "Service role full access to booking_requests"
  ON booking_requests FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Allow authenticated users to insert (homeowners creating requests)
CREATE POLICY "Authenticated users can create booking requests"
  ON booking_requests FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_booking_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS booking_requests_updated_at ON booking_requests;
CREATE TRIGGER booking_requests_updated_at
  BEFORE UPDATE ON booking_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_booking_requests_updated_at();

-- Grant permissions
GRANT ALL ON booking_requests TO authenticated;
GRANT ALL ON booking_requests TO service_role;
