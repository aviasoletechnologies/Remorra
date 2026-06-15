import { useMutation, useQuery } from "@tanstack/react-query";
import { Mail, UserPlus } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import { Badge, Button, Card, Input } from "../components/ui";

export function TeamPage() {
  const projectId = useWorkspaceStore((state) => state.activeProjectId);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"team" | "supplier">("team");
  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api<any>(`/projects/${projectId}`),
    enabled: Boolean(projectId),
  });
  const invite = useMutation({
    mutationFn: () =>
      api(`/projects/${projectId}/invitations`, {
        method: "POST",
        body: JSON.stringify({ email, role }),
      }),
    onSuccess: () => setEmail(""),
  });
  return <div className="page-container py-8 px-6 max-w-[1440px] mx-auto flex flex-col gap-6">
    <section className="flex flex-col gap-2"><div><Badge tone="green">Project access</Badge><h1 className="text-3xl font-bold tracking-tight text-ink mt-3 mb-1">People and permissions</h1><p className="text-sm text-muted">Roles are resolved per project. Suppliers only receive assigned tasks and Build Pack access.</p></div></section>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6"><Card className="p-8 flex flex-col gap-5"><div className="flex items-center gap-3 mb-2"><div className="w-10 h-10 rounded-lg bg-green-soft flex items-center justify-center"><UserPlus size={20} className="text-green" /></div><h2 className="text-lg font-bold text-ink">Invite a collaborator</h2></div><div className="flex flex-col gap-2"><label className="text-xs font-bold text-ink uppercase tracking-wider">Email</label><Input value={email} type="email" onChange={(event) => setEmail(event.target.value)} placeholder="person@company.com" /></div><div className="flex flex-col gap-2"><label className="text-xs font-bold text-ink uppercase tracking-wider">Project role</label><select className="h-10 w-full rounded-md border border-border-remorra bg-surface px-3 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-accent/20 transition-all" value={role} onChange={(event) => setRole(event.target.value as "team" | "supplier")}><option value="team">Team member</option><option value="supplier">Supplier</option></select></div><Button className="mt-2" disabled={email.length < 5 || invite.isPending} onClick={() => invite.mutate()}><Mail size={15} className="mr-1.5" />Send secure invitation</Button>{invite.isSuccess && <p className="text-xs text-green font-medium text-center">Invitation sent through Supabase Auth.</p>}</Card>
      <Card className="p-8 flex flex-col gap-5"><h2 className="text-lg font-bold text-ink mb-2">Current access</h2><div className="flex items-center justify-between p-4 rounded-xl border border-border-remorra bg-surface-2"><strong className="text-sm font-bold text-ink">Your role</strong><Badge tone="green" className="uppercase tracking-wider">{project?.role ?? "loading"}</Badge></div><div className="mt-auto p-4 rounded-xl bg-green-soft/30 border border-green/20"><p className="text-xs text-muted leading-relaxed"><strong className="text-green">Founder:</strong> strategic authority and Evolve.<br/><strong className="text-green">Team:</strong> product visibility and delivery editing.<br/><strong className="text-green">Supplier:</strong> assigned delivery only.</p></div></Card></div>
  </div>;
}
