import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/brand/empty-state";
import { Activity } from "lucide-react";

export default function UsagePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Usage</h1>
        <p className="text-muted-foreground mt-1">View your API usage history</p>
      </div>

      <EmptyState
        icon={<Activity className="w-10 h-10 text-muted-foreground" />}
        title="No usage data yet"
        description="Your API usage will appear here once you start making requests"
      />
    </div>
  );
}
