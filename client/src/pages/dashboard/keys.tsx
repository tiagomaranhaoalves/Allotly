import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/brand/empty-state";
import { Key, Copy, Shield, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface ApiKeyInfo {
  id: string;
  keyPrefix: string;
  status: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function KeysPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: keys, isLoading } = useQuery<ApiKeyInfo[]>({
    queryKey: ["/api/my-keys"],
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-keys-heading">API Keys</h1>
        <p className="text-muted-foreground mt-1">Manage your API keys</p>
      </div>

      <Card className="p-6" data-testid="card-api-access">
        <h2 className="text-base font-semibold mb-4">Your API Access</h2>
        <div className="p-4 rounded-lg bg-muted/50 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Base URL</p>
            <code className="font-mono text-sm" data-testid="text-base-url">{window.location.origin}/api/v1</code>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => copyToClipboard(`${window.location.origin}/api/v1`)}
            data-testid="button-copy-base-url"
          >
            <Copy className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          API keys are shown once during provisioning. Contact your team admin if you need a new key.
        </p>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : keys && keys.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Your Keys</h2>
          {keys.map((k) => (
            <Card key={k.id} className="p-5" data-testid={`card-key-${k.id}`}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Key className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <code className="font-mono text-sm font-medium" data-testid={`text-key-prefix-${k.id}`}>
                      {k.keyPrefix}...
                    </code>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        Created {new Date(k.createdAt).toLocaleDateString()}
                      </span>
                      {k.lastUsedAt && (
                        <span className="text-xs text-muted-foreground">
                          · Last used {new Date(k.lastUsedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className={`no-default-hover-elevate no-default-active-elevate ${
                    k.status === "ACTIVE"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                  }`}
                  data-testid={`badge-key-status-${k.id}`}
                >
                  {k.status}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Key className="w-10 h-10 text-muted-foreground" />}
          title="No active keys"
          description="Your team admin will provision API keys for you. Keys will appear here once they're created."
        />
      )}

      <Card className="p-5" data-testid="card-security-info">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Security</h3>
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>API keys are encrypted at rest with AES-256-GCM</li>
          <li>Keys are only shown once during provisioning</li>
          <li>Contact your team admin to revoke or regenerate keys</li>
        </ul>
      </Card>
    </div>
  );
}
