import { useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { LogoFull } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck } from "lucide-react";

export default function OauthClaimAccountPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const next = params.get("next") || "/dashboard";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/claim-from-voucher", { name, email, password, next });
      const body = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
      toast({ title: t("auth.claim.successTitle"), description: t("auth.claim.successBody") });
      setLocation(body?.next || next);
    } catch (err: any) {
      toast({
        title: t("auth.claim.errorTitle"),
        description: err?.message || t("auth.claim.errorBody"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <Card className="w-full max-w-md p-8" data-testid="card-oauth-claim">
        <div className="text-center mb-6">
          <LogoFull className="mx-auto mb-4" />
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 text-xs font-medium mb-3">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>{t("auth.claim.badge")}</span>
          </div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100" data-testid="text-claim-title">
            {t("auth.claim.title")}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">{t("auth.claim.subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="claim-name">{t("auth.claim.nameLabel")}</Label>
            <Input
              id="claim-name"
              data-testid="input-claim-name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("auth.claim.namePlaceholder")}
            />
          </div>
          <div>
            <Label htmlFor="claim-email">{t("auth.claim.emailLabel")}</Label>
            <Input
              id="claim-email"
              data-testid="input-claim-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.claim.emailPlaceholder")}
            />
          </div>
          <div>
            <Label htmlFor="claim-password">{t("auth.claim.passwordLabel")}</Label>
            <Input
              id="claim-password"
              data-testid="input-claim-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("auth.claim.passwordPlaceholder")}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t("auth.claim.passwordHint")}</p>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={loading}
            data-testid="button-claim-submit"
          >
            {loading ? t("auth.claim.submitting") : t("auth.claim.submit")}
          </Button>
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center">{t("auth.claim.preserveNote")}</p>
        </form>
      </Card>
    </div>
  );
}
