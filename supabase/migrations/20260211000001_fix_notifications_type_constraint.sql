-- =============================================================================
-- FIX NOTIFICATIONS TYPE CONSTRAINT
-- The CHECK constraint on notifications.type keeps getting overwritten by
-- migrations that don't include all types. This causes triggers like
-- notify_contractor_new_offer() to fail when inserting 'direct_offer_received',
-- which rolls back the parent INSERT into direct_offers → 500 error on
-- /api/notify-contractor-booking.
--
-- Solution: Remove the overly restrictive CHECK constraint entirely.
-- The type column is just a string label used for frontend routing/display.
-- There is no security or data integrity reason for a DB-level constraint,
-- and it keeps breaking as new notification types are added.
-- =============================================================================

DO $$
BEGIN
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  RAISE NOTICE 'Dropped notifications_type_check constraint successfully';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop constraint: %', SQLERRM;
END $$;
