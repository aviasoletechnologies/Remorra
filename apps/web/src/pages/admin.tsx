import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, BrainCircuit, Database, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card } from "../components/ui";
import { api } from "../lib/api";

export function AdminPage() {
  const queryClient = useQueryClient();
  const [skillDrafts, setSkillDrafts] = useState<Record<string, string>>({});
  const [knowledgeDrafts, setKnowledgeDrafts] = useState<Record<string, string>>({});
  const [reportDrafts, setReportDrafts] = useState<Record<string, string>>({});
  const { data: metrics } = useQuery({ queryKey: ["admin-metrics"], queryFn: () => api<any>("/admin/metrics") });
  const { data: skills = [] } = useQuery({ queryKey: ["admin-skills"], queryFn: () => api<any[]>("/admin/skills") });
  const { data: mappings = [] } = useQuery({ queryKey: ["admin-skill-mappings"], queryFn: () => api<any[]>("/admin/skill-mappings") });
  const { data: jobs = [] } = useQuery({ queryKey: ["admin-jobs"], queryFn: () => api<any[]>("/admin/jobs"), refetchInterval: 5000 });
  const { data: retention = [] } = useQuery({ queryKey: ["admin-retention"], queryFn: () => api<any[]>("/admin/retention") });
  const { data: users = [] } = useQuery({ queryKey: ["admin-users"], queryFn: () => api<any[]>("/admin/users") });
  const { data: reports = [] } = useQuery({ queryKey: ["admin-reports"], queryFn: () => api<any[]>("/admin/reports") });
  const { data: knowledge = [] } = useQuery({ queryKey: ["admin-knowledge"], queryFn: () => api<any[]>("/admin/knowledge-bases") });
  const setMapping = useMutation({
    mutationFn: ({ eventType, skillId }: { eventType: string; skillId: string }) =>
      api(`/admin/skill-mappings/${encodeURIComponent(eventType)}`, {
        method: "PUT",
        body: JSON.stringify({ skillId }),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-skill-mappings"] }),
  });
  const activate = useMutation({
    mutationFn: ({ skillId, versionId }: { skillId: string; versionId: string }) =>
      api(`/admin/skills/${skillId}/versions/${versionId}/activate`, { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-skills"] }),
  });
  const createSkillVersion = useMutation({
    mutationFn: ({ skillId, systemPrompt }: { skillId: string; systemPrompt: string }) =>
      api(`/admin/skills/${skillId}/versions`, { method: "POST", body: JSON.stringify({ systemPrompt }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-skills"] }),
  });
  const createKnowledgeVersion = useMutation({
    mutationFn: ({ id, markdown }: { id: string; markdown: string }) =>
      api(`/admin/knowledge-bases/${id}/versions`, { method: "POST", body: JSON.stringify({ markdown, activate: true }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-knowledge"] }),
  });
  const createReportVersion = useMutation({
    mutationFn: ({ id, templateKey }: { id: string; templateKey: string }) =>
      api(`/admin/reports/${id}/versions`, { method: "POST", body: JSON.stringify({ templateKey, activate: true }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-reports"] }),
  });
  const retryJob = useMutation({
    mutationFn: (id: string) => api(`/admin/jobs/${id}/retry`, { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-jobs"] }),
  });
  const updateRetention = useMutation({
    mutationFn: ({ id, retentionDays }: { id: string; retentionDays: number }) =>
      api(`/admin/retention/${id}`, { method: "PATCH", body: JSON.stringify({ retentionDays }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-retention"] }),
  });
  const updateRole = useMutation({
    mutationFn: ({ id, platformRole }: { id: string; platformRole: string }) =>
      api(`/admin/users/${id}/platform-role`, { method: "PATCH", body: JSON.stringify({ platformRole }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  return <div className="page admin-page">
    <section className="page-heading compact-heading"><div><Badge tone="red">Internal administration</Badge><h1>Platform operations</h1><p>Usage, skills, routing, jobs, retention, and audit controls are isolated from project roles.</p></div></section>
    <section className="admin-metrics"><Card><Activity /><span>Users</span><strong>{metrics?.users ?? "-"}</strong></Card><Card><Database /><span>Projects</span><strong>{metrics?.projects ?? "-"}</strong></Card><Card><ShieldCheck /><span>Failed jobs</span><strong>{metrics?.failedJobs ?? "-"}</strong></Card><Card><BrainCircuit /><span>AI tokens</span><strong>{(metrics?.tokens?.inputTokens ?? 0) + (metrics?.tokens?.outputTokens ?? 0)}</strong><small>Cost minor {metrics?.tokens?.costMinor ?? 0}</small></Card></section>
    <div className="admin-grid">
      <Card className="admin-table"><h2>Skill registry</h2>{skills.map((skill) => { const active = skill.versions.find((item: any) => item.active); const newest = skill.versions[0]; const draft = skillDrafts[skill.id] ?? active?.systemPrompt ?? newest?.systemPrompt ?? ""; return <div className="admin-row admin-row--stack" key={skill.id}><div><strong>{skill.name}</strong><small>{skill.id}</small></div><div className="inline-actions">{newest && newest.id !== active?.id ? <Button variant="secondary" onClick={() => activate.mutate({ skillId: skill.id, versionId: newest.id })}>Activate v{newest.version}</Button> : <Badge tone={active ? "green" : "amber"}>{active ? `v${active.version}` : "inactive"}</Badge>}<Button variant="secondary" onClick={() => createSkillVersion.mutate({ skillId: skill.id, systemPrompt: draft })}>Create prompt version</Button></div><textarea className="admin-textarea" value={draft} onChange={(event) => setSkillDrafts((current) => ({ ...current, [skill.id]: event.target.value }))} /></div>; })}</Card>
      <Card className="admin-table"><h2>Automatic skill routing</h2>{mappings.map((mapping) => <div className="admin-row" key={mapping.eventType}><div><strong>{mapping.eventType}</strong><small>Resolved when the worker starts the job</small></div><select aria-label={`Skill for ${mapping.eventType}`} value={mapping.skillId} onChange={(event) => setMapping.mutate({ eventType: mapping.eventType, skillId: event.target.value })}>{skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></div>)}</Card>
      <Card className="admin-table"><h2>Recent jobs</h2>{jobs.slice(0, 12).map((job) => <div className="admin-row" key={job.id}><div><strong>{job.queue}</strong><small>{job.id.slice(0, 8)} {job.error ? `- ${job.error}` : ""}</small></div><div className="inline-actions"><Badge tone={job.status === "completed" ? "green" : job.status === "failed" ? "red" : "amber"}>{job.status}</Badge>{job.status === "failed" ? <Button variant="secondary" onClick={() => retryJob.mutate(job.id)}>Retry</Button> : null}</div></div>)}</Card>
      <Card className="admin-table"><h2>Report definitions</h2>{reports.map((report) => { const active = report.versions.find((item: any) => item.active) ?? report.versions[0]; const draft = reportDrafts[report.id] ?? active?.templateKey ?? ""; return <div className="admin-row admin-row--stack" key={report.id}><div><strong>{report.name}</strong><small>{active?.requiresLlm ? "LLM content" : "Deterministic"} · v{active?.version ?? "-"}</small></div><input aria-label={`Template for ${report.name}`} value={draft} onChange={(event) => setReportDrafts((current) => ({ ...current, [report.id]: event.target.value }))} /><Button variant="secondary" onClick={() => createReportVersion.mutate({ id: report.id, templateKey: draft })}>Create active version</Button></div>; })}</Card>
      <Card className="admin-table"><h2>Knowledge bases</h2>{knowledge.map((base) => { const active = base.versions.find((item: any) => item.active) ?? base.versions[0]; const draft = knowledgeDrafts[base.id] ?? active?.markdown ?? ""; return <div className="admin-row admin-row--stack" key={base.id}><div><strong>{base.name}</strong><small>{base.topic}</small></div><textarea className="admin-textarea" value={draft} onChange={(event) => setKnowledgeDrafts((current) => ({ ...current, [base.id]: event.target.value }))} /><Button variant="secondary" onClick={() => createKnowledgeVersion.mutate({ id: base.id, markdown: draft })}>Create active version</Button></div>; })}</Card>
      <Card className="admin-table"><h2>Retention policies</h2>{retention.map((policy) => <div className="admin-row" key={policy.id}><div><strong>{policy.description}</strong><small>{policy.id}</small></div><input aria-label={`Days for ${policy.id}`} type="number" value={policy.retentionDays ?? ""} onChange={(event) => updateRetention.mutate({ id: policy.id, retentionDays: Number(event.target.value) })} /></div>)}</Card>
      <Card className="admin-table"><h2>Platform users</h2>{users.slice(0, 20).map((user) => <div className="admin-row" key={user.id}><div><strong>{user.preferredName || user.email}</strong><small>{user.status}</small></div><select value={user.platformRole} onChange={(event) => updateRole.mutate({ id: user.id, platformRole: event.target.value })}><option value="user">user</option><option value="support">support</option><option value="admin">admin</option></select></div>)}</Card>
    </div>
  </div>;
}
