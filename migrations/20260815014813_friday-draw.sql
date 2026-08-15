-- Friday raffle: refund-on-delete, two-phase draw so phones do not spoil the wheel.

CREATE OR REPLACE FUNCTION public.delete_prize(p_prize_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_prize public.prizes%ROWTYPE;
  v_entry public.prize_entries%ROWTYPE;
  v_refunded integer := 0;
  v_staff uuid := (SELECT auth.uid());
BEGIN
  PERFORM public.require_staff();

  SELECT * INTO v_prize FROM public.prizes WHERE id = p_prize_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'prize not found';
  END IF;
  IF v_prize.status = 'drawing' THEN
    RAISE EXCEPTION 'finish this draw first';
  END IF;

  FOR v_entry IN
    SELECT * FROM public.prize_entries WHERE prize_id = p_prize_id
  LOOP
    INSERT INTO public.ticket_ledger (user_id, delta, reason, prize_id, created_by, note)
    VALUES (
      v_entry.user_id,
      v_entry.tickets,
      'prize_withdraw',
      p_prize_id,
      v_staff,
      'prize deleted'
    );
    v_refunded := v_refunded + v_entry.tickets;
  END LOOP;

  DELETE FROM public.prizes WHERE id = p_prize_id;

  RETURN jsonb_build_object('ok', true, 'refunded', v_refunded);
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_prize(p_prize_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.require_staff();

  DELETE FROM public.draw_runs
  WHERE prize_id = p_prize_id AND status = 'spinning';

  UPDATE public.prizes
  SET status = 'open',
      winner_id = NULL,
      awarded_at = NULL
  WHERE id = p_prize_id
    AND status IN ('locked', 'closed', 'draft', 'drawing');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cannot reopen this prize';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_draw(p_prize_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_staff uuid := (SELECT auth.uid());
  v_prize public.prizes%ROWTYPE;
  v_total integer;
  v_pick integer;
  v_winner uuid;
  v_run uuid;
  v_name text;
BEGIN
  PERFORM public.require_staff();

  SELECT * INTO v_prize FROM public.prizes WHERE id = p_prize_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'prize not found';
  END IF;

  IF v_prize.status = 'drawing' THEN
    SELECT id, winner_id INTO v_run, v_winner
    FROM public.draw_runs
    WHERE prize_id = p_prize_id AND status = 'spinning'
    ORDER BY started_at DESC
    LIMIT 1;
    IF v_run IS NULL OR v_winner IS NULL THEN
      RAISE EXCEPTION 'draw is stuck — reopen this prize';
    END IF;
    SELECT display_name INTO v_name FROM public.profiles WHERE id = v_winner;
    SELECT COALESCE(SUM(tickets), 0) INTO v_total
    FROM public.prize_entries
    WHERE prize_id = p_prize_id;
    RETURN jsonb_build_object(
      'ok', true,
      'run_id', v_run,
      'winner_id', v_winner,
      'winner_name', v_name,
      'total_tickets', v_total,
      'resumed', true
    );
  END IF;

  IF v_prize.status NOT IN ('open', 'locked') THEN
    RAISE EXCEPTION 'prize is not ready to draw';
  END IF;

  SELECT COALESCE(SUM(tickets), 0) INTO v_total
  FROM public.prize_entries
  WHERE prize_id = p_prize_id;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'nobody has entered this raffle';
  END IF;

  UPDATE public.prizes SET status = 'drawing' WHERE id = p_prize_id;

  v_pick := floor(random() * v_total)::integer;

  SELECT user_id INTO v_winner
  FROM (
    SELECT user_id,
           SUM(tickets) OVER (ORDER BY user_id, id) AS running
    FROM public.prize_entries
    WHERE prize_id = p_prize_id
  ) weights
  WHERE running > v_pick
  ORDER BY running
  LIMIT 1;

  IF v_winner IS NULL THEN
    RAISE EXCEPTION 'could not pick a winner';
  END IF;

  SELECT display_name INTO v_name FROM public.profiles WHERE id = v_winner;

  INSERT INTO public.draw_runs (prize_id, status, winner_id, total_tickets, started_by)
  VALUES (p_prize_id, 'spinning', v_winner, v_total, v_staff)
  RETURNING id INTO v_run;

  RETURN jsonb_build_object(
    'ok', true,
    'run_id', v_run,
    'winner_id', v_winner,
    'winner_name', v_name,
    'total_tickets', v_total,
    'resumed', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_draw(p_prize_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_run public.draw_runs%ROWTYPE;
  v_name text;
  v_prize_name text;
BEGIN
  PERFORM public.require_staff();

  SELECT * INTO v_run
  FROM public.draw_runs
  WHERE prize_id = p_prize_id AND status = 'spinning'
  ORDER BY started_at DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND OR v_run.winner_id IS NULL THEN
    RAISE EXCEPTION 'no draw in progress';
  END IF;

  SELECT display_name INTO v_name FROM public.profiles WHERE id = v_run.winner_id;
  SELECT name INTO v_prize_name FROM public.prizes WHERE id = p_prize_id;

  UPDATE public.prizes
  SET status = 'awarded',
      winner_id = v_run.winner_id,
      awarded_at = NOW()
  WHERE id = p_prize_id;

  UPDATE public.draw_runs
  SET status = 'complete',
      finished_at = NOW()
  WHERE id = v_run.id;

  RETURN jsonb_build_object(
    'ok', true,
    'run_id', v_run.id,
    'winner_id', v_run.winner_id,
    'winner_name', v_name,
    'prize_name', v_prize_name,
    'total_tickets', v_run.total_tickets
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_raffle_draw()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_prize_name text;
  v_winner_name text;
BEGIN
  SELECT name INTO v_prize_name FROM public.prizes WHERE id = NEW.prize_id;

  IF NEW.status = 'spinning' THEN
    PERFORM realtime.publish(
      'raffle:hall',
      'draw_started',
      jsonb_build_object(
        'prize_id', NEW.prize_id,
        'prize_name', v_prize_name,
        'total_tickets', NEW.total_tickets
      )
    );
  ELSIF NEW.status = 'complete' THEN
    SELECT display_name INTO v_winner_name
    FROM public.profiles
    WHERE id = NEW.winner_id;
    PERFORM realtime.publish(
      'raffle:hall',
      'draw_changed',
      jsonb_build_object(
        'id', NEW.id,
        'prize_id', NEW.prize_id,
        'prize_name', v_prize_name,
        'status', NEW.status,
        'winner_id', NEW.winner_id,
        'winner_name', v_winner_name,
        'total_tickets', NEW.total_tickets
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS draw_runs_read ON public.draw_runs;
CREATE POLICY draw_runs_read ON public.draw_runs
  FOR SELECT TO authenticated
  USING (status = 'complete' OR public.is_staff());

GRANT EXECUTE ON FUNCTION public.delete_prize(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.begin_draw(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_draw(uuid) TO authenticated;
