-- Live hall: phones and the pie board update when a prize starts or tickets move.

CREATE OR REPLACE FUNCTION public.notify_hall_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_prize uuid;
  v_kind text;
BEGIN
  IF TG_TABLE_NAME = 'prize_entries' THEN
    v_prize := COALESCE(NEW.prize_id, OLD.prize_id);
    v_kind := 'entries';
  ELSIF TG_TABLE_NAME = 'prizes' THEN
    v_prize := COALESCE(NEW.id, OLD.id);
    v_kind := 'prize';
  ELSE
    v_prize := COALESCE(NEW.prize_id, OLD.prize_id);
    v_kind := 'tickets';
  END IF;

  PERFORM realtime.publish(
    'raffle:hall',
    'hall_changed',
    jsonb_build_object(
      'kind', v_kind,
      'prize_id', v_prize,
      'status', CASE WHEN TG_TABLE_NAME = 'prizes' THEN NEW.status ELSE NULL END
    )
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prize_entries_notify ON public.prize_entries;
CREATE TRIGGER prize_entries_notify
  AFTER INSERT OR UPDATE OR DELETE ON public.prize_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_hall_changed();

DROP TRIGGER IF EXISTS prizes_notify ON public.prizes;
CREATE TRIGGER prizes_notify
  AFTER UPDATE OF status ON public.prizes
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_hall_changed();

DROP TRIGGER IF EXISTS ticket_ledger_notify ON public.ticket_ledger;
CREATE TRIGGER ticket_ledger_notify
  AFTER INSERT ON public.ticket_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_hall_changed();

CREATE OR REPLACE FUNCTION public.start_prize(p_prize_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_other text;
  v_name text;
BEGIN
  PERFORM public.require_staff();

  SELECT name INTO v_other
  FROM public.prizes
  WHERE id <> p_prize_id
    AND status IN ('open', 'locked', 'drawing')
  LIMIT 1;
  IF v_other IS NOT NULL THEN
    RAISE EXCEPTION 'finish % first', v_other;
  END IF;

  UPDATE public.prizes
  SET status = 'open'
  WHERE id = p_prize_id
    AND status IN ('draft', 'closed', 'locked');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cannot start this prize';
  END IF;

  SELECT name INTO v_name FROM public.prizes WHERE id = p_prize_id;

  PERFORM realtime.publish(
    'raffle:hall',
    'prize_opened',
    jsonb_build_object('prize_id', p_prize_id, 'prize_name', v_name)
  );

  RETURN jsonb_build_object('ok', true, 'id', p_prize_id);
END;
$$;
