-- StudySpace private two-person chat schema
-- Run this in Supabase SQL Editor as project owner.
-- 1) Create exactly two Auth users in Authentication > Users (invite/create manually).
-- 2) Copy their UUIDs and replace the two values in the INSERT below.
-- 3) Keep public sign-ups disabled in Authentication > Settings.

create extension if not exists pgcrypto;

create table if not exists public.private_chat_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);

create table if not exists public.private_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text,
  image_path text,
  created_at timestamptz not null default now(),
  constraint message_has_content check (
    (body is not null and length(trim(body)) > 0 and image_path is null)
    or (image_path is not null and body is null)
  ),
  constraint sender_not_recipient check (sender_id <> recipient_id)
);

create index if not exists private_messages_created_at_idx
  on public.private_messages(created_at);
create index if not exists private_messages_sender_idx
  on public.private_messages(sender_id);

-- SECURITY DEFINER avoids recursive RLS evaluation when checking membership.
create or replace function public.is_private_chat_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.private_chat_members where user_id = auth.uid());
$$;
revoke all on function public.is_private_chat_member() from public;
grant execute on function public.is_private_chat_member() to authenticated;

-- Hard limit: the administrator-managed allowlist can contain at most two rows.
create or replace function public.enforce_two_private_chat_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('studyspace-private-chat-members'));
  if (select count(*) from public.private_chat_members) >= 2 then
    raise exception 'StudySpace private chat supports exactly two authorized accounts';
  end if;
  return new;
end;
$$;
drop trigger if exists limit_private_chat_members_to_two on public.private_chat_members;
create trigger limit_private_chat_members_to_two
before insert on public.private_chat_members
for each row execute function public.enforce_two_private_chat_members();

alter table public.private_chat_members enable row level security;
alter table public.private_messages enable row level security;

-- Members can only see the membership list after authenticating as a member.
create policy "members can view room membership"
on public.private_chat_members for select to authenticated
using (public.is_private_chat_member());

-- No client-side insert/update/delete on membership table. Configure members via SQL editor only.
revoke insert, update, delete on public.private_chat_members from anon, authenticated;
grant select on public.private_chat_members to authenticated;

create policy "authorized members read messages"
on public.private_messages for select to authenticated
using (
  public.is_private_chat_member()
  and (sender_id = auth.uid() or recipient_id = auth.uid())
);

create policy "authorized members send to the other member"
on public.private_messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and recipient_id <> auth.uid()
  and public.is_private_chat_member()
  and exists (select 1 from public.private_chat_members m where m.user_id = recipient_id)
  and (body is null or length(trim(body)) between 1 and 4000)
);

create policy "senders can delete their own messages"
on public.private_messages for delete to authenticated
using (
  sender_id = auth.uid()
  and public.is_private_chat_member()
);

grant select, insert, delete on public.private_messages to authenticated;

-- Private photo bucket. Images are not publicly accessible.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('private-chat-photos', 'private-chat-photos', false, 8388608,
        array['image/jpeg','image/png','image/webp','image/gif','image/heic'])
on conflict (id) do update set public = false, file_size_limit = 8388608;

create policy "authorized members view private chat photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'private-chat-photos'
  and public.is_private_chat_member()
);

create policy "members upload photos in own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'private-chat-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_private_chat_member()
);

create policy "members delete photos in own folder"
on storage.objects for delete to authenticated
using (
  bucket_id = 'private-chat-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_private_chat_member()
);

-- Enable realtime updates for the message table (safe to run more than once).
do $$
begin
  alter publication supabase_realtime add table public.private_messages;
exception when duplicate_object then null;
when others then
  if sqlstate <> '42710' then raise; end if;
end $$;

-- After creating the two users in Supabase Authentication > Users, run:
-- insert into public.private_chat_members (user_id) values
-- ('00000000-0000-0000-0000-000000000001'),
-- ('00000000-0000-0000-0000-000000000002');
--
-- Exactly two rows are required. Check with:
-- select count(*) from public.private_chat_members;
--
-- IMPORTANT: This starter uses an admin-managed allowlist. Do not grant client
-- insert/update/delete privileges on private_chat_members. Add/remove members
-- only from the SQL editor as the project owner.
