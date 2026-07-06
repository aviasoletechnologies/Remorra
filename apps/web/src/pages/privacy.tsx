import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, ShieldCheck, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
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
  const purgeData = useMutation({
    mutationFn: () => api("/users/me/purge-data", { method: "POST" }),
    onSuccess: () => {
      window.location.reload();
    },
  });
  const cancelSubMutation = useMutation({
    mutationFn: (body: { reason: string }) =>
      api("/users/me/subscription/cancel", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success("Subscription cancelled successfully!");
      setCancelReason("");
      void refetch();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to cancel subscription.");
    },
  });

  const [cancelReason, setCancelReason] = useState("");
  const deletionPending = profile?.status === "deletion_pending";

  return (
    <Page>
      <PageHeader
        eyebrow="GDPR controls"
        title="Privacy and your data"
        description="Export your information, reset chat history, or schedule account deletion with a 30-day grace period."
      />
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
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

        <SectionCard title="Subscription management" description="View and manage your service level and billing">
          <div className="grid min-h-64 gap-5">
            <div className="grid size-11 place-items-center rounded-xl bg-accent-soft text-primary">
              <ShieldCheck size={21} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Current Plan</span>
              <span className="text-lg font-bold capitalize text-foreground">{profile?.tier ?? "Free"} Tier</span>
            </div>
            <p className="m-0 text-sm leading-6 text-muted-foreground">
              {profile?.tier === "free"
                ? "You are currently on the Free plan. Upgrade to access premium AI reasoning models, unlimited documents generation, and advanced integrations."
                : "Your paid subscription is active. You have full access to high-fidelity AI models and collaborative features."}
            </p>
            <div className="mt-auto">
              {profile?.tier !== "free" ? (
                <AlertDialog>
                  <AlertDialogTrigger render={<Button variant="outline" className="w-full border-destructive/25 text-destructive" />}>
                    Cancel subscription
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel subscription?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Please let us know why you are cancelling. This is required to process the cancellation:
                      </AlertDialogDescription>
                      <textarea
                        className="w-full min-h-[80px] p-2 mt-2 border rounded-md text-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="Reason for cancellation (required)..."
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                      />
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setCancelReason("")}>Keep subscription</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        disabled={!cancelReason.trim() || cancelSubMutation.isPending}
                        onClick={() => cancelSubMutation.mutate({ reason: cancelReason })}
                      >
                        {cancelSubMutation.isPending ? "Cancelling..." : "Confirm cancellation"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Button className="w-full" onClick={() => alert("Stripe payments are skipped for now.")}>
                  Upgrade to premium
                </Button>
              )}
            </div>
          </div>
        </SectionCard>

        <Card className="border-amber-500/20 bg-amber-500/5 p-0">
          <div className="section-card-header border-amber-500/15 bg-amber-500/10">
            <div>
              <h2>Clean chat & logs</h2>
              <p>Instantly reset your workspace conversations and jobs</p>
            </div>
            <Badge tone="amber">Data Reset</Badge>
          </div>
          <div className="section-card-content grid min-h-64 gap-5">
            <div className="grid size-11 place-items-center rounded-xl bg-amber-500/10 text-amber-600">
              <Undo2 className="rotate-180" size={21} />
            </div>
            <p className="m-0 text-sm leading-6 text-muted-foreground">
              This will permanently delete all message histories, AI invocation logs, token usage, and background jobs across your projects. Your account details and projects will remain intact.
            </p>
            <div className="mt-auto">
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="outline" className="w-full border-amber-500/25 text-amber-700 hover:bg-amber-500/10 hover:text-amber-800" />}>
                  <Undo2 className="rotate-180" size={15} /> Clean chat & data
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clean chat history and data?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. All active chat messages, AI outputs, and background run logs will be permanently deleted across your projects.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                      onClick={() => purgeData.mutate()}
                    >
                      {purgeData.isPending ? "Purging data..." : "Clean data"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </Card>

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
