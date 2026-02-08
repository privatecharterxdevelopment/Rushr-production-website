-- =============================================================================
-- PAYMENT ADJUSTMENTS TABLE
-- Allows homeowners and contractors to request payment changes during a job
-- Similar to Uber fare adjustments
-- =============================================================================

-- 1. Create payment_adjustments table
CREATE TABLE IF NOT EXISTS payment_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  booking_id UUID REFERENCES direct_offers(id) ON DELETE SET NULL,
  payment_hold_id UUID REFERENCES payment_holds(id) ON DELETE SET NULL,
  conversation_id UUID,

  -- Who requested
  requested_by VARCHAR(20) NOT NULL CHECK (requested_by IN ('homeowner', 'contractor')),
  requested_by_id UUID NOT NULL,
  requested_by_name VARCHAR(255),

  -- Parties involved
  contractor_id UUID NOT NULL,
  homeowner_id UUID NOT NULL,

  -- Adjustment details
  original_amount DECIMAL(10, 2) NOT NULL,
  new_amount DECIMAL(10, 2) NOT NULL,
  difference DECIMAL(10, 2) GENERATED ALWAYS AS (new_amount - original_amount) STORED,
  reason TEXT NOT NULL,
  category VARCHAR(100),

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'paid')),

  -- Response from counterparty
  responded_by_id UUID,
  responded_by_name VARCHAR(255),
  response_note TEXT,
  responded_at TIMESTAMPTZ,

  -- Payment link (if accepted)
  stripe_payment_link_id TEXT,
  stripe_payment_link_url TEXT,
  stripe_payment_intent_id TEXT,

  -- Admin review
  admin_reviewed BOOLEAN DEFAULT false,
  admin_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '48 hours')
);

-- 2. Add indexes
CREATE INDEX IF NOT EXISTS idx_payment_adjustments_booking ON payment_adjustments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_adjustments_status ON payment_adjustments(status);
CREATE INDEX IF NOT EXISTS idx_payment_adjustments_contractor ON payment_adjustments(contractor_id);
CREATE INDEX IF NOT EXISTS idx_payment_adjustments_homeowner ON payment_adjustments(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_payment_adjustments_created ON payment_adjustments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_adjustments_requested_by ON payment_adjustments(requested_by);

-- 3. Enable RLS
ALTER TABLE payment_adjustments ENABLE ROW LEVEL SECURITY;

-- Users can view their own adjustments
CREATE POLICY "Users can view their adjustments" ON payment_adjustments
  FOR SELECT USING (
    auth.uid() = requested_by_id OR
    auth.uid() = contractor_id OR
    auth.uid() = homeowner_id
  );

-- Users can create adjustments they're involved in
CREATE POLICY "Users can create adjustments" ON payment_adjustments
  FOR INSERT WITH CHECK (
    auth.uid() = requested_by_id AND
    (auth.uid() = contractor_id OR auth.uid() = homeowner_id)
  );

-- Users can update adjustments they're involved in
CREATE POLICY "Users can update adjustments" ON payment_adjustments
  FOR UPDATE USING (
    auth.uid() = contractor_id OR auth.uid() = homeowner_id
  );

-- 4. Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_payment_adjustments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payment_adjustments_updated_at ON payment_adjustments;
CREATE TRIGGER payment_adjustments_updated_at
  BEFORE UPDATE ON payment_adjustments
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_adjustments_updated_at();

-- 5. Grant permissions
GRANT SELECT, INSERT, UPDATE ON payment_adjustments TO authenticated;

-- 6. Comments
COMMENT ON TABLE payment_adjustments IS 'Payment adjustment requests between homeowners and contractors';
COMMENT ON COLUMN payment_adjustments.requested_by IS 'Who initiated the adjustment: homeowner or contractor';
COMMENT ON COLUMN payment_adjustments.status IS 'Status: pending, accepted, declined, cancelled, paid';

SELECT 'Payment adjustments table created successfully!' as status;
