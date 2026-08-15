-- Only one prize can take tickets at a time. New prizes stay closed until a guide starts them.

CREATE OR REPLACE FUNCTION public.start_prize(p_prize_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_other text;
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

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_prize(uuid) TO authenticated;

UPDATE public.prizes
SET status = 'draft'
WHERE status = 'open';
