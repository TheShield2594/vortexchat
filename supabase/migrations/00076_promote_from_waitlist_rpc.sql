-- Atomic waitlist promotion: updates the departing user's RSVP and promotes
-- the next waitlisted candidate in a single transaction with row-level locking
-- to prevent race conditions.
CREATE OR REPLACE FUNCTION public.promote_from_waitlist(
  p_event_id UUID,
  p_event_capacity INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_going_count INTEGER;
  v_promoted_user_id UUID;
BEGIN
  -- Lock and count current "going" RSVPs for this event
  SELECT COUNT(*)
  INTO v_going_count
  FROM public.event_rsvps
  WHERE event_id = p_event_id AND status = 'going'
  FOR UPDATE;

  -- Only promote if there's room
  IF v_going_count >= p_event_capacity THEN
    RETURN NULL;
  END IF;

  -- Find and lock the next waitlist candidate
  SELECT user_id
  INTO v_promoted_user_id
  FROM public.event_rsvps
  WHERE event_id = p_event_id AND status = 'waitlist'
  ORDER BY
    waitlist_position ASC NULLS LAST,
    created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_promoted_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Promote to going
  UPDATE public.event_rsvps
  SET status = 'going', waitlist_position = NULL
  WHERE event_id = p_event_id AND user_id = v_promoted_user_id;

  RETURN v_promoted_user_id;
END;
$$;
