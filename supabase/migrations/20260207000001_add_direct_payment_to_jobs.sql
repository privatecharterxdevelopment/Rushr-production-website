-- Migration: Add Direct Payment Support to homeowner_jobs
-- Allows homeowners to post jobs with a fixed price that contractors can accept directly

-- Add payment_type column (default 'bids' for backwards compatibility)
ALTER TABLE homeowner_jobs
ADD COLUMN IF NOT EXISTS payment_type VARCHAR(20) DEFAULT 'bids';

-- Add direct_amount for when payment_type = 'direct'
ALTER TABLE homeowner_jobs
ADD COLUMN IF NOT EXISTS direct_amount DECIMAL(10,2);

-- Add expires_at for direct payment jobs (30 min from creation)
ALTER TABLE homeowner_jobs
ADD COLUMN IF NOT EXISTS direct_expires_at TIMESTAMP WITH TIME ZONE;

-- Add payment_hold_id reference
ALTER TABLE homeowner_jobs
ADD COLUMN IF NOT EXISTS payment_hold_id UUID REFERENCES payment_holds(id);

-- Add constraint to ensure direct_amount is set when payment_type is 'direct'
ALTER TABLE homeowner_jobs
ADD CONSTRAINT check_direct_amount
CHECK (
  (payment_type = 'direct' AND direct_amount IS NOT NULL AND direct_amount > 0) OR
  (payment_type != 'direct')
);

-- Create index for querying available direct payment jobs
CREATE INDEX IF NOT EXISTS idx_homeowner_jobs_direct_available
ON homeowner_jobs (payment_type, status, direct_expires_at)
WHERE payment_type = 'direct' AND status = 'pending';

-- Create function to auto-set expires_at on direct payment jobs
CREATE OR REPLACE FUNCTION set_direct_job_expiry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment_type = 'direct' AND NEW.direct_expires_at IS NULL THEN
    NEW.direct_expires_at := NOW() + INTERVAL '30 minutes';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-setting expiry
DROP TRIGGER IF EXISTS trigger_set_direct_job_expiry ON homeowner_jobs;
CREATE TRIGGER trigger_set_direct_job_expiry
BEFORE INSERT ON homeowner_jobs
FOR EACH ROW
EXECUTE FUNCTION set_direct_job_expiry();

-- Create function to auto-convert expired direct jobs to bids
CREATE OR REPLACE FUNCTION convert_expired_direct_jobs()
RETURNS void AS $$
DECLARE
  expired_job RECORD;
BEGIN
  FOR expired_job IN
    SELECT id, homeowner_id, title
    FROM homeowner_jobs
    WHERE payment_type = 'direct'
      AND status = 'pending'
      AND direct_expires_at < NOW()
  LOOP
    -- Update job to bids mode
    UPDATE homeowner_jobs
    SET payment_type = 'bids',
        status = 'bidding',
        updated_at = NOW()
    WHERE id = expired_job.id;

    -- Create notification for homeowner
    INSERT INTO notifications (user_id, type, title, message, link)
    VALUES (
      expired_job.homeowner_id,
      'job_update',
      'Job Converted to Bids',
      'No contractors accepted your direct payment for "' || expired_job.title || '". Your job is now open for bids.',
      '/jobs/' || expired_job.id
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Note: To run this function periodically, set up a cron job or use Supabase pg_cron:
-- SELECT cron.schedule('expire-direct-jobs', '*/5 * * * *', 'SELECT convert_expired_direct_jobs()');

COMMENT ON COLUMN homeowner_jobs.payment_type IS 'Payment type: "bids" for traditional bidding, "direct" for fixed-price direct payment';
COMMENT ON COLUMN homeowner_jobs.direct_amount IS 'Fixed amount for direct payment jobs (only set when payment_type = direct)';
COMMENT ON COLUMN homeowner_jobs.direct_expires_at IS 'When direct payment job expires and converts to bids (30 min from creation)';

-- Function to atomically accept a direct payment job (prevents race conditions)
CREATE OR REPLACE FUNCTION accept_direct_job(
  p_job_id UUID,
  p_contractor_id UUID
)
RETURNS jsonb AS $$
DECLARE
  v_job RECORD;
  v_payment_hold_id UUID;
  v_conversation_id UUID;
BEGIN
  -- Lock the job row for update (prevents concurrent acceptance)
  SELECT * INTO v_job
  FROM homeowner_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  -- Check job exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Job not found');
  END IF;

  -- Check job is a direct payment job
  IF v_job.payment_type != 'direct' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a direct payment job');
  END IF;

  -- Check job is still available (pending status)
  IF v_job.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Job not available', 'already_taken', true);
  END IF;

  -- Check job hasn't expired
  IF v_job.direct_expires_at IS NOT NULL AND v_job.direct_expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Job has expired');
  END IF;

  -- Update job with contractor and change status to accepted
  UPDATE homeowner_jobs
  SET
    contractor_id = p_contractor_id,
    status = 'accepted',
    updated_at = NOW()
  WHERE id = p_job_id;

  -- Update payment hold with contractor_id
  IF v_job.payment_hold_id IS NOT NULL THEN
    UPDATE payment_holds
    SET
      contractor_id = p_contractor_id,
      updated_at = NOW()
    WHERE id = v_job.payment_hold_id;

    v_payment_hold_id := v_job.payment_hold_id;
  END IF;

  -- Check for existing conversation
  SELECT id INTO v_conversation_id
  FROM conversations
  WHERE homeowner_id = v_job.homeowner_id
    AND pro_id = p_contractor_id
  LIMIT 1;

  -- Create conversation if it doesn't exist
  IF v_conversation_id IS NULL THEN
    INSERT INTO conversations (homeowner_id, pro_id, title, status)
    VALUES (v_job.homeowner_id, p_contractor_id, v_job.title, 'active')
    RETURNING id INTO v_conversation_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'job_id', p_job_id,
    'contractor_id', p_contractor_id,
    'payment_hold_id', v_payment_hold_id,
    'conversation_id', v_conversation_id,
    'amount', v_job.direct_amount
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql;
