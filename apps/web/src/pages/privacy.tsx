import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, ShieldCheck, Trash2, Undo2 } from "lucide-react";
import { api } from "../lib/api";
import { Badge, Button, Card } from "../components/ui";
import { Page, PageHeader, SectionCard } from "../components/app-ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../components/ui/alert-dialog";

export function PrivacyPage() {
  const { data: profile, refetch } = useQuery({ queryKey: ["me"], queryFn: () => api<any>("/auth/me") });
  const { data: exportRecord, refetch: refetchExport } = useQuery({ queryKey: ["data-export"], queryFn: () => api<any>("/users/me/export") });
  const exportData = useMutation({ mutationFn: () => api("/users/me/export", { method: "POST" }), onSuccess: () => void refetchExport() });
  const deleteAccount = useMutation({ mutationFn: () => api("/users/me/deletion", { method: "POST" }), onSuccess: () => void refetch() });
  const cancelDeletion = useMutation({ mutationFn: () => api("/users/me/deletion", { method: "DELETE" }), onSuccess: () => void refetch() });
  const deletionPending = profile?.status === "deletion_pending";

  return (
    <Page>
      <PageHeader
        eyebrow="GDPR controls"
        title="Privacy and your data"
        description="Export your information or schedule account deletion with a 30-day grace period."
      />
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Portable data export" description="A complete, encrypted archive of your Remorra data">
          <div className="grid min-h-64 gap-5">
            <div className="grid size-11 place-items-center rounded-xl bg-accent-soft text-primary"><ShieldCheck size={21} /></div>
            <p className="m-0 text-sm leading-6 text-muted-foreground">
              Your archive includes profile, projects, memberships, product data, conversations, reports, usage, and audit evidence.
            </p>
            <div className="mt-auto">
              {exportRecord?.downloadUrl ? (
                <Button className="w-full" onClick={() => window.open(exportRecord.downloadUrl, "_blank")}><Download size={15} /> Download export</Button>
              ) : (
                <Button className="w-full" disabled={exportData.isPending} onClick={() => exportData.mutate()}>
                  <Download size={15} /> {exportData.isPending ? "Preparing request..." : "Request export"}
                </Button>
              )}
              <p className="mb-0 mt-3 text-xs text-muted-foreground">Generated archives expire after 30 days.</p>
            </div>
          </div>
        </SectionCard>

        <Card className="border-destructive/20 bg-destructive-soft/28 p-0">
          <div className="section-card-header border-destructive/15 bg-destructive-soft/35">
            <div><h2>Delete account</h2><p>Permanent deletion after a protected grace period</p></div>
            <Badge tone={deletionPending ? "amber" : "red"}>{deletionPending ? "Scheduled" : "Destructive"}</Badge>
          </div>
          <div className="section-card-content grid min-h-64 gap-5">
            <div className="grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive"><Trash2 size={21} /></div>
            <p className="m-0 text-sm leading-6 text-muted-foreground">
              {deletionPending
                ? "Deletion is scheduled. You can cancel during the 30-day grace period and retain the account."
                : "This schedules deletion of personal data, owned projects, private files, pending jobs, and the authentication identity."}
            </p>
            <div className="mt-auto">
              {deletionPending ? (
                <Button variant="outline" className="w-full border-destructive/25 text-destructive" onClick={() => cancelDeletion.mutate()}>
                  <Undo2 size={15} /> Cancel scheduled deletion
                </Button>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger render={<Button variant="destructive" className="w-full" />}>
                    <Trash2 size={15} /> Schedule deletion
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Schedule account deletion?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Your account enters a 30-day grace period. After that, personal data, owned projects, files, and authentication access are permanently removed.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep account</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteAccount.mutate()}>Schedule deletion</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </Card>
      </section>
    </Page>
  );
}
