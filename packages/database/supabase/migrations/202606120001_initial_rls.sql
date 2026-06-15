-- Remorra tenant isolation baseline.
-- Prisma owns the relational schema; this migration owns Supabase-specific RLS.

create or replace function public.is_project_member(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from "Project" p
    where p.id = target_project_id
      and p."ownerId" = auth.uid()
  ) or exists (
    select 1
    from "ProjectMembership" pm
    where pm."projectId" = target_project_id
      and pm."userId" = auth.uid()
  );
$$;

create or replace function public.is_project_founder(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from "Project" p
    where p.id = target_project_id
      and p."ownerId" = auth.uid()
  );
$$;

alter table "Project" enable row level security;
alter table "ProjectMembership" enable row level security;
alter table "Ambition" enable row level security;
alter table "Conversation" enable row level security;
alter table "EvolveSession" enable row level security;
alter table "Cycle" enable row level security;
alter table "ViabilitySnapshot" enable row level security;
alter table "AuditEvent" enable row level security;
alter table "GeneratedDocument" enable row level security;
alter table "TokenUsage" enable row level security;

create policy project_select on "Project"
for select using (public.is_project_member(id));

create policy project_update on "Project"
for update using (public.is_project_founder(id))
with check (public.is_project_founder(id));

create policy membership_select on "ProjectMembership"
for select using (public.is_project_member("projectId"));

create policy membership_founder_write on "ProjectMembership"
for all using (public.is_project_founder("projectId"))
with check (public.is_project_founder("projectId"));

create policy ambition_member_select on "Ambition"
for select using (public.is_project_member("projectId"));

create policy ambition_founder_write on "Ambition"
for all using (public.is_project_founder("projectId"))
with check (public.is_project_founder("projectId"));

create policy conversation_member_access on "Conversation"
for select using (public.is_project_member("projectId"));

create policy evolve_founder_access on "EvolveSession"
for all using (public.is_project_founder("projectId"))
with check (public.is_project_founder("projectId"));

create policy cycle_member_select on "Cycle"
for select using (public.is_project_member("projectId"));

create policy cycle_team_write on "Cycle"
for all using (public.is_project_member("projectId"))
with check (public.is_project_member("projectId"));

create policy viability_member_select on "ViabilitySnapshot"
for select using (public.is_project_member("projectId"));

create policy audit_member_select on "AuditEvent"
for select using (public.is_project_member("projectId"));

create policy document_member_select on "GeneratedDocument"
for select using (public.is_project_member("projectId"));

create policy token_owner_select on "TokenUsage"
for select using ("userId" = auth.uid());

revoke insert, update, delete on "AuditEvent" from authenticated;
revoke insert, update, delete on "TokenUsage" from authenticated;
