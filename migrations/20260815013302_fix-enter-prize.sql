CREATE OR REPLACE FUNCTION public.enter_prize(p_prize_id uuid, p_tickets integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_prize public.prizes%ROWTYPE;
  v_balance integer;
  v_existing integer;
  v_new integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  IF p_tickets IS NULL OR p_tickets <= 0 THEN
    RAISE EXCEPTION 'tickets must be positive';
  END IF;

  SELECT * INTO v_prize FROM public.prizes WHERE id = p_prize_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'prize not found';
  END IF;
  IF v_prize.status <> 'open' THEN
    RAISE EXCEPTION 'this prize is not open';
  END IF;

  SELECT ticket_balance INTO v_balance
  FROM public.profiles
  WHERE id = v_uid AND active
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'account is not active';
  END IF;
  IF v_balance < p_tickets THEN
    RAISE EXCEPTION 'not enough tickets';
  END IF;

  SELECT tickets INTO v_existing
  FROM public.prize_entries
  WHERE prize_id = p_prize_id AND user_id = v_uid;
  v_existing := COALESCE(v_existing, 0);

  v_new := v_existing + p_tickets;
  IF v_new < v_prize.min_tickets THEN
    RAISE EXCEPTION 'need at least % tickets to enter', v_prize.min_tickets;
  END IF;

  INSERT INTO public.ticket_ledger (user_id, delta, reason, prize_id, created_by)
  VALUES (v_uid, -p_tickets, 'prize_enter', p_prize_id, v_uid);

  INSERT INTO public.prize_entries (prize_id, user_id, tickets)
  VALUES (p_prize_id, v_uid, v_new)
  ON CONFLICT (prize_id, user_id)
  DO UPDATE SET tickets = EXCLUDED.tickets, updated_at = NOW();

  RETURN jsonb_build_object('ok', true, 'tickets', v_new, 'balance', v_balance - p_tickets);
END;
$$;

GRANT EXECUTE ON FUNCTION public.enter_prize(uuid, integer) TO authenticated;
