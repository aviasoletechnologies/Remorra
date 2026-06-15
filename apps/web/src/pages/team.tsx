import { useMutation, useQuery } from "@tanstack/react-query";
import { Mail, UserPlus } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import { Badge, Button, Card } from "../components/ui";

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
  return <div className="page"><section className="page-heading compact-heading"><div><Badge tone="green">Project access</Badge><h1>People and permissions</h1><p>Roles are resolved per project. Suppliers only receive assigned tasks and Build Pack access.</p></div></section>
    <div className="settings-grid"><Card className="settings-card"><UserPlus size={22} /><h2>Invite a collaborator</h2><label>Email<input value={email} type="email" onChange={(event) => setEmail(event.target.value)} placeholder="person@company.com" /></label><label>Project role<select value={role} onChange={(event) => setRole(event.target.value as "team" | "supplier")}><option value="team">Team member</option><option value="supplier">Supplier</option></select></label><Button disabled={email.length < 5 || invite.isPending} onClick={() => invite.mutate()}><Mail size={15} />Send secure invitation</Button>{invite.isSuccess && <p className="success-copy">Invitation sent through Supabase Auth.</p>}</Card>
      <Card className="settings-card"><h2>Current access</h2><div className="permission-row"><strong>Your role</strong><Badge tone="green">{project?.role ?? "loading"}</Badge></div><p>Founder: strategic authority and Evolve. Team: product visibility and delivery editing. Supplier: assigned delivery only.</p></Card></div>
  </div>;
}
