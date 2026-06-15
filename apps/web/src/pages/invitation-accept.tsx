import { useMutation } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card } from "../components/ui";
import { api } from "../lib/api";

export function InvitationAcceptPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const accept = useMutation({
    mutationFn: () => api(`/invitations/${encodeURIComponent(token)}/accept`, { method: "POST" }),
  });
  return <main className="configuration-page"><Card className="auth-card"><Check size={24} /><h1>Join this Remorra project</h1><p>Your project role will be resolved independently from every other workspace.</p>{accept.isSuccess ? <Button onClick={() => navigate("/")}>Open workspace</Button> : <Button disabled={!token || accept.isPending} onClick={() => accept.mutate()}>{accept.isPending ? "Joining..." : "Accept invitation"}</Button>}{accept.error && <p className="form-message">{accept.error.message}</p>}</Card></main>;
}
