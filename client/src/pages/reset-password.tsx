import { LogoFull } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, CheckCircle, AlertTriangle } from "lucide-react";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      toast({ title: "Password too short", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }

    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please make sure both passwords are the same", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/reset-password", { token, password });
      setSuccess(true);
    } catch (err: any) {
      toast({ title: "Reset failed", description: err.message || "Something went wrong", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <Link href="/" data-testid="link-reset-logo">
              <LogoFull size={32} className="inline-block" />
            </Link>
          </div>
          <Card className="p-6 lg:p-8">
            <div className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <h1 className="text-xl font-bold tracking-tight" data-testid="text-invalid-link">Invalid reset link</h1>
              <p className="text-sm text-muted-foreground">
                This password reset link is invalid or has expired. Please request a new one.
              </p>
              <Link href="/forgot-password">
                <Button className="w-full mt-4" data-testid="button-request-new-link">
                  Request new reset link
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link href="/" data-testid="link-reset-logo">
            <LogoFull size={32} className="inline-block" />
          </Link>
        </div>

        {success ? (
          <Card className="p-6 lg:p-8">
            <div className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <h1 className="text-xl font-bold tracking-tight" data-testid="text-reset-success">Password reset successful</h1>
              <p className="text-sm text-muted-foreground">
                Your password has been updated. You can now sign in with your new password.
              </p>
              <Link href="/login">
                <Button className="w-full mt-4 gap-2" data-testid="button-go-to-login">
                  Sign in <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </Card>
        ) : (
          <>
            <div className="text-center">
              <h1 className="text-2xl font-extrabold tracking-tight">Set a new password</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Enter your new password below
              </p>
            </div>

            <Card className="p-6 lg:p-8">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">New password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="h-11"
                    data-testid="input-new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password" className="text-sm font-medium">Confirm new password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    className="h-11"
                    data-testid="input-confirm-password"
                  />
                </div>
                <Button type="submit" className="w-full h-11 font-semibold gap-2" disabled={loading} data-testid="button-reset-password">
                  {loading ? "Resetting..." : <>Reset password <ArrowRight className="w-4 h-4" /></>}
                </Button>
              </form>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
