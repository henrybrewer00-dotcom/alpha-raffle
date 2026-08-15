-- prize_entries and ticket_ledger do not have status; never read NEW.status directly.

CREATE OR REPLACE FUNCTION public.notify_hall_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_row jsonb;
  v_prize uuid;
  v_kind text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := to_jsonb(OLD);
  ELSE
    v_row := to_jsonb(NEW);
  END IF;

  IF TG_TABLE_NAME = 'prizes' THEN
    v_prize := (v_row->>'id')::uuid;
    v_kind := 'prize';
  ELSIF TG_TABLE_NAME = 'prize_entries' THEN
    v_prize := (v_row->>'prize_id')::uuid;
    v_kind := 'entries';
  ELSE
    v_prize := NULLIF(v_row->>'prize_id', '')::uuid;
    v_kind := 'tickets';
  END IF;

  PERFORM realtime.publish(
    'raffle:hall',
    'hall_changed',
    jsonb_build_object(
      'kind', v_kind,
      'prize_id', v_prize,
      'status', v_row->>'status'
    )
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
