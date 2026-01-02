-- Migration: Create Disputes System
-- Adds job_disputes table and updates job status to include 'on_hold'

-- 1. Create job_disputes table
CREATE TABLE IF NOT EXISTS job_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES homeowner_jobs(id) ON DELETE CASCADE,
  filed_by_id UUID NOT NULL REFERENCES auth.users(id),
  filed_by_type TEXT NOT NULL CHECK (filed_by_type IN ('homeowner', 'contractor')),
  reason TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved', 'dismissed')),
  resolution TEXT,
  resolution_action TEXT CHECK (resolution_action IN ('release_to_contractor', 'refund_homeowner', 'partial_refund', 'dismissed')),
  contractor_amount DECIMAL(10, 2), -- Amount to pay contractor (for partial refunds)
  homeowner_refund DECIMAL(10, 2), -- Amount to refund homeowner (for partial refunds)
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create indexes for performance
CREATE INDEX IF NOT EXISTS job_disputes_job_id_idx ON job_disputes(job_id);
CREATE INDEX IF NOT EXISTS job_disputes_filed_by_id_idx ON job_disputes(filed_by_id);
CREATE INDEX IF NOT EXISTS job_disputes_status_idx ON job_disputes(status);
CREATE INDEX IF NOT EXISTS job_disputes_created_at_idx ON job_disputes(created_at DESC);

-- 3. Add 'on_hold' to homeowner_jobs status constraint
-- First, drop the existing constraint if it exists
DO $$
BEGIN
  -- Try to drop constraint if exists (different possible names)
  BEGIN
    ALTER TABLE homeowner_jobs DROP CONSTRAINT IF EXISTS homeowner_jobs_status_check;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;

  BEGIN
    ALTER TABLE homeowner_jobs DROP CONSTRAINT IF EXISTS status_check;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
END $$;

-- Add new constraint with 'on_hold' status
ALTER TABLE homeowner_jobs
ADD CONSTRAINT homeowner_jobs_status_check
CHECK (status IN ('pending', 'bidding', 'bid_received', 'bid_accepted', 'confirmed', 'in_progress', 'completed', 'cancelled', 'expired', 'on_hold'));

-- 4. Enable RLS on job_disputes
ALTER TABLE job_disputes ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for job_disputes

-- Homeowners can view disputes on their jobs
CREATE POLICY "Homeowners can view disputes on their jobs"
  ON job_disputes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM homeowner_jobs
      WHERE homeowner_jobs.id = job_disputes.job_id
      AND homeowner_jobs.homeowner_id = auth.uid()
    )
  );

-- Contractors can view disputes on jobs they're assigned to
CREATE POLICY "Contractors can view disputes on their jobs"
  ON job_disputes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM homeowner_jobs
      WHERE homeowner_jobs.id = job_disputes.job_id
      AND homeowner_jobs.contractor_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM job_bids
      WHERE job_bids.job_id = job_disputes.job_id
      AND job_bids.contractor_id = auth.uid()
      AND job_bids.status = 'accepted'
    )
  );

-- Users can create disputes on jobs they're involved in
CREATE POLICY "Users can create disputes on their jobs"
  ON job_disputes FOR INSERT
  WITH CHECK (
    filed_by_id = auth.uid()
    AND (
      -- Homeowner filing
      EXISTS (
        SELECT 1 FROM homeowner_jobs
        WHERE homeowner_jobs.id = job_id
        AND homeowner_jobs.homeowner_id = auth.uid()
        AND homeowner_jobs.status = 'in_progress'
      )
      OR
      -- Contractor filing
      EXISTS (
        SELECT 1 FROM job_bids
        WHERE job_bids.job_id = job_disputes.job_id
        AND job_bids.contractor_id = auth.uid()
        AND job_bids.status = 'accepted'
      )
    )
  );

-- Service role can do everything (for admin operations)
CREATE POLICY "Service role full access to disputes"
  ON job_disputes FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- 6. Create updated_at trigger
CREATE OR REPLACE FUNCTION update_job_disputes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER job_disputes_updated_at
  BEFORE UPDATE ON job_disputes
  FOR EACH ROW
  EXECUTE FUNCTION update_job_disputes_updated_at();

-- 7. Grant permissions
GRANT ALL ON job_disputes TO authenticated;
GRANT ALL ON job_disputes TO service_role;
