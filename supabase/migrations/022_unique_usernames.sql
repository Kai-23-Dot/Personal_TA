-- Store signup usernames separately from editable display names and enforce
-- uniqueness case-insensitively. The unique index is the final guard against
-- concurrent signup requests that both pass an availability preflight.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT;

-- Preserve one owner for each username already present in auth metadata.
-- Older duplicate accounts remain valid but do not receive the duplicate
-- username value, allowing the unique index to be introduced safely.
WITH ranked_usernames AS (
  SELECT
    users.id,
    BTRIM(users.raw_user_meta_data ->> 'username') AS username,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(BTRIM(users.raw_user_meta_data ->> 'username'))
      ORDER BY users.created_at, users.id
    ) AS duplicate_rank
  FROM auth.users AS users
  WHERE NULLIF(BTRIM(users.raw_user_meta_data ->> 'username'), '') IS NOT NULL
)
UPDATE public.profiles AS profiles
SET username = ranked_usernames.username
FROM ranked_usernames
WHERE profiles.id = ranked_usernames.id
  AND ranked_usernames.duplicate_rank = 1
  AND profiles.username IS NULL;

-- Keep the migration restart-safe if the column was introduced manually or a
-- previous deployment stopped before creating the index.
WITH ranked_profiles AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(BTRIM(username))
      ORDER BY created_at, id
    ) AS duplicate_rank
  FROM public.profiles
  WHERE username IS NOT NULL
)
UPDATE public.profiles AS profiles
SET username = NULL
FROM ranked_profiles
WHERE profiles.id = ranked_profiles.id
  AND ranked_profiles.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_normalized_unique
  ON public.profiles (LOWER(BTRIM(username)))
  WHERE username IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_username_length_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_username_length_check
      CHECK (username IS NULL OR CHAR_LENGTH(BTRIM(username)) BETWEEN 3 AND 50);
  END IF;
END
$$;

-- Expose only an availability boolean to unauthenticated signup requests.
CREATE OR REPLACE FUNCTION public.is_username_available(candidate_username TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    candidate_username IS NOT NULL
    AND CHAR_LENGTH(BTRIM(candidate_username)) BETWEEN 3 AND 50
    AND NOT EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE LOWER(BTRIM(username)) = LOWER(BTRIM(candidate_username))
    );
$$;

REVOKE ALL ON FUNCTION public.is_username_available(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_username_available(TEXT) TO anon, authenticated, service_role;

-- Recreate the auth trigger so all future metadata usernames are copied into
-- profiles. A duplicate insert raises a unique violation and rolls back the
-- auth.users insert in the same transaction.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  signup_username TEXT := NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'username'), '');
BEGIN
  INSERT INTO public.profiles (id, email, full_name, username, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    signup_username,
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN NEW;
END;
$$;

-- Once assigned, a username cannot be changed through a direct profiles
-- update to evade the signup registry. Accounts without a username (for
-- example OAuth accounts) may claim one once; the same unique index applies.
CREATE OR REPLACE FUNCTION public.prevent_profile_username_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.username IS NOT NULL AND NEW.username IS DISTINCT FROM OLD.username THEN
    RAISE EXCEPTION 'Username cannot be changed after it is assigned.'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_username_immutable ON public.profiles;
CREATE TRIGGER profiles_username_immutable
  BEFORE UPDATE OF username ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_username_change();

COMMENT ON COLUMN public.profiles.username IS
  'Immutable signup username; unique case-insensitively and separate from full_name.';
