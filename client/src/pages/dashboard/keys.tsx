import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/brand/empty-state";
import { Key } from "lucide-react";

export default function KeysPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
        <p className="text-muted-foreground mt-1">Manage your API keys</p>
      </div>

      <Card className="p-6">
        <h2 className="text-base font-semibold mb-4">Your API Access</h2>
        <div className="p-4 rounded-lg bg-muted/50">
          <p className="text-sm text-muted-foreground mb-2">Base URL</p>
          <code className="font-mono text-sm">{window.location.origin}/api/v1</code>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          API keys are shown once during provisioning. Contact your team admin if you need a new key.
        </p>
      </Card>

      <EmptyState
        icon={<Key className="w-10 h-10 text-muted-foreground" />}
        title="No active keys"
        description="Your team admin will provision API keys for you"
      />
    </div>
  );
}
