import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/brand/empty-state";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link2, Trash2 } from "lucide-react";

interface Connection {
  clientId: string;
  clientName: string;
  scopes: string[];
  firstAuthorizedAt: string;
  lastUsedAt: string | null;
  activeTokenCount: number;
}

interface ConnectionsResponse {
  connections: Connection[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ConnectionsPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [pending, setPending] = useState<Connection | null>(null);

  const { data, isLoading } = useQuery<ConnectionsResponse>({
    queryKey: ["/api/oauth/connections"],
  });

  const revokeMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const res = await apiRequest("DELETE", `/api/oauth/connections/${clientId}`);
      return res.json();
    },
    onSuccess: (_data, clientId) => {
      const conn = data?.connections.find((c) => c.clientId === clientId);
      queryClient.invalidateQueries({ queryKey: ["/api/oauth/connections"] });
      toast({
        title: "Access revoked",
        description: conn ? `Revoked access for ${conn.clientName}` : "Connection revoked",
      });
      setPending(null);
    },
    onError: (e: any) => {
      toast({
        title: "Revoke failed",
        description: e?.message || "Could not revoke access",
        variant: "destructive",
      });
      setPending(null);
    },
  });

  const connections = data?.connections ?? [];

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1
          className="text-2xl font-bold tracking-tight flex items-center gap-2"
          data-testid="text-connections-heading"
        >
          <Link2 className="w-6 h-6 text-primary" />
          Connections
        </h1>
        <p className="text-muted-foreground mt-1" data-testid="text-connections-subtitle">
          OAuth apps that have access to your Allotly account.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-3" data-testid="loading-connections">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {!isLoading && connections.length === 0 && (
        <EmptyState
          icon={<Link2 className="w-10 h-10 text-muted-foreground" />}
          title="No OAuth connections yet"
          description="Connect Allotly to claude.ai, ChatGPT or Gemini and the apps you authorize will appear here."
          action={{
            label: "Connect your first AI tool →",
            onClick: () => setLocation("/dashboard/connect"),
          }}
        />
      )}

      {!isLoading && connections.length > 0 && (
        <div className="border rounded-lg overflow-hidden" data-testid="table-connections">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>App name</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>First authorized</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {connections.map((conn) => (
                <TableRow key={conn.clientId} data-testid={`row-connection-${conn.clientId}`}>
                  <TableCell className="font-medium" data-testid={`text-connection-name-${conn.clientId}`}>
                    {conn.clientName}
                    {conn.activeTokenCount > 1 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({conn.activeTokenCount} active tokens)
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {conn.scopes.map((s) => (
                        <Badge
                          key={s}
                          variant="secondary"
                          className="text-[10px] font-mono no-default-hover-elevate no-default-active-elevate"
                          data-testid={`badge-scope-${conn.clientId}-${s}`}
                        >
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell
                    className="text-sm text-muted-foreground"
                    data-testid={`text-connection-first-${conn.clientId}`}
                  >
                    {formatDate(conn.firstAuthorizedAt)}
                  </TableCell>
                  <TableCell
                    className="text-sm text-muted-foreground"
                    data-testid={`text-connection-last-${conn.clientId}`}
                  >
                    {formatDate(conn.lastUsedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setPending(conn)}
                      data-testid={`button-revoke-${conn.clientId}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Need to add a new app?{" "}
        <Link
          href="/dashboard/connect"
          className="text-primary hover-elevate active-elevate-2 rounded px-1 py-0.5"
          data-testid="link-to-connect"
        >
          Go to Connect AI Tool →
        </Link>
      </p>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent data-testid="dialog-confirm-revoke">
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke access for {pending?.clientName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This immediately revokes every active token this app holds against your account.
              Anyone using this connection will be signed out and will need to re-authorize.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-revoke">Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-revoke"
              onClick={(e) => {
                e.preventDefault();
                if (pending) revokeMutation.mutate(pending.clientId);
              }}
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending ? "Revoking…" : "Revoke access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
