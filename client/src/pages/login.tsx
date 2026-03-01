import { LogoFull } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Lock } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/login", { email, password });
      await queryClient.refetchQueries({ queryKey: ["/api/auth/session"] });
      setLocation("/dashboard");
    } catch (err: any) {
      toast({ title: "Login failed", description: err.message || "Invalid credentials", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-900" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.4),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(6,182,212,0.2),transparent_60%)]" />
        <div className="relative flex flex-col justify-center px-12 xl:px-16">
          <Link href="/" data-testid="link-login-logo-side">
            <LogoFull size={28} className="text-white [&_circle]:!fill-white/80 [&_line]:!stroke-white/50" />
          </Link>
          <h2 className="mt-8 text-3xl font-extrabold text-white tracking-tight leading-tight">
            Take control of your<br />AI spend today.
          </h2>
          <p className="mt-4 text-indigo-100/80 text-lg max-w-md leading-relaxed">
            Monitor budgets, manage team access, and distribute AI vouchers — all from one dashboard.
          </p>
          <div className="mt-8 flex items-center gap-3 text-indigo-200/70 text-sm">
            <Lock className="w-4 h-4" />
            <span>AES-256 encryption · SOC 2 ready · GDPR compliant</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:text-left">
            <div className="lg:hidden mb-8">
              <Link href="/" data-testid="link-login-logo">
                <LogoFull size={32} className="inline-block" />
              </Link>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">Welcome back</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">Sign in to your Allotly account</p>
          </div>

          <Card className="p-6 lg:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11"
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11"
                  data-testid="input-password"
                />
              </div>
              <Button type="submit" className="w-full h-11 font-semibold gap-2" disabled={loading} data-testid="button-submit-login">
                {loading ? "Signing in..." : <>Sign in <ArrowRight className="w-4 h-4" /></>}
              </Button>
            </form>
          </Card>

          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-primary font-semibold hover:underline" data-testid="link-signup">
              Sign up free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
