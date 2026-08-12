-- Wine & Words schema
create extension if not exists pgcrypto;

-- clubs
create table clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  access_code_hash text not null,   -- bcrypt/crypt hash; never exposed
  created_at timestamptz default now()
);

-- profiles (extends auth.users 1-to-1)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  club_id uuid not null references clubs(id),
  display_name text not null,
  bio text,
  avatar_path text,
  favorite_genres text[],
  accent_color text check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  joined_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- books
create table books (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id),
  open_library_key text,
  title text not null,
  author text,
  cover_url text,
  description text,
  page_count int,
  published_year int,
  added_by uuid references profiles(id),
  added_at timestamptz default now()
);

-- events
create table events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id),
  title text not null,
  description text,
  -- Nullable for 'unscheduled' status; non-null for all other statuses.
  event_date timestamptz,
  status text not null default 'upcoming'
    check (status in ('upcoming', 'completed', 'cancelled', 'unscheduled')),
  -- Enforce date/status consistency at the DB level.
  check (
    (status = 'unscheduled' and event_date is null) or
    (status <> 'unscheduled' and event_date is not null)
  ),
  host_id uuid references profiles(id),
  venue_name text,
  locality text,
  lat double precision,
  lon double precision,
  food_description text,
  book_id uuid references books(id),
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- attendance
create table attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  member_id uuid not null references profiles(id) on delete cascade,
  status text not null check (status in ('going','maybe','not_going')),
  recorded_at timestamptz default now(),
  unique(event_id, member_id)
);

-- event_questions (threaded via parent_id)
create table event_questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  club_id uuid not null references clubs(id),
  author_id uuid not null references profiles(id),
  parent_id uuid references event_questions(id) on delete cascade,
  body text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- reviews
create table reviews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  club_id uuid not null references clubs(id),
  member_id uuid not null references profiles(id) on delete cascade,
  rating numeric(3,1) not null check (rating >= 1 and rating <= 5 and rating * 2 = floor(rating * 2)),
  body text,
  spoiler_flag boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(event_id, member_id)
);

-- weather_snapshots
create table weather_snapshots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  fetched_at timestamptz default now(),
  temperature_c double precision,
  weather_code int,
  description text,
  icon_url text,
  raw jsonb
);

-- notifications
create table notifications (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id),
  recipient_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  payload jsonb,
  read boolean not null default false,
  created_at timestamptz default now()
);

-- indexes
create index on events(club_id, status, event_date desc);
create index on events(club_id, event_date desc);
create index on attendance(event_id);
create index on reviews(event_id);
create index on event_questions(event_id, parent_id);
create index on notifications(recipient_id, read, created_at desc);

-- ─── Club-consistency check triggers ─────────────────────────────────────────
-- These run BEFORE insert/update to prevent cross-club UUID injection.
-- All are SECURITY DEFINER so they can read base tables regardless of RLS.

create or replace function check_event_club_refs() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_club uuid;
begin
  if NEW.book_id is not null then
    select club_id into v_club from books where id = NEW.book_id;
    if v_club is distinct from NEW.club_id then
      raise exception 'book_id belongs to a different club';
    end if;
  end if;
  if NEW.host_id is not null then
    select club_id into v_club from profiles where id = NEW.host_id;
    if v_club is distinct from NEW.club_id then
      raise exception 'host_id belongs to a different club';
    end if;
  end if;
  if NEW.created_by is not null then
    select club_id into v_club from profiles where id = NEW.created_by;
    if v_club is distinct from NEW.club_id then
      raise exception 'created_by belongs to a different club';
    end if;
  end if;
  return NEW;
end;
$$;
revoke execute on function check_event_club_refs() from public;

create trigger trg_check_event_club_refs
  before insert or update on events
  for each row execute function check_event_club_refs();

create or replace function check_attendance_club() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_event_club uuid;
  v_member_club uuid;
begin
  select club_id into v_event_club from events where id = NEW.event_id;
  select club_id into v_member_club from profiles where id = NEW.member_id;
  if v_event_club is null or v_member_club is null or v_event_club <> v_member_club then
    raise exception 'attendance member and event must belong to the same club';
  end if;
  return NEW;
end;
$$;
revoke execute on function check_attendance_club() from public;

create trigger trg_check_attendance_club
  before insert or update on attendance
  for each row execute function check_attendance_club();

create or replace function check_question_club() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_event_club uuid;
  v_author_club uuid;
  v_parent_event uuid;
begin
  select club_id into v_event_club from events where id = NEW.event_id;
  if v_event_club is null or v_event_club <> NEW.club_id then
    raise exception 'question event_id belongs to a different club';
  end if;
  select club_id into v_author_club from profiles where id = NEW.author_id;
  if v_author_club is null or v_author_club <> NEW.club_id then
    raise exception 'question author belongs to a different club';
  end if;
  if NEW.parent_id is not null then
    select event_id into v_parent_event from event_questions where id = NEW.parent_id;
    if v_parent_event is distinct from NEW.event_id then
      raise exception 'parent question belongs to a different event';
    end if;
  end if;
  return NEW;
end;
$$;
revoke execute on function check_question_club() from public;

create trigger trg_check_question_club
  before insert or update on event_questions
  for each row execute function check_question_club();

create or replace function check_review_club() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_event_club uuid;
  v_member_club uuid;
begin
  select club_id into v_event_club from events where id = NEW.event_id;
  if v_event_club is null or v_event_club <> NEW.club_id then
    raise exception 'review event belongs to a different club';
  end if;
  select club_id into v_member_club from profiles where id = NEW.member_id;
  if v_member_club is null or v_member_club <> NEW.club_id then
    raise exception 'review member belongs to a different club';
  end if;
  return NEW;
end;
$$;
revoke execute on function check_review_club() from public;

create trigger trg_check_review_club
  before insert or update on reviews
  for each row execute function check_review_club();

create or replace function check_notification_club() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_recipient_club uuid;
begin
  select club_id into v_recipient_club from profiles where id = NEW.recipient_id;
  if v_recipient_club is null or v_recipient_club <> NEW.club_id then
    raise exception 'notification recipient belongs to a different club';
  end if;
  return NEW;
end;
$$;
revoke execute on function check_notification_club() from public;

create trigger trg_check_notification_club
  before insert or update on notifications
  for each row execute function check_notification_club();
