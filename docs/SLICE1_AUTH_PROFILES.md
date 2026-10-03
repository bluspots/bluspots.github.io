# Slice 1 — Customer Auth + role profiles

Slice 2 now binds signed-in Customer job writes to this session. See `docs/SLICE2_SESSION_JOB_WRITES.md`. The rest of this page is what Slice 1 shipped.

Founder note. This slice adds Supabase Auth and a `profiles` row. It does **not** change job lifecycle, pricing, materials, or jobs RLS. Demo booking stays the default until you turn Auth-required on in a later slice.

## 1. Apply migration `0016`

In the Supabase dashboard → SQL Editor, paste and run:

`supabase/migrations/0016_auth_profiles.sql`

Run it after `0015`. It only creates `public.profiles`, its RLS, and the `auth.users` insert trigger. It does not edit `public.jobs`.

Re-running the file is safe.

## 2. Enable Email auth

Dashboard → Authentication → Providers → Email: turn **Email** on.

Password sign-up is enough for this slice. Email confirmation can stay on. If it is on, the Customer app tells the person to confirm, then sign in. Open the confirmation link in a browser that can reach the Pages origin. The app uses the implicit flow so the link does not depend on a same-browser PKCE verifier.

Add redirect URLs (Authentication → URL configuration). Include the live Customer origin and any local preview origin you actually use:

- Site URL: `https://bluspots.github.io`
- Redirect URLs:
  - `https://bluspots.github.io/**`
  - `http://localhost:8000/**`
  - `http://127.0.0.1:8000/**`

The app sends `emailRedirectTo` as the current page (`origin` + `pathname`). That exact URL has to match an allow-list entry.

## 3. Point the Customer app at the project

In the browser console on the Customer page (anon key only — never the service role):

```js
localStorage.setItem('haven_supabase_url', 'https://YOUR-PROJECT-REF.supabase.co');
localStorage.setItem('haven_supabase_anon_key', 'YOUR_ANON_KEY');
```

Reload. Profile → Settings shows email + password **Sign in** and **Create customer account**.

Sign-up writes user metadata `role: "customer"`. The `0016` trigger inserts `public.profiles` with `role = customer`. After sign-in, Profile and Settings show the email and role. **Sign Out** on Profile calls Auth sign-out when a session exists. With no session it stays inactive, same as before accounts.

The access token is stored for a later slice (`haven_auth_access_token`, plus the supabase-js session under `haven-auth-session`). Job create / claim / lifecycle requests still send the **anon** key as Bearer and still set `customer_id` to `11111111-1111-4111-8111-111111111111`.

## 4. Demo anon flag

Key: `haven_prototype_anon_mode`

| Value | Meaning |
|---|---|
| missing, empty, `1`, `true`, `on` | **Default.** Demo/anon mode ON. |
| `0`, `false`, `off`, `no` | Flag records that Auth should be required later. |

```js
localStorage.getItem('haven_prototype_anon_mode'); // null means ON
localStorage.setItem('haven_prototype_anon_mode', '0'); // later-slice intent
localStorage.setItem('haven_prototype_anon_mode', '1'); // back to default
```

Settings → Testing has the same switch. Either position keeps today’s job paths on the anon key and the demo customer. This PR does not lock down anon writes.

## 5. Check the profile row

After a customer signs up (and confirms, if confirmation is on):

- Authentication → Users shows the user.
- Table Editor → `profiles` has `id` = that user, `role` = `customer`.

Post a job afterward. Bookings / tracking should behave as they do today, including while the session is signed in.

## Explicitly not in this slice

- No session-bound `customer_id` on jobs
- No jobs RLS changes
- No removal of `DEMO_CUSTOMER_ID`
- No anon write lockdown
- No Pro app changes
