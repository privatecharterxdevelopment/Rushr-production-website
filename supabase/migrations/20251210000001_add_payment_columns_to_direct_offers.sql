-- =============================================================================
-- ADD PAYMENT COLUMNS TO DIRECT_OFFERS TABLE
-- For Stripe escrow integration with instant booking flow
-- =============================================================================

-- 1. Add payment-related columns to direct_offers
ALTER TABLE direct_offers
ADD COLUMN IF NOT EXISTS payment_hold_id UUID REFERENCES payment_holds(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending' CHECK (
  payment_status IN ('pending', 'authorized', 'captured', 'released', 'refunded', 'failed')
),
ADD COLUMN IF NOT EXISTS payment_authorized_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS payment_captured_at TIMESTAMPTZ;

-- 2. Add index for payment queries
CREATE INDEX IF NOT EXISTS idx_direct_offers_payment_hold ON direct_offers(payment_hold_id);
CREATE INDEX IF NOT EXISTS idx_direct_offers_payment_status ON direct_offers(payment_status);

-- 3. Add comment
COMMENT ON COLUMN direct_offers.payment_hold_id IS 'Reference to the Stripe payment hold for this booking';
COMMENT ON COLUMN direct_offers.payment_status IS 'Payment status: pending, authorized, captured, released, refunded, failed';

SELECT 'Payment columns added to direct_offers successfully!' as status;
