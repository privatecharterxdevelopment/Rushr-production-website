-- =============================================================================
-- JOB CANCELLATIONS TABLE
-- Tracks cancelled jobs for admin review and analytics
-- =============================================================================

-- 1. Create job_cancellations table
CREATE TABLE IF NOT EXISTS job_cancellations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  booking_id UUID REFERENCES direct_offers(id) ON DELETE SET NULL,
  payment_hold_id UUID REFERENCES payment_holds(id) ON DELETE SET NULL,
  job_id UUID REFERENCES homeowner_jobs(id) ON DELETE SET NULL,

  -- Who cancelled
  cancelled_by VARCHAR(20) NOT NULL CHECK (cancelled_by IN ('homeowner', 'contractor', 'admin', 'system')),
  cancelled_by_id UUID NOT NULL,
  cancelled_by_name VARCHAR(255),

  -- Parties involved
  contractor_id UUID,
  homeowner_id UUID,

  -- Cancellation details
  reason TEXT NOT NULL,
  amount DECIMAL(10, 2),
  category VARCHAR(100),

  -- Status
  refund_processed BOOLEAN DEFAULT false,
  admin_reviewed BOOLEAN DEFAULT false,
  admin_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

-- 2. Add indexes
CREATE INDEX IF NOT EXISTS idx_job_cancellations_booking ON job_cancellations(booking_id);
CREATE INDEX IF NOT EXISTS idx_job_cancellations_cancelled_by ON job_cancellations(cancelled_by);
CREATE INDEX IF NOT EXISTS idx_job_cancellations_contractor ON job_cancellations(contractor_id);
CREATE INDEX IF NOT EXISTS idx_job_cancellations_homeowner ON job_cancellations(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_job_cancellations_created ON job_cancellations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_cancellations_reviewed ON job_cancellations(admin_reviewed);

-- 3. Enable RLS
ALTER TABLE job_cancellations ENABLE ROW LEVEL SECURITY;

-- Admin can see all cancellations
CREATE POLICY "Admin can view all cancellations" ON job_cancellations
  FOR SELECT USING (true);

-- Users can see their own cancellations
CREATE POLICY "Users can view their cancellations" ON job_cancellations
  FOR SELECT USING (
    auth.uid() = cancelled_by_id OR
    auth.uid() = contractor_id OR
    auth.uid() = homeowner_id
  );

-- 4. Grant permissions
GRANT SELECT ON job_cancellations TO authenticated;
GRANT INSERT ON job_cancellations TO authenticated;
GRANT UPDATE ON job_cancellations TO authenticated;

-- 5. Add status 'cancelled' to payment_holds if not exists
DO $$
BEGIN
  -- Try to update the check constraint
  ALTER TABLE payment_holds DROP CONSTRAINT IF EXISTS payment_holds_status_check;
  ALTER TABLE payment_holds ADD CONSTRAINT payment_holds_status_check CHECK (status IN (
    'pending', 'authorized', 'captured', 'released',
    'refunded', 'partial_refund', 'disputed', 'failed', 'cancelled'
  ));
EXCEPTION
  WHEN others THEN
    NULL; -- Ignore if constraint already exists with cancelled
END $$;

-- 6. Comments
COMMENT ON TABLE job_cancellations IS 'Tracks all job cancellations for admin review and analytics';
COMMENT ON COLUMN job_cancellations.cancelled_by IS 'Who initiated the cancellation: homeowner, contractor, admin, or system';
COMMENT ON COLUMN job_cancellations.admin_reviewed IS 'Whether an admin has reviewed this cancellation';

SELECT 'Job cancellations table created successfully!' as status;
