import { LogoFull } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Shield, Users, Ticket } from "lucide-react";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/signup", { name, email, password, orgName });
      await new Promise(resolve => setTimeout(resolve, 100));
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
      await queryClient.refetchQueries({ queryKey: ["/api/auth/session"] });
      setLocation("/dashboard");
    } catch (err: any) {
      toast({ title: "Signup failed", description: err.message || "Something went wrong", variant: "destructive" });
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
          <Link href="/" data-testid="link-signup-logo-side">
            <LogoFull size={28} className="text-white [&_circle]:!fill-white/80 [&_line]:!stroke-white/50" />
          </Link>
          <h2 className="mt-8 text-3xl font-extrabold text-white tracking-tight leading-tight">
            Your AI spend,<br />fully under control.
          </h2>
          <p className="mt-4 text-indigo-100/80 text-lg max-w-md leading-relaxed">
            Set up your organization in under a minute. Start managing team budgets and distributing vouchers right away.
          </p>
          <div className="mt-10 space-y-4">
            {[
              { icon: <Shield className="w-4 h-4" />, text: "AES-256 encrypted API keys" },
              { icon: <Users className="w-4 h-4" />, text: "Up to 5 team members free" },
              { icon: <Ticket className="w-4 h-4" />, text: "Instant voucher generation" },
            ].map(item => (
              <div key={item.text} className="flex items-center gap-3 text-indigo-200/80 text-sm">
                {item.icon}
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:text-left">
            <div className="lg:hidden mb-8">
              <Link href="/" data-testid="link-signup-logo">
                <LogoFull size={32} className="inline-block" />
              </Link>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">Create your account</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">Start managing your AI spend in minutes</p>
          </div>

          <Card className="p-6 lg:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium">Full name</Label>
                  <Input
                    id="name"
                    placeholder="Jane Smith"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="h-11"
                    data-testid="input-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org" className="text-sm font-medium">Organization</Label>
                  <Input
                    id="org"
                    placeholder="Acme Inc."
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    required
                    className="h-11"
                    data-testid="input-org-name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">Work email</Label>
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
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="h-11"
                  data-testid="input-password"
                />
              </div>
              <Button type="submit" className="w-full h-11 font-semibold gap-2" disabled={loading} data-testid="button-submit-signup">
                {loading ? "Creating account..." : <>Create account <ArrowRight className="w-4 h-4" /></>}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                By signing up, you agree to our Terms of Service and Privacy Policy.
              </p>
            </form>
          </Card>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary font-semibold hover:underline" data-testid="link-login">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
