import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import { Badge, Button, Input } from "../components/ui";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Page, PageHeader, SectionCard } from "../components/app-ui";

interface ProjectWithRole {
  id: string;
  name: string;
  phase: string;
  role: "founder" | "team";
}

interface Member {
  userId: string;
  role: string;
  createdAt: string;
  user: { email: string; preferredName: string | null };
}

export function TeamPage() {
  const projectId = useWorkspaceStore((state) => state.activeProjectId);
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"team">("team");

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api<ProjectWithRole>(`/projects/${projectId}`),
    enabled: Boolean(projectId),
  });

  const { data: members = [] } = useQuery({
    queryKey: ["members", projectId],
    queryFn: () => api<Member[]>(`/projects/${projectId}/members`),
    enabled: Boolean(projectId),
  });

  const invite = useMutation({
    mutationFn: () =>
      api(`/projects/${projectId}/invitations`, { method: "POST", body: JSON.stringify({ email, role }) }),
    onSuccess: () => {
      setEmail("");
      void queryClient.invalidateQueries({ queryKey: ["members", projectId] });
    },
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) =>
      api(`/projects/${projectId}/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["members", projectId] }),
  });

  const isFounder = project?.role === "founder";

  return (
    <Page>
      <PageHeader
        eyebrow="Project access"
        title="People and permissions"
        description="Roles are resolved per project. Team members share the founder's Venture access once onboarding is complete."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_.9fr]">

        {/* Left column: invite form (founders only) + members list */}
        <div className="flex flex-col gap-4">
          {isFounder ? (
            <SectionCard title="Invite a collaborator" description="Supabase will send a secure project invitation">
              <div className="grid gap-5">
                <div className="grid gap-2">
                  <Label htmlFor="invite-email">Email address</Label>
                  <Input
                    id="invite-email"
                    value={email}
                    type="email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="person@company.com"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="invite-role">Project role</Label>
                  <Select value={role} onValueChange={(value) => setRole(value as "team")}>
                    <SelectTrigger id="invite-role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="team">Team member</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button disabled={email.length < 5 || invite.isPending} onClick={() => invite.mutate()}>
                  <Mail size={15} /> {invite.isPending ? "Sending..." : "Send secure invitation"}
                </Button>
                {invite.isSuccess ? (
                  <p className="m-0 text-xs font-semibold text-primary">Invitation sent through Supabase Auth.</p>
                ) : null}
                {invite.error ? <p className="form-message m-0">{invite.error.message}</p> : null}
              </div>
            </SectionCard>
          ) : (
            <SectionCard title="Invite a collaborator" description="Only the project founder can manage team access">
              <p className="text-sm text-muted-foreground">
                You are a <strong>team member</strong> on this project. Contact the founder to add or remove collaborators.
              </p>
            </SectionCard>
          )}

          {/* Members list */}
          <SectionCard title="Current team" description="Active members with access to this project">
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No team members yet. Invite someone above.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {members.map((member) => (
                  <div
                    key={member.userId}
                    className="flex items-center justify-between rounded-xl border border-border bg-secondary/45 px-4 py-3"
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-sm font-semibold truncate">
                        {member.user.preferredName ?? member.user.email}
                      </span>
                      <span className="text-[11px] text-muted-foreground truncate">{member.user.email}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <Badge tone={member.role === "founder" ? "green" : "blue"}>{member.role}</Badge>
                      {isFounder && member.role !== "founder" ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${member.user.email}`}
                          disabled={removeMember.isPending}
                          onClick={() => removeMember.mutate(member.userId)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 size={14} />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Right column: role model info */}
        <SectionCard title="Role model" description="Access follows the active product workspace">
          <div className="grid gap-4">
            <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/45 p-4">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck size={17} className="text-primary" /> Your role
              </span>
              <Badge tone="green">{project?.role ?? "loading"}</Badge>
            </div>
            {[
              ["Founder", "Strategic authority. Completes Discover → Refine → Initiate. Can change Goals, pull Build Pack, and manage team access."],
              ["Team", "Invited collaborator. Enters Venture directly. Can edit Epics, Stories, Personas, and RAID items. Cannot change Goals or manage roles."],
            ].map(([name, description]) => (
              <div className="flex gap-3 rounded-xl border border-border/70 p-4" key={name}>
                <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-primary">
                  <UserPlus size={15} />
                </div>
                <div>
                  <strong className="block text-sm">{name}</strong>
                  <p className="mb-0 mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

      </div>
    </Page>
  );
}
