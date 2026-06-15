import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, ShieldCheck, Trash2, Undo2 } from "lucide-react";
import { api } from "../lib/api";
import { Badge, Button, Card } from "../components/ui";

export function PrivacyPage() {
  const { data: profile, refetch } = useQuery({ queryKey: ["me"], queryFn: () => api<any>("/auth/me") });
  const { data: exportRecord, refetch: refetchExport } = useQuery({ queryKey: ["data-export"], queryFn: () => api<any>("/users/me/export") });
  const exportData = useMutation({ mutationFn: () => api("/users/me/export", { method: "POST" }), onSuccess: () => void refetchExport() });
  const deleteAccount = useMutation({ mutationFn: () => api("/users/me/deletion", { method: "POST" }), onSuccess: () => void refetch() });
  const cancelDeletion = useMutation({ mutationFn: () => api("/users/me/deletion", { method: "DELETE" }), onSuccess: () => void refetch() });
  return <div className="page"><section className="page-heading compact-heading"><div><Badge tone="green">GDPR controls</Badge><h1>Privacy and your data</h1><p>Export your information or schedule account deletion with a 30-day grace period.</p></div></section>
    <div className="settings-grid"><Card className="settings-card"><ShieldCheck size={22} /><h2>Portable data export</h2><p>Your encrypted archive includes profile, projects, memberships, product data, conversations, reports, usage, and audit evidence.</p>{exportRecord?.downloadUrl ? <a className="button button--primary" href={exportRecord.downloadUrl} target="_blank" rel="noreferrer"><Download size={15} />Download export</a> : <Button disabled={exportData.isPending} onClick={() => exportData.mutate()}><Download size={15} />Request export</Button>}<small>Generated archives expire after 30 days.</small></Card>
      <Card className="settings-card danger-card"><Trash2 size={22} /><h2>Delete account</h2>{profile?.status === "deletion_pending" ? <><p>Deletion is scheduled. You can cancel during the grace period.</p><Button variant="secondary" onClick={() => cancelDeletion.mutate()}><Undo2 size={15} />Cancel deletion</Button></> : <><p>This schedules deletion of personal data, owned projects, files, and authentication identity after 30 days.</p><Button variant="secondary" onClick={() => deleteAccount.mutate()}><Trash2 size={15} />Schedule deletion</Button></>}</Card></div>
  </div>;
}
