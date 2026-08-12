-- list_public_clubs: exposes only id/name for the join page.
-- Requires authentication because joining follows magic-link auth; anon cannot call this.
create or replace function list_public_clubs()
returns table(id uuid, name text)
language sql security definer
stable
set search_path = public
as $$
  select id, name from clubs order by name;
$$;
revoke execute on function list_public_clubs() from public;
grant  execute on function list_public_clubs() to authenticated;

-- current_club_id: stable helper used by RLS policies.
-- Grants limited to authenticated to avoid anon probing.
revoke execute on function current_club_id() from public;
grant  execute on function current_club_id() to authenticated;

-- join_club: verifies the shared access code (pgcrypto crypt) and creates a profile.
-- Validates non-blank, bounded inputs; requires a live auth.uid().
create or replace function join_club(
  p_access_code text,
  p_display_name text,
  p_club_id uuid
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_hash text;
begin
  -- Must be called by a logged-in user (magic-link auth already completed).
  if auth.uid() is null then
    raise exception 'unauthenticated';
  end if;

  -- Validate display_name: non-blank, max 100 chars.
  if length(trim(p_display_name)) = 0 then
    raise exception 'display_name_blank';
  end if;
  if length(p_display_name) > 100 then
    raise exception 'display_name_too_long';
  end if;

  -- Validate access code: non-blank, max 200 chars.
  if length(trim(p_access_code)) = 0 then
    raise exception 'access_code_blank';
  end if;
  if length(p_access_code) > 200 then
    raise exception 'access_code_too_long';
  end if;

  select access_code_hash into v_hash from clubs where id = p_club_id;
  if v_hash is null or crypt(p_access_code, v_hash) <> v_hash then
    raise exception 'invalid_access_code';
  end if;

  insert into profiles(id, club_id, display_name)
  values (auth.uid(), p_club_id, trim(p_display_name))
  on conflict(id) do nothing;
end;
$$;
revoke execute on function join_club(text, text, uuid) from public;
grant  execute on function join_club(text, text, uuid) to authenticated;

-- create_notification: server-side helper used only by trigger functions.
-- No client (anon or authenticated) should call this directly.
create or replace function create_notification(
  p_club_id uuid,
  p_recipient_id uuid,
  p_type text,
  p_payload jsonb
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into notifications(club_id, recipient_id, type, payload)
  values (p_club_id, p_recipient_id, p_type, p_payload)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function create_notification(uuid, uuid, text, jsonb) from public;

-- notify_new_event: trigger function — not directly callable by clients.
create or replace function notify_new_event() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into notifications(club_id, recipient_id, type, payload)
  select new.club_id, p.id, 'new_event',
         jsonb_build_object('event_id', new.id, 'title', new.title, 'event_date', new.event_date)
  from profiles p
  where p.club_id = new.club_id and p.id <> coalesce(new.created_by, '00000000-0000-0000-0000-000000000000'::uuid);
  return new;
end;
$$;
revoke execute on function notify_new_event() from public;

drop trigger if exists trg_notify_new_event on events;
create trigger trg_notify_new_event
  after insert on events
  for each row execute function notify_new_event();

-- notify_new_question: trigger function — not directly callable by clients.
create or replace function notify_new_question() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into notifications(club_id, recipient_id, type, payload)
  select new.club_id, a.member_id, 'new_question',
         jsonb_build_object('event_id', new.event_id, 'question_id', new.id)
  from attendance a
  where a.event_id = new.event_id and a.member_id <> new.author_id;
  return new;
end;
$$;
revoke execute on function notify_new_question() from public;

drop trigger if exists trg_notify_new_question on event_questions;
create trigger trg_notify_new_question
  after insert on event_questions
  for each row execute function notify_new_question();
