-- Row Level Security policies for Wine & Words
-- All tables are scoped to a single club via profiles.club_id.

-- Helper: current user's club_id (security definer avoids recursive RLS on profiles)
create or replace function current_club_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select club_id from profiles where id = auth.uid();
$$;

alter table clubs enable row level security;
alter table profiles enable row level security;
alter table books enable row level security;
alter table events enable row level security;
alter table attendance enable row level security;
alter table event_questions enable row level security;
alter table reviews enable row level security;
alter table weather_snapshots enable row level security;
alter table notifications enable row level security;

-- clubs: no direct client access at all (only via security-definer RPCs)
create policy "clubs_no_select" on clubs for select using (false);
create policy "clubs_no_insert" on clubs for insert with check (false);
create policy "clubs_no_update" on clubs for update using (false);
create policy "clubs_no_delete" on clubs for delete using (false);

-- profiles: members can see everyone in their club; only edit their own row
create policy "profiles_select_club" on profiles
  for select using (club_id = current_club_id());

create policy "profiles_insert_self" on profiles
  for insert with check (id = auth.uid());

create policy "profiles_update_self" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- books: club members can read/add; any club member can edit shared books
create policy "books_select_club" on books
  for select using (club_id = current_club_id());

create policy "books_insert_club" on books
  for insert with check (club_id = current_club_id());

create policy "books_update_club" on books
  for update using (club_id = current_club_id())
  with check (club_id = current_club_id());

-- events: club members can read; any member can create or edit events
create policy "events_select_club" on events
  for select using (club_id = current_club_id());

create policy "events_insert_club" on events
  for insert with check (club_id = current_club_id() and created_by = auth.uid());

create policy "events_update_club" on events
  for update using (club_id = current_club_id())
  with check (club_id = current_club_id());

create policy "events_delete_club" on events
  for delete using (club_id = current_club_id());

-- attendance: club members can read; any member can manage attendance for club events
create policy "attendance_select_club" on attendance
  for select using (
    exists (
      select 1 from events e
      where e.id = attendance.event_id and e.club_id = current_club_id()
    )
  );

create policy "attendance_insert_club" on attendance
  for insert with check (
    exists (select 1 from events e where e.id = event_id and e.club_id = current_club_id())
  );

create policy "attendance_update_club" on attendance
  for update using (
    exists (select 1 from events e where e.id = attendance.event_id and e.club_id = current_club_id())
  ) with check (
    exists (select 1 from events e where e.id = attendance.event_id and e.club_id = current_club_id())
  );

create policy "attendance_delete_club" on attendance
  for delete using (
    exists (select 1 from events e where e.id = attendance.event_id and e.club_id = current_club_id())
  );

-- event_questions: club members can read; any member can post, edit, or delete questions
create policy "questions_select_club" on event_questions
  for select using (club_id = current_club_id());

create policy "questions_insert_club" on event_questions
  for insert with check (club_id = current_club_id() and author_id = auth.uid());

create policy "questions_update_club" on event_questions
  for update using (club_id = current_club_id())
  with check (club_id = current_club_id());

create policy "questions_delete_club" on event_questions
  for delete using (club_id = current_club_id());

-- reviews: club members can read; members manage their own review
create policy "reviews_select_club" on reviews
  for select using (club_id = current_club_id());

create policy "reviews_insert_own" on reviews
  for insert with check (club_id = current_club_id() and member_id = auth.uid());

create policy "reviews_update_own" on reviews
  for update using (club_id = current_club_id() and member_id = auth.uid())
  with check (club_id = current_club_id());

create policy "reviews_delete_own" on reviews
  for delete using (club_id = current_club_id() and member_id = auth.uid());

-- weather_snapshots: read-only to club members, written only by server (service role)
create policy "weather_select_club" on weather_snapshots
  for select using (
    exists (
      select 1 from events e
      where e.id = weather_snapshots.event_id and e.club_id = current_club_id()
    )
  );

-- notifications: only the recipient may see or update their own notifications
create policy "notifications_select_own" on notifications
  for select using (recipient_id = auth.uid());

create policy "notifications_update_own" on notifications
  for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
