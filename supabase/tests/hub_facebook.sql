begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

-- Facebook recipes in the Cooking Hub (ADR 021). Pinterest stays out (pinterest_platform.sql).

-- The card key reads the same id extract-recipe uses (extractFacebookId).
select is(
  public.recipe_card_canonical_key('facebook', 'https://www.facebook.com/reel/1234567890'),
  'facebook:1234567890',
  'a reel is keyed by its video id'
);
select is(
  public.recipe_card_canonical_key('facebook', 'https://www.facebook.com/100064123/posts/987654321'),
  'facebook:987654321',
  'a post is keyed by its post id'
);
select is(
  public.recipe_card_canonical_key('facebook', 'https://www.facebook.com/permalink.php?story_fbid=555666777&id=100064123'),
  'facebook:555666777',
  'a permalink is keyed by story_fbid'
);
select is(
  public.recipe_card_canonical_key('facebook', 'https://www.facebook.com/watch/?v=4444455555'),
  'facebook:4444455555',
  'a watch link is keyed by v'
);
select is(
  public.recipe_card_canonical_key('facebook', 'https://www.facebook.com/share/r/1AbCdEf/'),
  null,
  'a share link that never named its post has no key'
);
select is(
  public.recipe_card_canonical_key('pinterest', 'https://www.pinterest.com/pin/452611831329517145/'),
  null,
  'Pinterest still has no card key'
);

select lives_ok(
  $$insert into public.recipe_cards
      (id, canonical_key, canonical_url, original_url, platform, title, ingredients, instructions, servings,
       extraction_status, extraction_source, tags)
    values ('30000000-0000-4000-8000-000000000901', 'facebook:1234567890',
            'https://www.facebook.com/reel/1234567890', 'https://www.facebook.com/reel/1234567890',
            'facebook', 'Facebook dumplings',
            '[{"name":"flour","quantity":2,"unit":"cup"},{"name":"pork","quantity":300,"unit":"g"}]',
            '[{"step":1,"text":"Fold"},{"step":2,"text":"Steam"}]', 4, 'full', 'video', array['fb-dumplings'])$$,
  'a Facebook card can be stored'
);

-- Saving the reel counts towards its card, and deleting it takes the save back.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000900',
        'authenticated', 'authenticated', 'hub-facebook@pinch.invalid', '',
        now(), '{}'::jsonb, '{}'::jsonb, now(), now());

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000900"}';

insert into public.recipes (id, user_id, title, ingredients, instructions, servings, platform, original_url)
values ('20000000-0000-4000-8000-000000000901', '10000000-0000-4000-8000-000000000900', 'Dumplings',
        '[{"name":"flour","quantity":2,"unit":"cup"}]', '[{"step":1,"text":"Fold"}]', 4,
        'facebook', 'https://www.facebook.com/reel/1234567890');

reset role;

select is(
  (select save_count from public.recipe_cards where id = '30000000-0000-4000-8000-000000000901'),
  1,
  'saving a Facebook recipe counts towards its card'
);

delete from public.recipes where id = '20000000-0000-4000-8000-000000000901';

select is(
  (select save_count from public.recipe_cards where id = '30000000-0000-4000-8000-000000000901'),
  0,
  'deleting it takes the save back'
);

-- The Hub's Facebook filter finds it.
select is(
  array(select title from public.hub_cards(p_platform => 'facebook')),
  array['Facebook dumplings'],
  'the Facebook filter lists Facebook cards'
);
select ok(
  'fb-dumplings' in (select tag from public.hub_popular_tags('facebook')),
  'the Facebook filter has its own popular tags'
);

select * from finish();
rollback;
