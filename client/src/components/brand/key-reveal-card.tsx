import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface KeyRevealCardProps {
  keyValue: string;
  masked?: boolean;
  onReveal?: () => void;
  className?: string;
}

export function KeyRevealCard({ keyValue, masked = true, className = "" }: KeyRevealCardProps) {
  const [isRevealed, setIsRevealed] = useState(!masked);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const displayValue = isRevealed ? keyValue : keyValue.slice(0, 15) + "..." + keyValue.slice(-4);

  const copy = () => {
    navigator.clipboard.writeText(keyValue);
    setCopied(true);
    toast({ title: "API key copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className={`p-4 ${className}`} data-testid="key-reveal-card">
      {isRevealed && (
        <div className="flex items-center gap-2 mb-3 p-2.5 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300">This key will only be shown once. Copy it now.</p>
        </div>
      )}
      <div className="flex items-center gap-2">
        <code className="flex-1 font-mono text-sm bg-muted/50 px-3 py-2 rounded-md overflow-hidden text-ellipsis select-all" data-testid="text-api-key">
          {displayValue}
        </code>
        <Button size="icon" variant="secondary" onClick={copy} data-testid="button-copy-key">
          {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
        </Button>
        {masked && (
          <Button size="icon" variant="secondary" onClick={() => setIsRevealed(!isRevealed)} data-testid="button-toggle-key">
            {isRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
        )}
      </div>
    </Card>
  );
}
