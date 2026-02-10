-- Migration: Add Final Price Support to homeowner_jobs
-- Allows contractors to propose a final price at job completion
-- Homeowner must accept before payment is released

-- Add final price columns to homeowner_jobs
ALTER TABLE homeowner_jobs
ADD COLUMN IF NOT EXISTS final_price DECIMAL(10,2);

ALTER TABLE homeowner_jobs
ADD COLUMN IF NOT EXISTS final_price_proposed_by VARCHAR(20);

ALTER TABLE homeowner_jobs
ADD COLUMN IF NOT EXISTS final_price_accepted BOOLEAN DEFAULT FALSE;

ALTER TABLE homeowner_jobs
ADD COLUMN IF NOT EXISTS final_price_reason TEXT;

ALTER TABLE homeowner_jobs
ADD COLUMN IF NOT EXISTS final_price_proposed_at TIMESTAMPTZ;

ALTER TABLE homeowner_jobs
ADD COLUMN IF NOT EXISTS final_price_accepted_at TIMESTAMPTZ;

-- Add job_id reference to payment_adjustments (it only had booking_id before)
ALTER TABLE payment_adjustments
ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES homeowner_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payment_adjustments_job ON payment_adjustments(job_id);

COMMENT ON COLUMN homeowner_jobs.final_price IS 'Final agreed price proposed at job completion (may differ from original escrow amount)';
COMMENT ON COLUMN homeowner_jobs.final_price_proposed_by IS 'Who proposed the final price: contractor or homeowner';
COMMENT ON COLUMN homeowner_jobs.final_price_accepted IS 'Whether the other party accepted the proposed final price';

SELECT 'Final price columns added successfully!' as status;
