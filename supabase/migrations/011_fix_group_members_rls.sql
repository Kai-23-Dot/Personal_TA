-- Fix infinite recursion in group_members RLS policies.
--
-- The original "Users can see group membership" policy on group_members
-- did a subquery on group_members itself, causing infinite recursion.
-- The fix: a SECURITY DEFINER helper function that bypasses RLS when
-- fetching the calling user's group IDs, then use that in the policy.

-- 1. Drop the recursive policy
DROP POLICY IF EXISTS "Users can see group membership" ON public.group_members;

-- 2. Create a security-definer function that returns the authenticated
--    user's group_ids without triggering RLS (runs as the function owner).
CREATE OR REPLACE FUNCTION public.my_group_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT group_id
  FROM public.group_members
  WHERE user_id = auth.uid();
$$;

-- 3. Re-create the policy using the function — no recursion possible.
CREATE POLICY "Users can see group membership" ON public.group_members
  FOR SELECT USING (
    group_id IN (SELECT public.my_group_ids())
  );

-- 4. Also ensure the INSERT policy allows the creating user to add
--    themselves as owner (needed for POST /api/groups).
DROP POLICY IF EXISTS "Users manage own membership" ON public.group_members;
DROP POLICY IF EXISTS "Users can leave groups"      ON public.group_members;

CREATE POLICY "Users insert own membership" ON public.group_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own membership" ON public.group_members
  FOR DELETE USING (user_id = auth.uid());
