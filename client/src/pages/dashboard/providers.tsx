import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { ProviderBadge } from "@/components/brand/provider-badge";
import { EmptyState } from "@/components/brand/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plug, Plus, Trash2, Shield, RefreshCw, ChevronDown, ChevronRight, RotateCw, Zap, Activity, Cloud, AlertTriangle, Pencil } from "lucide-react";
import { useState } from "react";

interface AzureDeployment {
  deploymentName: string;
  modelId: string;
  inputPricePerMTok: number;
  outputPricePerMTok: number;
}

interface ProviderConnection {
  id: string;
  provider: string;
  displayName: string;
  status: string;
  lastValidatedAt: string | null;
  orgAllowedModels: string[] | null;
  createdAt: string;
  azureBaseUrl?: string | null;
  azureApiVersion?: string | null;
  azureEndpointMode?: string | null;
  azureDeployments?: AzureDeployment[] | null;
}


interface HealthData {
  lastValidated: string | null;
  validationStatus: "valid" | "invalid";
  last1h: { requests: number; errors: number; errorRate: number; avgLatencyMs: number };
  last24h: { requests: number; errors: number; errorRate: number; avgLatencyMs: number };
  lastSuccessfulRequest: string | null;
  lastError: { timestamp: string; statusCode: number; message: string } | null;
}

interface TestResult {
  success: boolean;
  latencyMs: number;
  model: string;
  response?: string;
  error?: string;
}

function validateAzureBaseUrl(url: string): { valid: boolean; warning?: string } {
  if (!url.startsWith("https://")) {
    return { valid: false };
  }
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    if (hostname.endsWith(".openai.azure.com") || hostname.endsWith(".services.ai.azure.com")) {
      return { valid: true };
    }
    return { valid: true, warning: "Hostname doesn't match known Azure patterns (*.openai.azure.com or *.services.ai.azure.com). This may still work if you have a custom endpoint." };
  } catch {
    return { valid: false };
  }
}

export default function ProvidersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [azureBaseUrl, setAzureBaseUrl] = useState("");
  const [azureEndpointMode, setAzureEndpointMode] = useState<"v1" | "legacy">("legacy");
  const [azureApiVersion, setAzureApiVersion] = useState("");
  const { data: providers, isLoading } = useQuery<ProviderConnection[]>({ queryKey: ["/api/providers"] });

  const resetForm = () => {
    setProvider("");
    setApiKey("");
    setDisplayName("");
    setAzureBaseUrl("");
    setAzureEndpointMode("legacy");
    setAzureApiVersion("");
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { provider, apiKey, displayName };
      if (provider === "AZURE_OPENAI") {
        body.azureBaseUrl = azureBaseUrl.replace(/\/+$/, "").replace(/\/openai\/?$/, "");
        body.azureEndpointMode = azureEndpointMode;
        if (azureEndpointMode === "legacy") {
          body.azureApiVersion = azureApiVersion || null;
        }
        body.azureDeployments = [];
      }
      const res = await apiRequest("POST", "/api/providers", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      toast({ title: "AI Provider connected successfully" });
      setOpen(false);
      resetForm();
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
      toast({ title: "AI Provider disconnected" });
    },
  });

  const azureUrlValidation = azureBaseUrl ? validateAzureBaseUrl(azureBaseUrl) : null;

  const isAzureFormValid = provider === "AZURE_OPENAI"
    ? apiKey && azureBaseUrl && azureUrlValidation?.valid
    : true;

  const isFormValid = provider && apiKey && isAzureFormValid;

  if (user?.orgRole !== "ROOT_ADMIN") {
    return (
      <EmptyState
        icon={<Shield className="w-8 h-8 text-muted-foreground" />}
        title="Access Restricted"
        description="Only Root Admins can manage AI Providers"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-providers-heading">AI Providers</h1>
          <p className="text-muted-foreground mt-1">Connect your AI Provider accounts (up to 4)</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button data-testid="button-connect-provider" disabled={providers && providers.length >= 4}>
              <Plus className="w-4 h-4 mr-1.5" />
              Connect AI Provider
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Connect AI Provider</DialogTitle>
              <DialogDescription>
                {provider === "AZURE_OPENAI"
                  ? "Connect your Azure resource. Allotly uses the model name as the deployment name automatically — no mapping needed."
                  : "Connect your OpenAI, Anthropic, Google, or Azure API key. The key will be validated against the provider's API before saving."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>AI Provider</Label>
                <Select value={provider} onValueChange={(v) => { setProvider(v); resetForm(); setProvider(v); }}>
                  <SelectTrigger data-testid="select-provider">
                    <SelectValue placeholder="Select AI Provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPENAI">OpenAI</SelectItem>
                    <SelectItem value="ANTHROPIC">Anthropic</SelectItem>
                    <SelectItem value="GOOGLE">Google</SelectItem>
                    <SelectItem value="AZURE_OPENAI">Azure</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {provider === "AZURE_OPENAI" ? (
                <>
                  <div className="space-y-2">
                    <Label>Display Name (optional)</Label>
                    <Input
                      placeholder='e.g., "Production Azure"'
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      data-testid="input-display-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Azure Base URL</Label>
                    <Input
                      placeholder="https://contoso.openai.azure.com"
                      value={azureBaseUrl}
                      onChange={e => setAzureBaseUrl(e.target.value)}
                      data-testid="input-azure-base-url"
                    />
                    <p className="text-xs text-muted-foreground">
                      Your Azure endpoint. Accepts {"{name}"}.openai.azure.com, APIM gateways, and {"{name}"}.services.ai.azure.com
                    </p>
                    {azureUrlValidation && !azureUrlValidation.valid && (
                      <p className="text-xs text-destructive">URL must start with https://</p>
                    )}
                    {azureUrlValidation?.warning && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" /> {azureUrlValidation.warning}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <Input
                      type="password"
                      placeholder="Your Azure API key"
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      data-testid="input-api-key"
                    />
                    <p className="text-xs text-muted-foreground">Your key is encrypted with AES-256-GCM and never stored in plaintext.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Endpoint Mode</Label>
                    <div className="space-y-2">
                      <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30 transition-colors" data-testid="radio-endpoint-legacy">
                        <input
                          type="radio"
                          name="endpointMode"
                          checked={azureEndpointMode === "legacy"}
                          onChange={() => setAzureEndpointMode("legacy")}
                          className="mt-0.5"
                        />
                        <div>
                          <p className="text-sm font-medium">Legacy versioned API (recommended)</p>
                          <p className="text-xs text-muted-foreground">Uses /openai/deployments/{"{name}"}/chat/completions. Works with APIM and standard Azure endpoints.</p>
                        </div>
                      </label>
                      <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30 transition-colors" data-testid="radio-endpoint-v1">
                        <input
                          type="radio"
                          name="endpointMode"
                          checked={azureEndpointMode === "v1"}
                          onChange={() => setAzureEndpointMode("v1")}
                          className="mt-0.5"
                        />
                        <div>
                          <p className="text-sm font-medium">v1 API</p>
                          <p className="text-xs text-muted-foreground">Uses /openai/v1/chat/completions. No api-version needed. Only works with direct Azure endpoints.</p>
                        </div>
                      </label>
                    </div>
                  </div>
                  {azureEndpointMode === "legacy" && (
                    <div className="space-y-2">
                      <Label>API Version (advanced)</Label>
                      <Input
                        value={azureApiVersion}
                        onChange={e => setAzureApiVersion(e.target.value)}
                        placeholder="Auto (recommended)"
                        data-testid="input-azure-api-version"
                      />
                      <p className="text-xs text-muted-foreground">Leave empty for Allotly to auto-pick the right version per model. Override only if you have a specific compatibility need.</p>
                    </div>
                  )}
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-sm flex items-start gap-2">
                    <Cloud className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-blue-700 dark:text-blue-300">Pass-through mode</p>
                      <p className="text-blue-600 dark:text-blue-400 text-xs mt-0.5">
                        Allotly uses the model name as the Azure deployment name. No deployment mapping needed — just send requests with the model name (e.g., <code className="font-mono">gpt-4.1</code>) or use the <code className="font-mono">azure/</code> prefix.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
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
                </>
              )}

              <Button
                className="w-full"
                onClick={() => addMutation.mutate()}
                disabled={!isFormValid || addMutation.isPending}
                data-testid="button-submit-provider"
              >
                {addMutation.isPending ? "Validating & Connecting..." : "Validate & Connect"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : providers && providers.length > 0 ? (
        <div className="space-y-4">
          {providers.map((p) => (
            <ProviderCard
              key={p.id}
              connection={p}
              expanded={expandedId === p.id}
              onToggleExpand={() => setExpandedId(expandedId === p.id ? null : p.id)}
              onDelete={() => deleteMutation.mutate(p.id)}
              isDeleting={deleteMutation.isPending}
            />
          ))}
          {providers.length < 4 && (
            <p className="text-xs text-muted-foreground text-center">
              {4 - providers.length} AI Provider connection{4 - providers.length !== 1 ? 's' : ''} remaining
            </p>
          )}
        </div>
      ) : (
        <EmptyState
          icon={<Plug className="w-10 h-10 text-muted-foreground" />}
          title="Connect your first AI provider"
          description="Connect your OpenAI, Anthropic, Google, or Azure account to start provisioning API keys for your team."
          action={{ label: "Connect Provider", onClick: () => setOpen(true) }}
        />
      )}
    </div>
  );
}

function ProviderCard({
  connection: p,
  expanded,
  onToggleExpand,
  onDelete,
  isDeleting,
}: {
  connection: ProviderConnection;
  expanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const { toast } = useToast();
  const [rotateOpen, setRotateOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [showHealth, setShowHealth] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [editAzureOpen, setEditAzureOpen] = useState(false);
  const [editAzureBaseUrl, setEditAzureBaseUrl] = useState(p.azureBaseUrl || "");
  const [editAzureEndpointMode, setEditAzureEndpointMode] = useState<"v1" | "legacy">((p.azureEndpointMode as "v1" | "legacy") || "legacy");
  const [editAzureApiVersion, setEditAzureApiVersion] = useState(p.azureApiVersion || "");

  const { data: health } = useQuery<HealthData>({
    queryKey: ["/api/providers", p.id, "health"],
    queryFn: async () => {
      const res = await fetch(`/api/providers/${p.id}/health`);
      if (!res.ok) throw new Error("Failed to fetch health");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const validateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/providers/${p.id}/validate-now`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/providers", p.id, "health"] });
      if (data.valid) {
        toast({ title: "Key validated successfully" });
      } else {
        toast({ title: "Key validation failed", description: data.error, variant: "destructive" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Validation error", description: err.message, variant: "destructive" });
    },
  });

  const rotateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/providers/${p.id}/rotate-key`, { newApiKey: newKey });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/providers", p.id, "health"] });
      toast({ title: "Provider key rotated successfully" });
      setRotateOpen(false);
      setNewKey("");
    },
    onError: (err: any) => {
      toast({ title: "Key rotation failed", description: err.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/providers/${p.id}/test-connection`);
      return res.json();
    },
    onSuccess: (data: TestResult) => {
      setTestResult(data);
      if (data.success) {
        toast({ title: `Connection test passed (${data.latencyMs}ms)` });
      } else {
        toast({ title: "Connection test failed", description: data.error, variant: "destructive" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    },
  });

  const editAzureMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        azureBaseUrl: editAzureBaseUrl.replace(/\/+$/, "").replace(/\/openai\/?$/, ""),
        azureEndpointMode: editAzureEndpointMode,
      };
      if (editAzureEndpointMode === "legacy") {
        body.azureApiVersion = editAzureApiVersion || null;
      }
      await apiRequest("PATCH", `/api/providers/${p.id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      toast({ title: "Azure connection updated" });
      setEditAzureOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const editAzureUrlValidation = editAzureBaseUrl ? validateAzureBaseUrl(editAzureBaseUrl) : null;
  const editFormValid = editAzureBaseUrl && editAzureUrlValidation?.valid;

  const getHealthColor = () => {
    if (!health) return "bg-gray-400";
    if (health.validationStatus === "invalid") return "bg-red-500";
    if (health.last1h.errorRate > 0.1) return "bg-red-500";
    if (health.last1h.errorRate > 0.02) return "bg-yellow-500";
    return "bg-emerald-500";
  };

  return (
    <Card className="p-5" data-testid={`provider-card-${p.provider.toLowerCase()}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <ProviderBadge provider={p.provider} />
          {p.displayName && p.displayName !== p.provider && (
            <span className="text-sm text-muted-foreground">{p.displayName}</span>
          )}
          <div className={`w-2.5 h-2.5 rounded-full ${getHealthColor()}`} title="Health indicator" data-testid={`health-indicator-${p.provider.toLowerCase()}`} />
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              p.status === "ACTIVE"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
            }`}
            data-testid={`status-provider-${p.provider.toLowerCase()}`}
          >
            {p.status}
          </span>
          <Button
            size="icon"
            variant="secondary"
            onClick={() => validateMutation.mutate()}
            disabled={validateMutation.isPending}
            data-testid={`button-validate-${p.provider.toLowerCase()}`}
            title="Validate Now"
          >
            <RefreshCw className={`w-4 h-4 ${validateMutation.isPending ? "animate-spin" : ""}`} />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            data-testid={`button-test-${p.provider.toLowerCase()}`}
            title="Test Connection"
          >
            <Zap className={`w-4 h-4 ${testMutation.isPending ? "animate-pulse" : ""}`} />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            onClick={() => setRotateOpen(true)}
            data-testid={`button-rotate-${p.provider.toLowerCase()}`}
            title="Rotate Key"
          >
            <RotateCw className="w-4 h-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="icon"
                variant="secondary"
                disabled={isDeleting}
                data-testid={`button-disconnect-${p.provider.toLowerCase()}`}
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect {p.provider}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will revoke all scoped API keys for this provider across all team members. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-disconnect">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-disconnect">
                  Disconnect
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {p.provider === "AZURE_OPENAI" && (
        <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
          {p.azureBaseUrl && (
            <span data-testid="text-azure-base-url"><Cloud className="w-3 h-3 inline mr-1" />{new URL(p.azureBaseUrl).hostname}</span>
          )}
          {p.azureEndpointMode && (
            <span className="px-2 py-0.5 rounded-full bg-muted font-medium" data-testid="text-azure-endpoint-mode">{p.azureEndpointMode} mode</span>
          )}
          <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium">pass-through</span>
          <Dialog open={editAzureOpen} onOpenChange={setEditAzureOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" data-testid="button-edit-azure">
                <Pencil className="w-3 h-3 mr-1" /> Edit
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Azure Connection</DialogTitle>
                <DialogDescription>
                  Update the endpoint and routing mode for this Azure connection.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Azure Base URL</Label>
                  <Input
                    placeholder="https://contoso.openai.azure.com"
                    value={editAzureBaseUrl}
                    onChange={e => setEditAzureBaseUrl(e.target.value)}
                    data-testid="input-edit-azure-base-url"
                  />
                  {editAzureUrlValidation && !editAzureUrlValidation.valid && (
                    <p className="text-xs text-destructive">URL must start with https://</p>
                  )}
                  {editAzureUrlValidation?.warning && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" /> {editAzureUrlValidation.warning}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Endpoint Mode</Label>
                  <div className="space-y-2">
                    <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30 transition-colors" data-testid="radio-edit-endpoint-legacy">
                      <input type="radio" name="editEndpointMode" checked={editAzureEndpointMode === "legacy"} onChange={() => setEditAzureEndpointMode("legacy")} className="mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Legacy versioned API (recommended)</p>
                        <p className="text-xs text-muted-foreground">Uses /openai/deployments/{"{name}"}/chat/completions. Works with APIM and standard Azure endpoints.</p>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30 transition-colors" data-testid="radio-edit-endpoint-v1">
                      <input type="radio" name="editEndpointMode" checked={editAzureEndpointMode === "v1"} onChange={() => setEditAzureEndpointMode("v1")} className="mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">v1 API</p>
                        <p className="text-xs text-muted-foreground">Uses /openai/v1/chat/completions. No api-version needed. Only works with direct Azure endpoints.</p>
                      </div>
                    </label>
                  </div>
                </div>
                {editAzureEndpointMode === "legacy" && (
                  <div className="space-y-2">
                    <Label>API Version (advanced)</Label>
                    <Input value={editAzureApiVersion} onChange={e => setEditAzureApiVersion(e.target.value)} placeholder="Auto (recommended)" data-testid="input-edit-azure-api-version" />
                    <p className="text-xs text-muted-foreground">Leave empty for Allotly to auto-pick the right version per model. Override only if you have a specific compatibility need.</p>
                  </div>
                )}
                <Button className="w-full" onClick={() => editAzureMutation.mutate()} disabled={!editFormValid || editAzureMutation.isPending} data-testid="button-save-azure-edit">
                  {editAzureMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {p.lastValidatedAt && (
        <p className="text-xs text-muted-foreground mt-3">
          Last validated: {new Date(p.lastValidatedAt).toLocaleString()}
        </p>
      )}

      {testResult && (
        <div className={`mt-3 p-3 rounded-lg text-xs ${
          testResult.success
            ? "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800"
            : "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800"
        }`} data-testid={`test-result-${p.provider.toLowerCase()}`}>
          <div className="flex items-center gap-3">
            <span className="font-medium">{testResult.success ? "Test Passed" : "Test Failed"}</span>
            <span className="text-muted-foreground">Model: {testResult.model}</span>
            <span className="text-muted-foreground">Latency: {testResult.latencyMs}ms</span>
            {testResult.response && <span className="text-muted-foreground">Response: "{testResult.response}"</span>}
            {testResult.error && <span className="text-red-600 dark:text-red-400">{testResult.error}</span>}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 mt-3">
        <button
          onClick={() => setShowHealth(!showHealth)}
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          data-testid={`button-toggle-health-${p.provider.toLowerCase()}`}
        >
          {showHealth ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <Activity className="w-3.5 h-3.5" />
          Health
        </button>
        <button
          onClick={onToggleExpand}
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          data-testid={`button-toggle-models-${p.provider.toLowerCase()}`}
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          Model Allowlist
        </button>
      </div>

      {showHealth && health && (
        <div className="mt-3 pt-3 border-t" data-testid={`health-panel-${p.provider.toLowerCase()}`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-[11px] text-muted-foreground uppercase">Last 1h</p>
              <p className="text-lg font-bold mt-0.5">{health.last1h.requests}</p>
              <p className="text-xs text-muted-foreground">requests</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-[11px] text-muted-foreground uppercase">Error Rate (1h)</p>
              <p className={`text-lg font-bold mt-0.5 ${
                health.last1h.errorRate > 0.1 ? "text-red-600 dark:text-red-400" :
                health.last1h.errorRate > 0.02 ? "text-yellow-600 dark:text-yellow-400" :
                "text-emerald-600 dark:text-emerald-400"
              }`}>{(health.last1h.errorRate * 100).toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground">{health.last1h.errors} errors</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-[11px] text-muted-foreground uppercase">Avg Latency (1h)</p>
              <p className="text-lg font-bold mt-0.5">{health.last1h.avgLatencyMs}ms</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-[11px] text-muted-foreground uppercase">24h Requests</p>
              <p className="text-lg font-bold mt-0.5">{health.last24h.requests}</p>
              <p className="text-xs text-muted-foreground">{health.last24h.errors} errors ({(health.last24h.errorRate * 100).toFixed(1)}%)</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-muted-foreground">
            <span>Validation: <span className={`font-medium ${health.validationStatus === "valid" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{health.validationStatus}</span></span>
            {health.lastValidated && <span>Last validated: {new Date(health.lastValidated).toLocaleString()}</span>}
            {health.lastSuccessfulRequest && <span>Last success: {new Date(health.lastSuccessfulRequest).toLocaleString()}</span>}
            {health.lastError && (
              <span className="text-red-600 dark:text-red-400">
                Last error: {health.lastError.message} at {new Date(health.lastError.timestamp).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      )}

      {expanded && <ModelAllowlist connection={p} />}

      <Dialog open={rotateOpen} onOpenChange={(o) => { setRotateOpen(o); if (!o) setNewKey(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotate {p.provider} Key</DialogTitle>
            <DialogDescription>
              Enter your new API key. It will be validated before replacing the current key. Member access will continue uninterrupted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>New API Key</Label>
              <Input
                type="password"
                placeholder="Enter new API key..."
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                data-testid="input-rotate-key"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => rotateMutation.mutate()}
              disabled={!newKey || rotateMutation.isPending}
              data-testid="button-confirm-rotate"
            >
              {rotateMutation.isPending ? "Validating & Rotating..." : "Validate & Rotate Key"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

interface DiscoveredModel {
  modelId: string;
  displayName: string;
  underlyingModel?: string;
  inputPricePerMTok: number;
  outputPricePerMTok: number;
}

function ModelAllowlist({ connection }: { connection: ProviderConnection }) {
  const { toast } = useToast();
  const isAzure = connection.provider === "AZURE_OPENAI";

  const { data: discoveredModels, isLoading, error } = useQuery<DiscoveredModel[]>({
    queryKey: ["/api/providers", connection.id, "models"],
    queryFn: async () => {
      const res = await fetch(`/api/providers/${connection.id}/models`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Failed to load models" }));
        throw new Error(body.message || `Error ${res.status}`);
      }
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (allowedModels: string[]) => {
      await apiRequest("PATCH", `/api/providers/${connection.id}`, {
        orgAllowedModels: allowedModels.length > 0 ? allowedModels : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      toast({ title: "Model allowlist updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) return <Skeleton className="h-24 mt-3" />;

  if (error) {
    return <p className="text-xs text-destructive mt-3">Failed to load models: {error.message}</p>;
  }

  const modelList = (discoveredModels || []).map(m => ({
    id: m.modelId,
    label: m.displayName,
    sublabel: m.underlyingModel,
    pricingLabel: `$${(m.inputPricePerMTok / 100).toFixed(2)}/1M in · $${(m.outputPricePerMTok / 100).toFixed(2)}/1M out`,
  }));

  if (modelList.length === 0) {
    return <p className="text-xs text-muted-foreground mt-3">
      {isAzure ? "No models discovered. Ensure your Azure deployments match standard model names (e.g., gpt-4.1, gpt-4o)." : "No models available for this API key."}
    </p>;
  }

  const discoveredIds = new Set(modelList.map(m => m.id));
  const currentAllowed = (connection.orgAllowedModels || []).filter(id => discoveredIds.has(id));
  const allAllowed = currentAllowed.length === 0;

  const toggleModel = (modelId: string) => {
    let next: string[];
    if (allAllowed) {
      next = modelList.map(m => m.id).filter(id => id !== modelId);
    } else if (currentAllowed.includes(modelId)) {
      next = currentAllowed.filter(id => id !== modelId);
    } else {
      next = [...currentAllowed, modelId];
    }
    if (next.length === modelList.length) next = [];
    updateMutation.mutate(next);
  };

  return (
    <div className="mt-3 pt-3 border-t space-y-2" data-testid={`model-allowlist-${connection.provider.toLowerCase()}`}>
      <p className="text-xs text-muted-foreground mb-2">
        {allAllowed
          ? `All ${isAzure ? "deployments" : "models"} allowed. Toggle individual ${isAzure ? "deployments" : "models"} to restrict access.`
          : `${currentAllowed.length} of ${modelList.length} ${isAzure ? "deployments" : "models"} allowed.`}
      </p>
      {modelList.map(m => {
        const isEnabled = allAllowed || currentAllowed.includes(m.id);
        return (
          <div key={m.id} className="flex items-center justify-between gap-3 py-1.5">
            <div>
              <span className="text-sm font-medium" data-testid={`text-model-name-${m.id}`}>{m.label}</span>
              {m.sublabel && (
                <span className="text-xs text-muted-foreground ml-1.5" data-testid={`text-model-underlying-${m.id}`}>({m.sublabel})</span>
              )}
              <span className="text-xs text-muted-foreground ml-2">
                {m.pricingLabel}
              </span>
            </div>
            <Switch
              checked={isEnabled}
              onCheckedChange={() => toggleModel(m.id)}
              disabled={updateMutation.isPending}
              data-testid={`switch-model-${m.id}`}
            />
          </div>
        );
      })}
    </div>
  );
}
