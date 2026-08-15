-- Staff-managed PINs. InsForge has no admin password-update API, so each
-- account keeps a random bridge password plus a hash of the school PIN.

CREATE TABLE public.login_secrets (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  bridge TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER login_secrets_updated_at
  BEFORE UPDATE ON public.login_secrets
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

ALTER TABLE public.login_secrets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.login_secrets FROM anon, authenticated;
