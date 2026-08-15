-- "Give tickets now" always pays out. The weekday cron still runs once per day.

DROP FUNCTION IF EXISTS public.run_daily_grant();

CREATE OR REPLACE FUNCTION public.run_daily_grant(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_staff uuid := (SELECT auth.uid());
  v_amount integer;
  v_weekdays boolean;
  v_today date := public.chicago_today();
  v_dow integer;
  v_count integer := 0;
  v_already integer := 0;
  v_student record;
BEGIN
  PERFORM public.require_staff();

  SELECT daily_grant_amount, weekdays_only
  INTO v_amount, v_weekdays
  FROM public.settings
  WHERE id = 1;

  IF v_amount IS NULL THEN
    RAISE EXCEPTION 'settings missing';
  END IF;
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'granted', 0, 'already', 0, 'skipped', 'amount is zero');
  END IF;

  v_dow := EXTRACT(DOW FROM v_today);
  IF v_weekdays AND v_dow IN (0, 6) AND NOT p_force THEN
    RETURN jsonb_build_object('ok', true, 'granted', 0, 'already', 0, 'skipped', 'weekend');
  END IF;

  SELECT count(*)::integer INTO v_already
  FROM public.daily_grant_log
  WHERE grant_date = v_today;

  FOR v_student IN
    SELECT id
    FROM public.profiles
    WHERE role = 'student'
      AND active
      AND NOT daily_excluded
  LOOP
    IF NOT p_force AND EXISTS (
      SELECT 1 FROM public.daily_grant_log
      WHERE grant_date = v_today AND user_id = v_student.id
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.ticket_ledger (user_id, delta, reason, created_by, note)
    VALUES (
      v_student.id,
      v_amount,
      'daily_grant',
      v_staff,
      CASE WHEN p_force THEN 'manual grant' ELSE 'daily hall grant' END
    );

    INSERT INTO public.daily_grant_log (grant_date, user_id, amount)
    VALUES (v_today, v_student.id, v_amount)
    ON CONFLICT (grant_date, user_id)
    DO UPDATE SET amount = public.daily_grant_log.amount + EXCLUDED.amount;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'granted', v_count,
    'already', v_already,
    'amount', v_amount,
    'date', v_today,
    'forced', p_force
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_daily_grant(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.run_daily_grant()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT public.run_daily_grant(false);
$$;

GRANT EXECUTE ON FUNCTION public.run_daily_grant() TO authenticated;
