-- Free monthly recipe credits: 10 per UTC month (PIN-57, ADR 016).
-- Edge Functions always pass p_free_limit = FREE_MONTHLY_EXTRACT_LIMIT, so this
-- only aligns the SQL defaults (previously 5, from 0041) with the app.
-- CREATE OR REPLACE keeps existing grants; only the default literal changes.

do $$
declare
  fn record;
  def text;
begin
  for fn in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('reserve_recipe_credit', 'reopen_refunded_recipe_credit')
  loop
    def := pg_get_functiondef(fn.oid);
    def := regexp_replace(def, 'p_free_limit integer DEFAULT \d+', 'p_free_limit integer DEFAULT 10');
    execute def;
  end loop;
end;
$$;
