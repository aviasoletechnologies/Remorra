-- Production completion constraints and tenant isolation.

create unique index if not exists "Cycle_one_active_per_project"
on "Cycle" ("projectId")
where status = 'active';

create unique index if not exists "SkillVersion_one_active"
on "SkillVersion" ("skillId")
where active = true;

create unique index if not exists "ReportDefinitionVersion_one_active"
on "ReportDefinitionVersion" ("reportDefinitionId")
where active = true;

create unique index if not exists "DocumentTemplateVersion_one_active"
on "DocumentTemplateVersion" ("documentTemplateId")
where active = true;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from "Profile"
    where id = auth.uid()
      and "platformRole" in ('admin', 'support')
      and status = 'active'
  );
$$;

create or replace function public.is_project_contributor(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_project_founder(target_project_id) or exists (
    select 1 from "ProjectMembership"
    where "projectId" = target_project_id
      and "userId" = auth.uid()
      and role = 'team'
  );
$$;

alter table "Profile" enable row level security;
alter table "Invitation" enable row level security;
alter table "ConsentRecord" enable row level security;
alter table "DeletionRequest" enable row level security;
alter table "DataExport" enable row level security;
alter table "Okr" enable row level security;
alter table "Persona" enable row level security;
alter table "OkrPersona" enable row level security;
alter table "PainPoint" enable row level security;
alter table "UserNeed" enable row level security;
alter table "UserStory" enable row level security;
alter table "Task" enable row level security;
alter table "RaidItem" enable row level security;
alter table "FinanceCategory" enable row level security;
alter table "FinanceEntry" enable row level security;
alter table "DailyMeeting" enable row level security;
alter table "MeetingParticipant" enable row level security;
alter table "Retrospective" enable row level security;
alter table "ConversationMessage" enable row level security;
alter table "StructuredExtract" enable row level security;
alter table "FounderPack" enable row level security;
alter table "ProductPack" enable row level security;
alter table "RefineSession" enable row level security;
alter table "RefineProposal" enable row level security;
alter table "EntityLinkCheck" enable row level security;
alter table "ImpactItem" enable row level security;
alter table "BuildPackSnapshot" enable row level security;
alter table "ReportGeneration" enable row level security;
alter table "ReportSourceSnapshot" enable row level security;
alter table "ReportContent" enable row level security;
alter table "StorageObject" enable row level security;
alter table "JobRecord" enable row level security;
alter table "JobAttempt" enable row level security;
alter table "OutboxEvent" enable row level security;
alter table "AiInvocation" enable row level security;
alter table "AiFailure" enable row level security;
alter table "PlatformAuditEvent" enable row level security;

create policy profile_self_select on "Profile"
for select using (id = auth.uid());
create policy profile_self_update on "Profile"
for update using (id = auth.uid()) with check (id = auth.uid());

create policy invitation_project_select on "Invitation"
for select using (public.is_project_founder("projectId") or lower(email) = lower(auth.jwt() ->> 'email'));
create policy invitation_founder_write on "Invitation"
for all using (public.is_project_founder("projectId"))
with check (public.is_project_founder("projectId"));

create policy consent_self on "ConsentRecord"
for select using ("userId" = auth.uid());
create policy deletion_self on "DeletionRequest"
for select using ("userId" = auth.uid());
create policy export_self on "DataExport"
for select using ("userId" = auth.uid());

create policy okr_member_select on "Okr"
for select using (public.is_project_member("projectId"));
create policy okr_founder_write on "Okr"
for all using (public.is_project_founder("projectId"))
with check (public.is_project_founder("projectId"));

create policy persona_member_select on "Persona"
for select using (public.is_project_member("projectId"));
create policy persona_founder_write on "Persona"
for all using (public.is_project_founder("projectId"))
with check (public.is_project_founder("projectId"));

create policy okr_persona_member_select on "OkrPersona"
for select using (
  exists (select 1 from "Okr" where id = "okrId" and public.is_project_member("projectId"))
);
create policy okr_persona_founder_write on "OkrPersona"
for all using (
  exists (select 1 from "Okr" where id = "okrId" and public.is_project_founder("projectId"))
) with check (
  exists (select 1 from "Okr" where id = "okrId" and public.is_project_founder("projectId"))
);

create policy pain_member_select on "PainPoint"
for select using (public.is_project_member("projectId"));
create policy pain_founder_write on "PainPoint"
for all using (public.is_project_founder("projectId"))
with check (public.is_project_founder("projectId"));

create policy need_member_select on "UserNeed"
for select using (public.is_project_member("projectId"));
create policy need_founder_write on "UserNeed"
for all using (public.is_project_founder("projectId"))
with check (public.is_project_founder("projectId"));

create policy story_member_select on "UserStory"
for select using (public.is_project_member("projectId"));
create policy story_contributor_write on "UserStory"
for all using (public.is_project_contributor("projectId"))
with check (public.is_project_contributor("projectId"));

create policy task_member_select on "Task"
for select using (
  public.is_project_contributor("projectId")
  or ("assigneeId" = auth.uid() and public.is_project_member("projectId"))
);
create policy task_contributor_write on "Task"
for all using (
  public.is_project_contributor("projectId")
  or ("assigneeId" = auth.uid() and public.is_project_member("projectId"))
) with check (
  public.is_project_contributor("projectId")
  or ("assigneeId" = auth.uid() and public.is_project_member("projectId"))
);

create policy raid_member_select on "RaidItem"
for select using (public.is_project_member("projectId"));
create policy raid_contributor_write on "RaidItem"
for all using (public.is_project_contributor("projectId"))
with check (public.is_project_contributor("projectId"));

create policy finance_category_member on "FinanceCategory"
for select using (public.is_project_member("projectId"));
create policy finance_category_write on "FinanceCategory"
for all using (public.is_project_contributor("projectId"))
with check (public.is_project_contributor("projectId"));
create policy finance_entry_member on "FinanceEntry"
for select using (public.is_project_member("projectId"));
create policy finance_entry_write on "FinanceEntry"
for all using (public.is_project_contributor("projectId"))
with check (public.is_project_contributor("projectId"));

create policy meeting_member on "DailyMeeting"
for select using (public.is_project_member("projectId"));
create policy meeting_write on "DailyMeeting"
for all using (public.is_project_contributor("projectId"))
with check (public.is_project_contributor("projectId"));
create policy meeting_participant_member on "MeetingParticipant"
for select using (
  exists (select 1 from "DailyMeeting" where id = "meetingId" and public.is_project_member("projectId"))
);
create policy retrospective_member on "Retrospective"
for select using (public.is_project_member("projectId"));
create policy retrospective_write on "Retrospective"
for all using (public.is_project_contributor("projectId"))
with check (public.is_project_contributor("projectId"));

create policy conversation_message_member on "ConversationMessage"
for select using (
  exists (select 1 from "Conversation" where id = "conversationId" and public.is_project_member("projectId"))
);
create policy structured_extract_member on "StructuredExtract"
for select using (
  exists (select 1 from "Conversation" where id = "conversationId" and public.is_project_member("projectId"))
);

create policy founder_pack_member on "FounderPack"
for select using (public.is_project_member("projectId"));
create policy product_pack_member on "ProductPack"
for select using (public.is_project_member("projectId"));
create policy refine_session_founder on "RefineSession"
for select using (public.is_project_founder("projectId"));
create policy refine_proposal_founder on "RefineProposal"
for select using (public.is_project_founder("projectId"));
create policy link_check_member on "EntityLinkCheck"
for select using (public.is_project_member("projectId"));

create policy impact_founder on "ImpactItem"
for select using (
  exists (select 1 from "EvolveSession" where id = "evolveSessionId" and public.is_project_founder("projectId"))
);

create policy build_pack_member on "BuildPackSnapshot"
for select using (public.is_project_member("projectId"));
create policy report_member on "ReportGeneration"
for select using (public.is_project_contributor("projectId"));
create policy report_snapshot_member on "ReportSourceSnapshot"
for select using (
  exists (select 1 from "ReportGeneration" where id = "reportGenerationId" and public.is_project_contributor("projectId"))
);
create policy report_content_member on "ReportContent"
for select using (
  exists (select 1 from "ReportGeneration" where id = "reportGenerationId" and public.is_project_contributor("projectId"))
);
create policy storage_member on "StorageObject"
for select using ("projectId" is null or public.is_project_member("projectId"));
create policy job_owner on "JobRecord"
for select using ("userId" = auth.uid() or ("projectId" is not null and public.is_project_member("projectId")));
create policy job_attempt_owner on "JobAttempt"
for select using (
  exists (select 1 from "JobRecord" where id = "jobRecordId" and ("userId" = auth.uid() or public.is_project_member("projectId")))
);
create policy ai_invocation_owner on "AiInvocation"
for select using ("userId" = auth.uid());
create policy ai_failure_owner on "AiFailure"
for select using (
  exists (select 1 from "AiInvocation" where id = "aiInvocationId" and "userId" = auth.uid())
);
create policy platform_audit_admin on "PlatformAuditEvent"
for select using (public.is_platform_admin());

revoke insert, update, delete on "AuditEvent" from authenticated;
revoke insert, update, delete on "PlatformAuditEvent" from authenticated;
revoke insert, update, delete on "TokenUsage" from authenticated;
revoke insert, update, delete on "AiInvocation" from authenticated;
revoke insert, update, delete on "AiFailure" from authenticated;
revoke insert, update, delete on "JobRecord" from authenticated;
revoke insert, update, delete on "JobAttempt" from authenticated;
revoke select, insert, update, delete on "OutboxEvent" from authenticated;
