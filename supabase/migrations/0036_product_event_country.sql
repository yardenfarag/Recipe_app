-- Country of the request, so insights can show where events come from.
-- Cloudflare's cf-ipcountry wins. The client's device region is only a fallback.

alter table public.product_events
  add column country text;

alter table public.product_events
  drop constraint if exists product_events_country_check;

alter table public.product_events
  add constraint product_events_country_check
  check (country is null or country ~ '^[A-Z]{2}$');

comment on column public.product_events.country is
  'ISO 3166-1 alpha-2 country of the request. Cloudflare when the header is present, otherwise the device region.';

create index product_events_country_created_at_idx
  on public.product_events (country, created_at desc)
  where country is not null;

create or replace function public.product_events_set_country()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  raw_headers text;
  header_country text;
begin
  begin
    raw_headers := current_setting('request.headers', true);
    if raw_headers is not null and btrim(raw_headers) <> '' then
      header_country := upper(coalesce(raw_headers::json->>'cf-ipcountry', ''));
    end if;
  exception
    when others then
      header_country := null;
  end;

  -- XX is Cloudflare's unknown, T1 is Tor. Neither is a country.
  if header_country ~ '^[A-Z]{2}$' and header_country not in ('XX', 'T1') then
    new.country := header_country;
    return new;
  end if;

  if new.country is null then
    return new;
  end if;

  new.country := upper(btrim(new.country));
  if new.country !~ '^[A-Z]{2}$' then
    new.country := null;
  end if;

  return new;
end;
$$;

drop trigger if exists product_events_set_country on public.product_events;

create trigger product_events_set_country
  before insert on public.product_events
  for each row
  execute function public.product_events_set_country();
