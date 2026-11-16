-- Bot Office transport.
--
-- Isolates this app from every other object in the project (including public.leads).
-- This migration only creates schema "office" and three RPCs in public:
--   office_publish, office_fetch, office_cleanup.
-- It does not read, write, grant, or alter any other table.
--
-- Apply in the Supabase SQL editor (runs as postgres). Do not add schema "office"
-- to the Data API exposed schemas. Anon has no table privileges; reads and writes
-- go through the RPCs, which take the access code and store only its sha256.
--
-- Live fanout uses realtime.send() on a public Broadcast channel named
-- "office:" || sha256(access_code). No table is added to supabase_realtime,
-- so postgres_changes cannot see these rows.

-- Supabase already has this schema; a fresh database needs it for pgcrypto.
create schema if not exists extensions;

create schema if not exists office;

revoke all on schema office from public;
grant usage on schema office to anon, authenticated, service_role;

comment on schema office is
  'Bot Office. Not an exposed API schema. Do not grant table access to anon.';

-- pgcrypto ships in the extensions schema on Supabase. Install it there only
-- when it is missing entirely (a second CREATE EXTENSION would fail).
do $$
begin
  if to_regprocedure('extensions.digest(text, text)') is null
     and to_regprocedure('public.digest(text, text)') is null then
    create extension pgcrypto with schema extensions;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Tables. RLS on, no policies: anon/authenticated cannot read or write them.
-- postgres (function owner, superuser) bypasses RLS inside SECURITY DEFINER.
-- ---------------------------------------------------------------------------

create table if not exists office.events (
  id uuid primary key default gen_random_uuid(),
  office_key text not null check (office_key ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists events_office_created_idx
  on office.events (office_key, created_at desc);

create index if not exists events_created_at_idx
  on office.events (created_at);

comment on table office.events is
  'Office event history. Kept at least 7 days, then removed by office.cleanup_events().';

create table if not exists office.snapshots (
  office_key text not null check (office_key ~ '^[0-9a-f]{64}$'),
  account text not null check (account ~ '^[a-z0-9_-]{1,24}$'),
  kind text not null check (kind in ('roster', 'usage')),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (office_key, account, kind)
);

comment on table office.snapshots is
  'Latest roster and latest usage per office per Grok account. Kept forever. One account never replaces another.';

create table if not exists office.maintenance (
  id integer primary key check (id = 1),
  last_cleanup timestamptz not null default '-infinity'::timestamptz
);

insert into office.maintenance (id, last_cleanup)
values (1, '-infinity'::timestamptz)
on conflict (id) do nothing;

alter table office.events enable row level security;
alter table office.snapshots enable row level security;
alter table office.maintenance enable row level security;
alter table office.events force row level security;
alter table office.snapshots force row level security;
alter table office.maintenance force row level security;

revoke all on all tables in schema office from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Internal helpers. Not granted to anon except where a public RPC must call them.
-- search_path is empty so a caller cannot shadow extensions or operators.
-- ---------------------------------------------------------------------------

-- sha256 hex of the access code. The raw code is never stored.
create or replace function office.key_of(access_code text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  raw bytea;
begin
  if access_code is null then
    return null;
  end if;
  if to_regprocedure('extensions.digest(text, text)') is not null then
    raw := extensions.digest(access_code, 'sha256');
  elsif to_regprocedure('public.digest(text, text)') is not null then
    raw := public.digest(access_code, 'sha256');
  else
    raise exception 'Bot Office: enable the pgcrypto extension'
      using errcode = '0A000';
  end if;
  return encode(raw, 'hex');
end;
$$;

-- Same rules as accountOf() in src/lib/state.js. Missing / blank -> principal.
create or replace function office.account_of(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      regexp_replace(
        pg_catalog.normalize(
          pg_catalog.lower(
            pg_catalog.left(
              pg_catalog.btrim(
                pg_catalog.regexp_replace(coalesce(raw, ''), '[[:cntrl:]]', ' ', 'g')
              ),
              24
            )
          ),
          'NFD'
        ),
        '[^a-z0-9_-]',
        '',
        'g'
      ),
      ''
    ),
    'principal'
  );
$$;

create or replace function office.cleanup_events()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
  total integer := 0;
  i integer;
begin
  -- Bounded batches so one run cannot lock the table for a huge backlog.
  for i in 1..20 loop
    delete from office.events
    where id in (
      select id
      from office.events
      where created_at < pg_catalog.now() - interval '7 days'
      limit 5000
    );
    get diagnostics n = row_count;
    total := total + n;
    exit when n = 0;
  end loop;
  return total;
end;
$$;

-- Remember the latest roster (parts that arrive within 15s join) and usage.
create or replace function office.remember_snapshot(
  key text,
  eid uuid,
  t_ms bigint,
  elem jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct text;
  snap jsonb;
  parts jsonb;
  last_ms bigint;
  part jsonb;
  new_parts jsonb;
begin
  if elem is null or jsonb_typeof(elem) <> 'object' then
    return;
  end if;

  if jsonb_typeof(elem -> 'roster') = 'array' then
    acct := office.account_of(elem ->> 'account');
    select payload into snap
    from office.snapshots
    where office_key = key and account = acct and kind = 'roster'
    for update;

    parts := coalesce(snap -> 'parts', '[]'::jsonb);
    last_ms := null;
    if jsonb_array_length(parts) > 0 then
      last_ms := (parts -> -1 ->> 'time')::bigint;
    end if;

    -- Distinct from the event id so a second account in the same payload is not dropped.
    part := jsonb_build_object('id', eid::text || ':' || acct || ':roster', 'time', t_ms, 'body', elem);
    if last_ms is not null
       and t_ms >= last_ms - 15000
       and t_ms - last_ms <= 15000
       and jsonb_array_length(parts) < 40 then
      new_parts := parts || jsonb_build_array(part);
    else
      new_parts := jsonb_build_array(part);
    end if;

    insert into office.snapshots (office_key, account, kind, payload, updated_at)
    values (key, acct, 'roster', jsonb_build_object('parts', new_parts), pg_catalog.clock_timestamp())
    on conflict (office_key, account, kind)
    do update set payload = excluded.payload, updated_at = excluded.updated_at;
  end if;

  if elem ->> 'type' = 'usage' or jsonb_typeof(elem -> 'usage') = 'object' then
    if elem ->> 'type' = 'usage' then
      acct := office.account_of(elem ->> 'account');
    else
      acct := office.account_of(coalesce(elem -> 'usage' ->> 'account', elem ->> 'account'));
    end if;

    insert into office.snapshots (office_key, account, kind, payload, updated_at)
    values (
      key,
      acct,
      'usage',
      jsonb_build_object('id', eid::text || ':' || acct || ':usage', 'time', t_ms, 'body', elem),
      pg_catalog.clock_timestamp()
    )
    on conflict (office_key, account, kind)
    do update set
      payload = excluded.payload,
      updated_at = excluded.updated_at
    where (office.snapshots.payload ->> 'time')::bigint <= t_ms;
  end if;
end;
$$;

create or replace function office.publish(access_code text, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  key text;
  eid uuid;
  ts timestamptz;
  t_ms bigint;
  elem jsonb;
  prev timestamptz;
begin
  if access_code is null or access_code !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'Bot Office: invalid access code'
      using errcode = '28000';
  end if;
  if payload is null or jsonb_typeof(payload) not in ('object', 'array') then
    raise exception 'Bot Office: payload must be a JSON object or array'
      using errcode = '22023';
  end if;
  if octet_length(payload::text) > 524288 then
    raise exception 'Bot Office: payload too large'
      using errcode = '54000';
  end if;

  key := office.key_of(access_code);
  -- One writer at a time per office, so split roster parts merge in order.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(key, 0));

  eid := gen_random_uuid();
  ts := pg_catalog.clock_timestamp();
  t_ms := (extract(epoch from ts) * 1000)::bigint;

  insert into office.events (id, office_key, created_at, payload)
  values (eid, key, ts, payload);

  if jsonb_typeof(payload) = 'array' then
    for elem in select value from jsonb_array_elements(payload)
    loop
      perform office.remember_snapshot(key, eid, t_ms, elem);
    end loop;
  else
    perform office.remember_snapshot(key, eid, t_ms, payload);
  end if;

  -- Public channel: there is no logged-in user, and the topic is the hash.
  -- private => false must match the browser channel config.
  begin
    perform realtime.send(
      payload => jsonb_build_object('id', eid::text, 'time', t_ms, 'payload', payload),
      event => 'office',
      topic => 'office:' || key,
      private => false
    );
  exception
    when others then
      -- Persistence already succeeded. A missing realtime partition just means
      -- open browsers catch up on the next office_fetch.
      null;
  end;

  -- Drop expired events at most once an hour. Failures must not fail the publish.
  if pg_catalog.pg_try_advisory_xact_lock(481516234) then
    select last_cleanup into prev from office.maintenance where id = 1;
    if prev is null or prev < ts - interval '1 hour' then
      begin
        perform office.cleanup_events();
        update office.maintenance set last_cleanup = ts where id = 1;
      exception
        when others then
          null;
      end;
    end if;
  end if;

  return jsonb_build_object('id', eid::text, 'time', t_ms);
end;
$$;

create or replace function office.fetch(
  access_code text,
  since_ms bigint default null,
  with_snapshots boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  key text;
  msgs jsonb := '[]'::jsonb;
  snap record;
  part jsonb;
  cutoff timestamptz;
  lim integer := 5000;
begin
  if access_code is null or access_code !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'Bot Office: invalid access code'
      using errcode = '28000';
  end if;

  key := office.key_of(access_code);

  -- Latest roster and usage of every account, even when older than the event window.
  -- Incremental polls pass with_snapshots false so a photo roster is not downloaded every time.
  if with_snapshots then
  for snap in
    select kind, payload
    from office.snapshots
    where office_key = key
  loop
    if snap.kind = 'roster' then
      for part in
        select value
        from jsonb_array_elements(coalesce(snap.payload -> 'parts', '[]'::jsonb))
      loop
        msgs := msgs || jsonb_build_array(jsonb_build_object(
          'id', part ->> 'id',
          'time', (part ->> 'time')::bigint,
          'payload', part -> 'body'
        ));
      end loop;
    elsif snap.kind = 'usage' and jsonb_exists(snap.payload, 'body') then
      msgs := msgs || jsonb_build_array(jsonb_build_object(
        'id', snap.payload ->> 'id',
        'time', (snap.payload ->> 'time')::bigint,
        'payload', snap.payload -> 'body'
      ));
    end if;
  end loop;
  end if;

  if since_ms is null or since_ms <= 0 then
    cutoff := pg_catalog.now() - interval '7 days';
  else
    cutoff := pg_catalog.to_timestamp(since_ms / 1000.0);
    lim := 2000;
  end if;

  msgs := msgs || coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', id::text,
        'time', (extract(epoch from created_at) * 1000)::bigint,
        'payload', payload
      )
      order by created_at
    )
    from (
      select id, created_at, payload
      from office.events
      where office_key = key
        and created_at > cutoff
      order by created_at desc
      limit lim
    ) recent
  ), '[]'::jsonb);

  return jsonb_build_object(
    'server_ms', (extract(epoch from pg_catalog.clock_timestamp()) * 1000)::bigint,
    'messages', msgs
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- API surface in public (exposed schema). SECURITY INVOKER on purpose:
-- the privileged code stays in schema office, which the Data API does not expose.
-- Anon can execute only these wrappers, and the wrappers only call the functions below.
-- ---------------------------------------------------------------------------

create or replace function public.office_publish(access_code text, payload jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select office.publish(access_code, payload);
$$;

create or replace function public.office_fetch(
  access_code text,
  since_ms bigint default null,
  with_snapshots boolean default true
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select office.fetch(access_code, since_ms, with_snapshots);
$$;

create or replace function public.office_cleanup()
returns integer
language sql
security invoker
set search_path = ''
as $$
  select office.cleanup_events();
$$;

revoke all on function office.key_of(text) from public, anon, authenticated, service_role;
revoke all on function office.account_of(text) from public, anon, authenticated, service_role;
revoke all on function office.cleanup_events() from public, anon, authenticated, service_role;
revoke all on function office.remember_snapshot(text, uuid, bigint, jsonb) from public, anon, authenticated, service_role;
revoke all on function office.publish(text, jsonb) from public, anon, authenticated, service_role;
revoke all on function office.fetch(text, bigint, boolean) from public, anon, authenticated, service_role;

revoke all on function public.office_publish(text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.office_fetch(text, bigint, boolean) from public, anon, authenticated, service_role;
revoke all on function public.office_cleanup() from public, anon, authenticated, service_role;

-- The invoker wrappers run as anon, so anon must be allowed to execute the definer functions.
-- Table privileges stay revoked; the definer owner (postgres) writes the rows.
grant execute on function office.publish(text, jsonb) to anon, authenticated, service_role;
grant execute on function office.fetch(text, bigint, boolean) to anon, authenticated, service_role;
grant execute on function office.cleanup_events() to service_role;

grant execute on function public.office_publish(text, jsonb) to anon, authenticated, service_role;
grant execute on function public.office_fetch(text, bigint, boolean) to anon, authenticated, service_role;
grant execute on function public.office_cleanup() to service_role;

alter function office.key_of(text) owner to postgres;
alter function office.account_of(text) owner to postgres;
alter function office.cleanup_events() owner to postgres;
alter function office.remember_snapshot(text, uuid, bigint, jsonb) owner to postgres;
alter function office.publish(text, jsonb) owner to postgres;
alter function office.fetch(text, bigint, boolean) owner to postgres;

comment on function public.office_publish(text, jsonb) is
  'Publish one Bot Office message. access_code is the office secret; only its sha256 is stored.';
comment on function public.office_fetch(text, bigint, boolean) is
  'Latest roster and usage per account, plus events newer than since_ms (or the last 7 days).';
comment on function public.office_cleanup() is
  'Delete office events older than 7 days. Also runs about once an hour from office_publish.';
