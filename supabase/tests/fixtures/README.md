# Test fixtures (local tests only — never paste into Supabase)

`supabase_realtime_tenant_schema_pg17.sql` is a byte-exact copy of
`priv/repo/tenant_db_dump_17.sql` from https://github.com/supabase/realtime (Apache-2.0),
commit `1a17fe34753e672c122c5db4e2fd53b2c6ba8e96` (2026-11-05),
sha256 `42aacf25cc40b5a3cc8e7947a85734ae245d5ac514d2905ab3b9815321984b40`.
It is the `realtime` schema Supabase installs in every project (realtime.messages, realtime.send,
realtime.topic, realtime.authorize, realtime.apply_rls, grants). The MIG-0036 tests load it into a
throwaway local Postgres so the policy and trigger are tested against Supabase's real functions.
