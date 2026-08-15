-- Alpha High raffle: profiles, ticket ledger, prizes, daily grant, draw.

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'guide', 'admin')),
  active BOOLEAN NOT NULL DEFAULT true,
  daily_excluded BOOLEAN NOT NULL DEFAULT false,
  ticket_balance INTEGER NOT NULL DEFAULT 0 CHECK (ticket_balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  daily_grant_amount INTEGER NOT NULL DEFAULT 4 CHECK (daily_grant_amount >= 0),
  weekdays_only BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.settings (id, daily_grant_amount, weekdays_only)
VALUES (1, 4, true);

CREATE TABLE public.prizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  min_tickets INTEGER NOT NULL DEFAULT 1 CHECK (min_tickets >= 1),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('draft', 'open', 'locked', 'drawing', 'awarded', 'closed')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  winner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  awarded_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.prize_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_id UUID NOT NULL REFERENCES public.prizes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tickets INTEGER NOT NULL CHECK (tickets > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (prize_id, user_id)
);

CREATE TABLE public.ticket_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL CHECK (delta <> 0),
  reason TEXT NOT NULL CHECK (reason IN (
    'daily_grant', 'staff_adjust', 'prize_enter', 'prize_withdraw', 'welcome'
  )),
  prize_id UUID REFERENCES public.prizes(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.daily_grant_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_date DATE NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (grant_date, user_id)
);

CREATE TABLE public.draw_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_id UUID NOT NULL REFERENCES public.prizes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'spinning' CHECK (status IN ('spinning', 'complete')),
  winner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  total_tickets INTEGER NOT NULL DEFAULT 0,
  started_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX idx_profiles_role ON public.profiles (role);
CREATE INDEX idx_profiles_active ON public.profiles (active);
CREATE INDEX idx_prizes_status ON public.prizes (status, sort_order);
CREATE INDEX idx_prize_entries_prize ON public.prize_entries (prize_id);
CREATE INDEX idx_prize_entries_user ON public.prize_entries (user_id);
CREATE INDEX idx_ledger_user_created ON public.ticket_ledger (user_id, created_at DESC);
CREATE INDEX idx_daily_grant_date ON public.daily_grant_log (grant_date);
CREATE INDEX idx_draw_runs_prize ON public.draw_runs (prize_id, started_at DESC);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

CREATE TRIGGER prizes_updated_at
  BEFORE UPDATE ON public.prizes
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

CREATE TRIGGER prize_entries_updated_at
  BEFORE UPDATE ON public.prize_entries
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

CREATE TRIGGER settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

CREATE OR REPLACE FUNCTION public.chicago_today()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT (timezone('America/Chicago', now()))::date;
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND role IN ('guide', 'admin')
      AND active
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND role = 'admin'
      AND active
  );
$$;

CREATE OR REPLACE FUNCTION public.require_staff()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF current_user = 'project_admin' AND (SELECT auth.uid()) IS NULL THEN
    RETURN;
  END IF;
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'guides and admins only';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_ledger_to_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_balance integer;
BEGIN
  UPDATE public.profiles
  SET ticket_balance = ticket_balance + NEW.delta
  WHERE id = NEW.user_id
  RETURNING ticket_balance INTO v_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile missing for ticket ledger';
  END IF;

  IF v_balance < 0 THEN
    RAISE EXCEPTION 'tickets cannot go below zero';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ticket_ledger_apply_balance
  AFTER INSERT ON public.ticket_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_ledger_to_balance();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_handle text;
  v_name text;
BEGIN
  v_handle := lower(trim(COALESCE(NEW.profile->>'handle', split_part(NEW.email, '@', 1))));
  v_name := trim(COALESCE(NEW.profile->>'name', v_handle));

  INSERT INTO public.profiles (id, handle, display_name, role)
  VALUES (NEW.id, v_handle, v_name, 'student')
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

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

  SELECT COALESCE(tickets, 0) INTO v_existing
  FROM public.prize_entries
  WHERE prize_id = p_prize_id AND user_id = v_uid;

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

CREATE OR REPLACE FUNCTION public.withdraw_prize(p_prize_id uuid, p_tickets integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_prize public.prizes%ROWTYPE;
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

  SELECT tickets INTO v_existing
  FROM public.prize_entries
  WHERE prize_id = p_prize_id AND user_id = v_uid
  FOR UPDATE;
  IF NOT FOUND OR v_existing < p_tickets THEN
    RAISE EXCEPTION 'not enough tickets in this raffle';
  END IF;

  v_new := v_existing - p_tickets;
  IF v_new > 0 AND v_new < v_prize.min_tickets THEN
    RAISE EXCEPTION 'leave at least % tickets, or pull all of them out', v_prize.min_tickets;
  END IF;

  INSERT INTO public.ticket_ledger (user_id, delta, reason, prize_id, created_by)
  VALUES (v_uid, p_tickets, 'prize_withdraw', p_prize_id, v_uid);

  IF v_new = 0 THEN
    DELETE FROM public.prize_entries
    WHERE prize_id = p_prize_id AND user_id = v_uid;
  ELSE
    UPDATE public.prize_entries
    SET tickets = v_new
    WHERE prize_id = p_prize_id AND user_id = v_uid;
  END IF;

  RETURN jsonb_build_object('ok', true, 'tickets', v_new);
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_adjust_tickets(p_user_id uuid, p_delta integer, p_note text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_staff uuid := (SELECT auth.uid());
  v_balance integer;
BEGIN
  PERFORM public.require_staff();
  IF p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'change cannot be zero';
  END IF;

  SELECT ticket_balance INTO v_balance
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'student not found';
  END IF;
  IF v_balance + p_delta < 0 THEN
    RAISE EXCEPTION 'tickets cannot go below zero';
  END IF;

  INSERT INTO public.ticket_ledger (user_id, delta, reason, created_by, note)
  VALUES (p_user_id, p_delta, 'staff_adjust', v_staff, COALESCE(p_note, ''));

  RETURN jsonb_build_object('ok', true, 'balance', v_balance + p_delta);
END;
$$;

CREATE OR REPLACE FUNCTION public.run_daily_grant()
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
    RETURN jsonb_build_object('ok', true, 'granted', 0, 'skipped', 'amount is zero');
  END IF;

  v_dow := EXTRACT(DOW FROM v_today);
  IF v_weekdays AND v_dow IN (0, 6) THEN
    RETURN jsonb_build_object('ok', true, 'granted', 0, 'skipped', 'weekend');
  END IF;

  FOR v_student IN
    SELECT id
    FROM public.profiles
    WHERE role = 'student'
      AND active
      AND NOT daily_excluded
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.daily_grant_log
      WHERE grant_date = v_today AND user_id = v_student.id
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.ticket_ledger (user_id, delta, reason, created_by, note)
    VALUES (v_student.id, v_amount, 'daily_grant', v_staff, 'daily hall grant');

    INSERT INTO public.daily_grant_log (grant_date, user_id, amount)
    VALUES (v_today, v_student.id, v_amount);

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'granted', v_count, 'amount', v_amount, 'date', v_today);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_settings(p_daily_grant_amount integer, p_weekdays_only boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.require_staff();
  UPDATE public.settings
  SET daily_grant_amount = p_daily_grant_amount,
      weekdays_only = p_weekdays_only
  WHERE id = 1;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_student_flags(
  p_user_id uuid,
  p_active boolean DEFAULT NULL,
  p_daily_excluded boolean DEFAULT NULL,
  p_display_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.require_staff();
  UPDATE public.profiles
  SET
    active = COALESCE(p_active, active),
    daily_excluded = COALESCE(p_daily_excluded, daily_excluded),
    display_name = COALESCE(NULLIF(trim(p_display_name), ''), display_name)
  WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'student not found';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_profile_role(p_user_id uuid, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF current_user = 'project_admin' AND (SELECT auth.uid()) IS NULL THEN
    NULL;
  ELSIF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admins only';
  END IF;
  IF p_role NOT IN ('student', 'guide', 'admin') THEN
    RAISE EXCEPTION 'invalid role';
  END IF;
  UPDATE public.profiles SET role = p_role WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_prize(
  p_id uuid,
  p_name text,
  p_description text,
  p_min_tickets integer,
  p_status text DEFAULT 'open'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_staff uuid := (SELECT auth.uid());
BEGIN
  PERFORM public.require_staff();
  IF p_status NOT IN ('draft', 'open', 'closed') THEN
    RAISE EXCEPTION 'status must be draft, open, or closed';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.prizes (name, description, min_tickets, status, created_by)
    VALUES (trim(p_name), COALESCE(p_description, ''), GREATEST(p_min_tickets, 1), p_status, v_staff)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.prizes
    SET name = trim(p_name),
        description = COALESCE(p_description, ''),
        min_tickets = GREATEST(p_min_tickets, 1),
        status = CASE
          WHEN status IN ('locked', 'drawing', 'awarded') THEN status
          ELSE p_status
        END
    WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'prize not found';
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.lock_prize(p_prize_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.require_staff();
  UPDATE public.prizes
  SET status = 'locked'
  WHERE id = p_prize_id AND status = 'open';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'prize must be open to lock';
  END IF;
  RETURN jsonb_build_object('ok', true);
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
  UPDATE public.prizes
  SET status = 'open'
  WHERE id = p_prize_id AND status IN ('locked', 'closed', 'draft');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cannot reopen this prize';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.draw_prize(p_prize_id uuid)
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

  INSERT INTO public.draw_runs (prize_id, status, total_tickets, started_by)
  VALUES (p_prize_id, 'spinning', v_total, v_staff)
  RETURNING id INTO v_run;

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

  UPDATE public.prizes
  SET status = 'awarded',
      winner_id = v_winner,
      awarded_at = NOW()
  WHERE id = p_prize_id;

  UPDATE public.draw_runs
  SET status = 'complete',
      winner_id = v_winner,
      finished_at = NOW()
  WHERE id = v_run;

  RETURN jsonb_build_object(
    'ok', true,
    'run_id', v_run,
    'winner_id', v_winner,
    'winner_name', v_name,
    'total_tickets', v_total
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_raffle_draw()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM realtime.publish(
    'raffle:hall',
    'draw_changed',
    jsonb_build_object(
      'id', NEW.id,
      'prize_id', NEW.prize_id,
      'status', NEW.status,
      'winner_id', NEW.winner_id,
      'total_tickets', NEW.total_tickets
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER draw_runs_notify
  AFTER INSERT OR UPDATE ON public.draw_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_raffle_draw();

INSERT INTO realtime.channels (pattern, description, enabled)
VALUES ('raffle:%', 'Alpha High raffle hall', true)
ON CONFLICT (pattern) DO UPDATE
SET description = EXCLUDED.description,
    enabled = EXCLUDED.enabled;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prize_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_grant_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draw_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_read ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY settings_read ON public.settings
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY prizes_read ON public.prizes
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY prize_entries_read ON public.prize_entries
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY ledger_read ON public.ticket_ledger
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_staff());

CREATE POLICY daily_grant_read ON public.daily_grant_log
  FOR SELECT TO authenticated
  USING (public.is_staff());

CREATE POLICY draw_runs_read ON public.draw_runs
  FOR SELECT TO authenticated
  USING (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.settings FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.prizes FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.prize_entries FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ticket_ledger FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.daily_grant_log FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.draw_runs FROM anon, authenticated;

GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.settings TO authenticated;
GRANT SELECT ON public.prizes TO authenticated;
GRANT SELECT ON public.prize_entries TO authenticated;
GRANT SELECT ON public.ticket_ledger TO authenticated;
GRANT SELECT ON public.daily_grant_log TO authenticated;
GRANT SELECT ON public.draw_runs TO authenticated;

GRANT EXECUTE ON FUNCTION public.enter_prize(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_prize(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_adjust_tickets(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_daily_grant() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_settings(integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_student_flags(uuid, boolean, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_profile_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_prize(uuid, text, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lock_prize(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_prize(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.draw_prize(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.chicago_today() TO authenticated;
