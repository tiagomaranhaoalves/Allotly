import { LogoFull } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Shield } from "lucide-react";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiRequest("POST", "/api/admin/login", { email, password });
      setLocation("/admin");
    } catch (err: any) {
      toast({ title: "Login failed", description: err.message || "Invalid credentials", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.3),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(168,85,247,0.15),transparent_60%)]" />
        <div className="relative flex flex-col justify-center px-12 xl:px-16">
          <LogoFull size={28} className="text-white [&_circle]:!fill-white/80 [&_line]:!stroke-white/50" />
          <h2 className="mt-8 text-3xl font-extrabold text-white tracking-tight leading-tight">
            Control Center
          </h2>
          <p className="mt-4 text-slate-300/80 text-lg max-w-md leading-relaxed">
            Master administration panel for managing organizations, users, and platform settings.
          </p>
          <div className="mt-8 flex items-center gap-3 text-slate-400/70 text-sm">
            <Shield className="w-4 h-4" />
            <span>Restricted access · Admin credentials required</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:text-left">
            <div className="lg:hidden mb-8">
              <LogoFull size={32} className="inline-block" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight" data-testid="text-admin-title">Control Center</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">Sign in with your admin credentials</p>
          </div>

          <Card className="p-6 lg:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="admin-email" className="text-sm font-medium">Email</Label>
                <Input
                  id="admin-email"
                  type="email"
                  placeholder="admin@allotly.ai"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="input-admin-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-password" className="text-sm font-medium">Password</Label>
                <Input
                  id="admin-password"
                  type="password"
                  placeholder="Enter admin password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  data-testid="input-admin-password"
                />
              </div>
              <Button type="submit" className="w-full font-semibold gap-2" disabled={loading} data-testid="button-admin-login">
                {loading ? "Signing in..." : <>Sign in <ArrowRight className="w-4 h-4" /></>}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
