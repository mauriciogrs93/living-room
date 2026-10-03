# 0004 v19 rollback test namespace (applied and removed 2026-10-03)

Throwaway clone of the v19_test namespace for the v18 rollback check, so Tester's v19_test room was not disturbed.

Up: schema `v19_rb` with tables `LIKE v19_test.* INCLUDING ALL` and `public.v19r_*` functions cloned from
`public.v19t_*` via `pg_get_functiondef` with `v19_test -> v19_rb`, `v19t_ -> v19r_`. Service role only.

Down (already applied): drop every `public.v19r_*` function, then `drop schema v19_rb cascade`.

No existing table, function or policy was touched.
