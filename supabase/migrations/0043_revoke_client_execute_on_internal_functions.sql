-- Lock internal SECURITY DEFINER functions to service_role.
-- Earlier migrations ran `revoke all ... from public`, but Supabase's default
-- privileges also grant EXECUTE directly to anon and authenticated, so those
-- grants survived. Anyone with the anon key could call e.g.
-- grant_purchased_credits for any user. Edge Functions use service_role and are
-- unaffected.
--
-- Still callable by clients on purpose: admin_delete_user,
-- admin_grant_recipe_credits, claim_recipe_card, ensure_user_profile,
-- library_recipe_for_card, library_recipe_for_url (app), submit_website_feedback
-- (landing page, anon), is_current_user_admin (RLS policies). Trigger functions
-- are not callable directly and are left alone.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'activate_subscription',
        'backfill_recipe_cards',
        'cancel_subscription',
        'finalize_guest_extraction',
        'finalize_recipe_credit',
        'find_library_recipe_id',
        'grant_purchased_credits',
        'grant_tokens',
        'is_subscription_active',
        'mark_guest_extraction_compensation_pending',
        'mark_recipe_credit_compensation_pending',
        'refund_daily_ai_usage',
        'refund_daily_remix',
        'refund_guest_daily_ai_usage',
        'refund_guest_extraction',
        'refund_recipe_credit',
        'refund_recipe_credit_after_finalize_failure',
        'refund_recipe_remix',
        'refund_stale_extraction_reservations',
        'refund_stale_guest_extractions',
        'refund_stale_recipe_credits',
        'reopen_refunded_recipe_credit',
        'reserve_daily_ai_usage',
        'reserve_daily_remix',
        'reserve_free_extract',
        'reserve_guest_daily_ai_usage',
        'reserve_guest_extraction',
        'reserve_guest_extraction_v2',
        'reserve_monthly_extract',
        'reserve_recipe_credit',
        'reserve_recipe_remix',
        'spend_tokens',
        'touch_recipe_card_hit'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn.sig);
    execute format('grant execute on function %s to service_role', fn.sig);
  end loop;
end;
$$;

-- Stop Supabase's explicit anon/authenticated grants on future functions in
-- public. Postgres still grants EXECUTE to PUBLIC on new functions, so
-- service-only functions must keep `revoke all ... from public`.
alter default privileges in schema public revoke execute on functions from anon, authenticated;
