import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { ProviderBadge } from "@/components/brand/provider-badge";
import { AutomationBadge } from "@/components/brand/automation-badge";
import { EmptyState } from "@/components/brand/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plug, Plus, Trash2, Shield } from "lucide-react";
import { useState } from "react";

export default function ProvidersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [displayName, setDisplayName] = useState("");

  const { data: providers, isLoading } = useQuery<any[]>({ queryKey: ["/api/providers"] });

  const addMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/providers", { provider, apiKey, displayName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      toast({ title: "Provider connected successfully" });
      setOpen(false);
      setProvider("");
      setApiKey("");
      setDisplayName("");
    },
    onError: (err: any) => {
      toast({ title: "Failed to connect", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/providers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      toast({ title: "Provider disconnected" });
    },
  });

  if (user?.orgRole !== "ROOT_ADMIN") {
    return (
      <EmptyState
        icon={<Shield className="w-8 h-8 text-muted-foreground" />}
        title="Access Restricted"
        description="Only Root Admins can manage providers"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Providers</h1>
          <p className="text-muted-foreground mt-1">Connect your AI provider accounts</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-connect-provider">
              <Plus className="w-4 h-4 mr-1.5" />
              Connect Provider
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connect AI Provider</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger data-testid="select-provider">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPENAI">OpenAI</SelectItem>
                    <SelectItem value="ANTHROPIC">Anthropic</SelectItem>
                    <SelectItem value="GOOGLE">Google</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Admin API Key</Label>
                <Input
                  type="password"
                  placeholder="sk-... or similar"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  data-testid="input-api-key"
                />
                <p className="text-xs text-muted-foreground">Your key is encrypted with AES-256-GCM and never stored in plaintext.</p>
              </div>
              <div className="space-y-2">
                <Label>Display Name (optional)</Label>
                <Input
                  placeholder="e.g., Production OpenAI"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  data-testid="input-display-name"
                />
              </div>
              <Button
                className="w-full"
                onClick={() => addMutation.mutate()}
                disabled={!provider || !apiKey || addMutation.isPending}
                data-testid="button-submit-provider"
              >
                {addMutation.isPending ? "Connecting..." : "Connect Provider"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : providers && providers.length > 0 ? (
        <div className="space-y-4">
          {providers.map((p: any) => (
            <Card key={p.id} className="p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <ProviderBadge provider={p.provider} />
                  <AutomationBadge level={p.automationLevel} />
                  {p.displayName && p.displayName !== p.provider && (
                    <span className="text-sm text-muted-foreground">{p.displayName}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${p.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"}`}>
                    {p.status}
                  </span>
                  <Button
                    size="icon"
                    variant="secondary"
                    onClick={() => deleteMutation.mutate(p.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-disconnect-${p.provider.toLowerCase()}`}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
              {p.lastValidatedAt && (
                <p className="text-xs text-muted-foreground mt-3">
                  Last validated: {new Date(p.lastValidatedAt).toLocaleString()}
                </p>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Plug className="w-10 h-10 text-muted-foreground" />}
          title="No providers connected"
          description="Connect your OpenAI, Anthropic, or Google account to start provisioning API keys for your team."
          action={{ label: "Connect Provider", onClick: () => setOpen(true) }}
        />
      )}
    </div>
  );
}
