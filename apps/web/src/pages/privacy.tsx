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
  return <div className="page-container py-8 px-6 max-w-[1440px] mx-auto flex flex-col gap-6">
    <section className="flex flex-col gap-2"><div><Badge tone="green">GDPR controls</Badge><h1 className="text-3xl font-bold tracking-tight text-ink mt-3 mb-1">Privacy and your data</h1><p className="text-sm text-muted">Export your information or schedule account deletion with a 30-day grace period.</p></div></section>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6"><Card className="p-8 flex flex-col gap-5 items-start"><div className="w-10 h-10 rounded-lg bg-green/10 flex items-center justify-center"><ShieldCheck size={20} className="text-green" /></div><h2 className="text-lg font-bold text-ink">Portable data export</h2><p className="text-sm text-muted leading-relaxed flex-1">Your encrypted archive includes profile, projects, memberships, product data, conversations, reports, usage, and audit evidence.</p>{exportRecord?.downloadUrl ? <Button className="w-full" onClick={() => window.open(exportRecord.downloadUrl, '_blank')}><Download size={15} className="mr-1.5" />Download export</Button> : <Button disabled={exportData.isPending} className="w-full" onClick={() => exportData.mutate()}><Download size={15} className="mr-1.5" />Request export</Button>}<small className="text-xs text-muted">Generated archives expire after 30 days.</small></Card>
      <Card className="p-8 flex flex-col gap-5 items-start border-red/30 bg-red-soft/10"><div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center"><Trash2 size={20} className="text-red" /></div><h2 className="text-lg font-bold text-ink">Delete account</h2>{profile?.status === "deletion_pending" ? <><p className="text-sm text-muted leading-relaxed flex-1">Deletion is scheduled. You can cancel during the grace period.</p><Button variant="secondary" className="w-full border-red/30 text-red hover:bg-red/10" onClick={() => cancelDeletion.mutate()}><Undo2 size={15} className="mr-1.5" />Cancel deletion</Button></> : <><p className="text-sm text-muted leading-relaxed flex-1">This schedules deletion of personal data, owned projects, files, and authentication identity after 30 days.</p><Button variant="secondary" className="w-full border-red/30 text-red hover:bg-red/10" onClick={() => deleteAccount.mutate()}><Trash2 size={15} className="mr-1.5" />Schedule deletion</Button></>}</Card></div>
  </div>;
}
