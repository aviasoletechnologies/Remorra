import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card } from "./ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { EmptyState, TableSkeleton } from "./app-ui";
import { api } from "../lib/api";
import { cn } from "../lib/utils";

type ConversationSummary = {
  id: string;
  kind: "discover" | "refine";
  status: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

type ConversationTranscript = {
  id: string;
  kind: string;
  status: string;
  messages: Array<{ id: string; role: "user" | "assistant" | "system"; content: string; createdAt: string }>;
};

// Read-only archive of Discover/Refine conversations, since the /workspace
// chat is only reachable while the project is still in that phase.
export function ConversationHistoryModal({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversation-history", projectId],
    queryFn: () => api<ConversationSummary[]>(`/projects/${projectId}/conversations`),
    enabled: Boolean(projectId) && open,
  });

  const { data: transcript, isLoading: loadingTranscript } = useQuery({
    queryKey: ["conversation-transcript", projectId, selectedId],
    queryFn: () => api<ConversationTranscript>(`/projects/${projectId}/conversations/${selectedId}`),
    enabled: Boolean(projectId && selectedId) && open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Conversation history</DialogTitle>
          <DialogDescription>Read-only record of your Discover and Refine conversations.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="max-h-[60vh] overflow-y-auto p-3">
            {isLoading ? (
              <TableSkeleton rows={3} columns={1} />
            ) : conversations.length === 0 ? (
              <EmptyState title="No conversations yet" description="Discover and Refine sessions will appear here." />
            ) : (
              <div className="flex flex-col gap-1.5">
                {conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    onClick={() => setSelectedId(conversation.id)}
                    className={cn(
                      "flex items-center justify-between rounded-lg border border-border p-2.5 text-left text-xs hover:bg-secondary/50",
                      selectedId === conversation.id && "border-primary bg-primary/5",
                    )}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium capitalize">{conversation.kind}</span>
                      <span className="text-muted-foreground">{new Date(conversation.createdAt).toLocaleDateString()}</span>
                    </div>
                    <Badge tone={conversation.status === "completed" ? "green" : "amber"}>{conversation.messageCount} msgs</Badge>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="max-h-[60vh] min-h-[300px] overflow-y-auto p-4">
            {!selectedId ? (
              <EmptyState
                title="Select a conversation"
                description="Pick a Discover or Refine session on the left to view its transcript."
              />
            ) : loadingTranscript || !transcript ? (
              <TableSkeleton rows={5} columns={1} />
            ) : (
              <div className="flex flex-col gap-3">
                {transcript.messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed",
                      message.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-secondary/60",
                    )}
                  >
                    {message.content}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
