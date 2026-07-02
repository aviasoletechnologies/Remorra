import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card } from "../components/ui";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";

export function InvitationAcceptPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setActiveProjectId = useWorkspaceStore((state) => state.setActiveProjectId);
  const token = params.get("token") ?? "";

  const accept = useMutation({
    mutationFn: () =>
      api<{ projectId: string }>(`/invitations/${encodeURIComponent(token)}/accept`, { method: "POST" }),
    onSuccess: (data) => {
      // Team members always enter Venture directly — they skip DRI
      if (data?.projectId) {
        setActiveProjectId(data.projectId);
      }
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      navigate("/venture", { replace: true });
    },
  });

  return (
    <main className="configuration-page">
      <Card className="auth-card">
        <Check size={24} />
        <h1>Join this Remorra project</h1>
        <p>Your project role will be resolved independently from every other workspace.</p>
        {accept.error && <p className="form-message">{accept.error.message}</p>}
        <Button disabled={!token || accept.isPending || accept.isSuccess} onClick={() => accept.mutate()}>
          {accept.isPending ? "Joining..." : accept.isSuccess ? "Redirecting..." : "Accept invitation"}
        </Button>
      </Card>
    </main>
  );
}
