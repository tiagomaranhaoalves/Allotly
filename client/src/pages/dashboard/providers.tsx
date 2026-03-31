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
import { Plug, Plus, Trash2, Shield, RefreshCw, ChevronDown, ChevronRight, RotateCw, Zap, Activity, Cloud, X, AlertTriangle, Pencil } from "lucide-react";
import { useState } from "react";

interface AzureDeployment {
  deploymentName: string;
  modelId: string;
  inputPricePerMTok: number;
  outputPricePerMTok: number;
}

function parseAzureDeployments(raw: unknown): AzureDeployment[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((d: Record<string, unknown>) => ({
    deploymentName: String(d.deploymentName || ""),
    modelId: String(d.modelId || ""),
    inputPricePerMTok: Number(d.inputPricePerMTok || 0),
    outputPricePerMTok: Number(d.outputPricePerMTok || 0),
  }));
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

interface ModelPricing {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  inputPricePerMTok: number;
  outputPricePerMTok: number;
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

const AZURE_KNOWN_MODELS = [
  { id: "gpt-4o", label: "GPT-4o", inputPrice: 250, outputPrice: 1000 },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", inputPrice: 15, outputPrice: 60 },
  { id: "gpt-4.1", label: "GPT-4.1", inputPrice: 200, outputPrice: 800 },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", inputPrice: 40, outputPrice: 160 },
  { id: "gpt-4.1-nano", label: "GPT-4.1 Nano", inputPrice: 10, outputPrice: 40 },
  { id: "o4-mini", label: "o4-mini", inputPrice: 110, outputPrice: 440 },
  { id: "o3", label: "o3", inputPrice: 1000, outputPrice: 4000 },
  { id: "o3-mini", label: "o3-mini", inputPrice: 110, outputPrice: 440 },
  { id: "o1", label: "o1", inputPrice: 1500, outputPrice: 6000 },
  { id: "o1-mini", label: "o1-mini", inputPrice: 300, outputPrice: 1200 },
];

const CONFLICT_PREFIXES = ["gpt-", "o1", "o3", "o4", "claude-", "gemini-"];

function checkDeploymentNameConflict(name: string): string | null {
  const lower = name.toLowerCase();
  for (const prefix of CONFLICT_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return `Deployment name '${name}' conflicts with existing provider model naming. Azure deployment names must not start with '${prefix}'. Use a custom name like 'my-gpt4o' or 'nebula-one'.`;
    }
  }
  return null;
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
  const [azureEndpointMode, setAzureEndpointMode] = useState<"v1" | "legacy">("v1");
  const [azureApiVersion, setAzureApiVersion] = useState("2024-10-21");
  const [azureDeployments, setAzureDeployments] = useState<AzureDeployment[]>([
    { deploymentName: "", modelId: "", inputPricePerMTok: 0, outputPricePerMTok: 0 },
  ]);

  const { data: providers, isLoading } = useQuery<ProviderConnection[]>({ queryKey: ["/api/providers"] });

  const resetForm = () => {
    setProvider("");
    setApiKey("");
    setDisplayName("");
    setAzureBaseUrl("");
    setAzureEndpointMode("v1");
    setAzureApiVersion("2024-10-21");
    setAzureDeployments([{ deploymentName: "", modelId: "", inputPricePerMTok: 0, outputPricePerMTok: 0 }]);
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { provider, apiKey, displayName };
      if (provider === "AZURE_OPENAI") {
        body.azureBaseUrl = azureBaseUrl.replace(/\/+$/, "").replace(/\/openai\/?$/, "");
        body.azureEndpointMode = azureEndpointMode;
        if (azureEndpointMode === "legacy") {
          body.azureApiVersion = azureApiVersion;
        }
        body.azureDeployments = azureDeployments.filter(d => d.deploymentName && d.modelId);
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

  const addDeploymentRow = () => {
    setAzureDeployments([...azureDeployments, { deploymentName: "", modelId: "", inputPricePerMTok: 0, outputPricePerMTok: 0 }]);
  };

  const removeDeploymentRow = (index: number) => {
    setAzureDeployments(azureDeployments.filter((_, i) => i !== index));
  };

  const updateDeployment = (index: number, field: keyof AzureDeployment, value: string | number) => {
    const updated = [...azureDeployments];
    const dep = { ...updated[index] };
    if (field === "deploymentName" || field === "modelId") {
      dep[field] = String(value);
    } else {
      dep[field] = Number(value);
    }
    if (field === "modelId" && typeof value === "string") {
      const model = AZURE_KNOWN_MODELS.find(m => m.id === value);
      if (model) {
        dep.inputPricePerMTok = model.inputPrice;
        dep.outputPricePerMTok = model.outputPrice;
      }
    }
    updated[index] = dep;
    setAzureDeployments(updated);
  };

  const azureUrlValidation = azureBaseUrl ? validateAzureBaseUrl(azureBaseUrl) : null;
  const deploymentErrors = azureDeployments.map(d => d.deploymentName ? checkDeploymentNameConflict(d.deploymentName) : null);
  const hasDeploymentErrors = deploymentErrors.some(e => e !== null);
  const validDeployments = azureDeployments.filter(d => d.deploymentName && d.modelId);
  const duplicateDeploymentNames = azureDeployments.map(d => d.deploymentName).filter((name, i, arr) => name && arr.indexOf(name) !== i);

  const isAzureFormValid = provider === "AZURE_OPENAI"
    ? apiKey && azureBaseUrl && azureUrlValidation?.valid && validDeployments.length > 0 && !hasDeploymentErrors && duplicateDeploymentNames.length === 0
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
          <DialogContent className={provider === "AZURE_OPENAI" ? "max-w-2xl max-h-[85vh] overflow-y-auto" : ""}>
            <DialogHeader>
              <DialogTitle>Connect AI Provider</DialogTitle>
              <DialogDescription>
                {provider === "AZURE_OPENAI"
                  ? "Connect your Azure OpenAI resource. Map your deployments to models so Allotly can route requests and calculate costs."
                  : "Connect your OpenAI, Anthropic, Google, or Azure OpenAI API key. The key will be validated against the provider's API before saving."}
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
                    <SelectItem value="AZURE_OPENAI">Azure OpenAI</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {provider === "AZURE_OPENAI" ? (
                <>
                  <div className="space-y-2">
                    <Label>Display Name (optional)</Label>
                    <Input
                      placeholder='e.g., "Nebula One - Azure"'
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
                      Your Azure OpenAI endpoint. Accepts both {"{name}"}.openai.azure.com and {"{name}"}.services.ai.azure.com
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
                      placeholder="Your Azure OpenAI API key"
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      data-testid="input-api-key"
                    />
                    <p className="text-xs text-muted-foreground">Your key is encrypted with AES-256-GCM and never stored in plaintext.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Endpoint Mode</Label>
                    <div className="space-y-2">
                      <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30 transition-colors" data-testid="radio-endpoint-v1">
                        <input
                          type="radio"
                          name="endpointMode"
                          checked={azureEndpointMode === "v1"}
                          onChange={() => setAzureEndpointMode("v1")}
                          className="mt-0.5"
                        />
                        <div>
                          <p className="text-sm font-medium">v1 API (recommended)</p>
                          <p className="text-xs text-muted-foreground">Uses /openai/v1/chat/completions. No api-version needed. Most OpenAI-compatible.</p>
                        </div>
                      </label>
                      <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30 transition-colors" data-testid="radio-endpoint-legacy">
                        <input
                          type="radio"
                          name="endpointMode"
                          checked={azureEndpointMode === "legacy"}
                          onChange={() => setAzureEndpointMode("legacy")}
                          className="mt-0.5"
                        />
                        <div>
                          <p className="text-sm font-medium">Legacy versioned API</p>
                          <p className="text-xs text-muted-foreground">Uses /openai/deployments/{"{name}"}/chat/completions. Requires api-version parameter.</p>
                        </div>
                      </label>
                    </div>
                  </div>
                  {azureEndpointMode === "legacy" && (
                    <div className="space-y-2">
                      <Label>API Version</Label>
                      <Input
                        value={azureApiVersion}
                        onChange={e => setAzureApiVersion(e.target.value)}
                        placeholder="2024-10-21"
                        data-testid="input-azure-api-version"
                      />
                      <p className="text-xs text-muted-foreground">Defaults to 2024-10-21 (current GA)</p>
                    </div>
                  )}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">Deployment Mappings</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addDeploymentRow} data-testid="button-add-deployment">
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add deployment
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Map your Azure deployments to underlying OpenAI models. Selecting a model auto-fills default pricing. Override prices if your Azure contract differs.
                    </p>
                    <div className="space-y-3">
                      {azureDeployments.map((dep, idx) => (
                        <div key={idx} className="p-3 rounded-lg border bg-muted/20 space-y-3" data-testid={`deployment-row-${idx}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground">Deployment #{idx + 1}</span>
                            {azureDeployments.length > 1 && (
                              <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeDeploymentRow(idx)} data-testid={`button-remove-deployment-${idx}`}>
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Deployment Name</Label>
                              <Input
                                value={dep.deploymentName}
                                onChange={e => updateDeployment(idx, "deploymentName", e.target.value)}
                                placeholder="e.g., nebula-one"
                                className="h-8 text-sm"
                                data-testid={`input-deployment-name-${idx}`}
                              />
                              {deploymentErrors[idx] && (
                                <p className="text-xs text-destructive">{deploymentErrors[idx]}</p>
                              )}
                              {dep.deploymentName && duplicateDeploymentNames.includes(dep.deploymentName) && (
                                <p className="text-xs text-destructive">Duplicate deployment name</p>
                              )}
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">OpenAI Model</Label>
                              <Select value={dep.modelId} onValueChange={v => updateDeployment(idx, "modelId", v)}>
                                <SelectTrigger className="h-8 text-sm" data-testid={`select-model-${idx}`}>
                                  <SelectValue placeholder="Select model" />
                                </SelectTrigger>
                                <SelectContent>
                                  {AZURE_KNOWN_MODELS.map(m => (
                                    <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Input price (cents/1M tokens)</Label>
                              <Input
                                type="number"
                                value={dep.inputPricePerMTok}
                                onChange={e => updateDeployment(idx, "inputPricePerMTok", parseInt(e.target.value) || 0)}
                                className="h-8 text-sm"
                                data-testid={`input-price-in-${idx}`}
                              />
                              <p className="text-[10px] text-muted-foreground">${(dep.inputPricePerMTok / 100).toFixed(2)}/1M tokens</p>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Output price (cents/1M tokens)</Label>
                              <Input
                                type="number"
                                value={dep.outputPricePerMTok}
                                onChange={e => updateDeployment(idx, "outputPricePerMTok", parseInt(e.target.value) || 0)}
                                className="h-8 text-sm"
                                data-testid={`input-price-out-${idx}`}
                              />
                              <p className="text-[10px] text-muted-foreground">${(dep.outputPricePerMTok / 100).toFixed(2)}/1M tokens</p>
                            </div>
                          </div>
                        </div>
                      ))}
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
          description="Connect your OpenAI, Anthropic, Google, or Azure OpenAI account to start provisioning API keys for your team."
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
  const [editAzureEndpointMode, setEditAzureEndpointMode] = useState<"v1" | "legacy">((p.azureEndpointMode as "v1" | "legacy") || "v1");
  const [editAzureApiVersion, setEditAzureApiVersion] = useState(p.azureApiVersion || "2024-10-21");
  const [editAzureDeployments, setEditAzureDeployments] = useState<AzureDeployment[]>(
    () => {
      const parsed = parseAzureDeployments(p.azureDeployments);
      return parsed.length > 0 ? parsed : [{ deploymentName: "", modelId: "", inputPricePerMTok: 0, outputPricePerMTok: 0 }];
    }
  );

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
        azureDeployments: editAzureDeployments.filter(d => d.deploymentName && d.modelId),
      };
      if (editAzureEndpointMode === "legacy") {
        body.azureApiVersion = editAzureApiVersion;
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

  const editUpdateDeployment = (index: number, field: keyof AzureDeployment, value: string | number) => {
    const updated = [...editAzureDeployments];
    const dep = { ...updated[index] };
    if (field === "deploymentName" || field === "modelId") {
      dep[field] = String(value);
    } else {
      dep[field] = Number(value);
    }
    if (field === "modelId" && typeof value === "string") {
      const model = AZURE_KNOWN_MODELS.find(m => m.id === value);
      if (model) {
        dep.inputPricePerMTok = model.inputPrice;
        dep.outputPricePerMTok = model.outputPrice;
      }
    }
    updated[index] = dep;
    setEditAzureDeployments(updated);
  };

  const editAzureUrlValidation = editAzureBaseUrl ? validateAzureBaseUrl(editAzureBaseUrl) : null;
  const editDeploymentErrors = editAzureDeployments.map(d => d.deploymentName ? checkDeploymentNameConflict(d.deploymentName) : null);
  const editHasDeploymentErrors = editDeploymentErrors.some(e => e !== null);
  const editValidDeployments = editAzureDeployments.filter(d => d.deploymentName && d.modelId);
  const editDuplicateNames = editAzureDeployments.map(d => d.deploymentName).filter((name, i, arr) => name && arr.indexOf(name) !== i);
  const editFormValid = editAzureBaseUrl && editAzureUrlValidation?.valid && editValidDeployments.length > 0 && !editHasDeploymentErrors && editDuplicateNames.length === 0;

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
          {p.azureDeployments && (
            <span data-testid="text-azure-deployment-count">{parseAzureDeployments(p.azureDeployments).length} deployment{parseAzureDeployments(p.azureDeployments).length !== 1 ? 's' : ''}</span>
          )}
          <Dialog open={editAzureOpen} onOpenChange={setEditAzureOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" data-testid="button-edit-azure">
                <Pencil className="w-3 h-3 mr-1" /> Edit
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Azure OpenAI Connection</DialogTitle>
                <DialogDescription>
                  Update endpoint, deployment mappings, and pricing for this Azure OpenAI connection.
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
                    <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30 transition-colors" data-testid="radio-edit-endpoint-v1">
                      <input type="radio" name="editEndpointMode" checked={editAzureEndpointMode === "v1"} onChange={() => setEditAzureEndpointMode("v1")} className="mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">v1 API (recommended)</p>
                        <p className="text-xs text-muted-foreground">Uses /openai/v1/chat/completions. No api-version needed.</p>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30 transition-colors" data-testid="radio-edit-endpoint-legacy">
                      <input type="radio" name="editEndpointMode" checked={editAzureEndpointMode === "legacy"} onChange={() => setEditAzureEndpointMode("legacy")} className="mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Legacy versioned API</p>
                        <p className="text-xs text-muted-foreground">Uses /openai/deployments/{"{name}"}/chat/completions.</p>
                      </div>
                    </label>
                  </div>
                </div>
                {editAzureEndpointMode === "legacy" && (
                  <div className="space-y-2">
                    <Label>API Version</Label>
                    <Input value={editAzureApiVersion} onChange={e => setEditAzureApiVersion(e.target.value)} placeholder="2024-10-21" data-testid="input-edit-azure-api-version" />
                  </div>
                )}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Deployment Mappings</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditAzureDeployments([...editAzureDeployments, { deploymentName: "", modelId: "", inputPricePerMTok: 0, outputPricePerMTok: 0 }])} data-testid="button-edit-add-deployment">
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add deployment
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {editAzureDeployments.map((dep, idx) => (
                      <div key={idx} className="p-3 rounded-lg border bg-muted/20 space-y-3" data-testid={`edit-deployment-row-${idx}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-muted-foreground">Deployment #{idx + 1}</span>
                          {editAzureDeployments.length > 1 && (
                            <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditAzureDeployments(editAzureDeployments.filter((_, i) => i !== idx))} data-testid={`button-edit-remove-deployment-${idx}`}>
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Deployment Name</Label>
                            <Input value={dep.deploymentName} onChange={e => editUpdateDeployment(idx, "deploymentName", e.target.value)} placeholder="e.g., nebula-one" className="h-8 text-sm" data-testid={`input-edit-deployment-name-${idx}`} />
                            {editDeploymentErrors[idx] && <p className="text-xs text-destructive">{editDeploymentErrors[idx]}</p>}
                            {dep.deploymentName && editDuplicateNames.includes(dep.deploymentName) && <p className="text-xs text-destructive">Duplicate deployment name</p>}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">OpenAI Model</Label>
                            <Select value={dep.modelId} onValueChange={v => editUpdateDeployment(idx, "modelId", v)}>
                              <SelectTrigger className="h-8 text-sm" data-testid={`select-edit-model-${idx}`}><SelectValue placeholder="Select model" /></SelectTrigger>
                              <SelectContent>
                                {AZURE_KNOWN_MODELS.map(m => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Input price (cents/1M tokens)</Label>
                            <Input type="number" value={dep.inputPricePerMTok} onChange={e => editUpdateDeployment(idx, "inputPricePerMTok", parseInt(e.target.value) || 0)} className="h-8 text-sm" data-testid={`input-edit-price-in-${idx}`} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Output price (cents/1M tokens)</Label>
                            <Input type="number" value={dep.outputPricePerMTok} onChange={e => editUpdateDeployment(idx, "outputPricePerMTok", parseInt(e.target.value) || 0)} className="h-8 text-sm" data-testid={`input-edit-price-out-${idx}`} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
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

function ModelAllowlist({ connection }: { connection: ProviderConnection }) {
  const { toast } = useToast();
  const isAzure = connection.provider === "AZURE_OPENAI";

  const { data: models, isLoading } = useQuery<ModelPricing[]>({
    queryKey: ["/api/models", connection.provider],
    queryFn: async () => {
      const res = await fetch(`/api/models?provider=${connection.provider}`);
      if (!res.ok) throw new Error("Failed to load models");
      return res.json();
    },
    enabled: !isAzure,
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
    onError: (err: any) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  if (!isAzure && isLoading) return <Skeleton className="h-24 mt-3" />;

  const azureDeployments = parseAzureDeployments(connection.azureDeployments);
  const modelList: { id: string; label: string; sublabel?: string; pricingLabel: string }[] = isAzure
    ? azureDeployments.map(d => ({
        id: d.deploymentName,
        label: d.deploymentName,
        sublabel: d.modelId,
        pricingLabel: `$${(d.inputPricePerMTok / 100).toFixed(2)}/1M in · $${(d.outputPricePerMTok / 100).toFixed(2)}/1M out`,
      }))
    : (models || []).map(m => ({
        id: m.modelId,
        label: m.displayName,
        pricingLabel: `$${(m.inputPricePerMTok / 100).toFixed(2)}/1M in · $${(m.outputPricePerMTok / 100).toFixed(2)}/1M out`,
      }));

  if (modelList.length === 0) {
    return <p className="text-xs text-muted-foreground mt-3">
      {isAzure ? "No deployments configured. Edit this connection to add deployment mappings." : "No models found for this provider."}
    </p>;
  }

  const currentAllowed = connection.orgAllowedModels || [];
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
