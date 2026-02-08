-- Add contractor_marked_complete column to homeowner_jobs
-- Used by the dual-confirmation completion flow:
-- 1. Contractor marks job complete via /api/payments/confirm-complete
-- 2. This flag is set on the job so HO dashboard can show "Confirm & Release Payment"
-- 3. HO confirms via same API → both confirmed → escrow released

ALTER TABLE homeowner_jobs
ADD COLUMN IF NOT EXISTS contractor_marked_complete BOOLEAN DEFAULT FALSE;
