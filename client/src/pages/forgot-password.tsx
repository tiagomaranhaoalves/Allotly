import { LogoFull } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "wouter";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Mail, CheckCircle } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/forgot-password", { email });
      setSent(true);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Something went wrong", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link href="/" data-testid="link-forgot-logo">
            <LogoFull size={32} className="inline-block" />
          </Link>
        </div>

        {sent ? (
          <Card className="p-6 lg:p-8">
            <div className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <h1 className="text-xl font-bold tracking-tight" data-testid="text-reset-sent">Check your email</h1>
              <p className="text-sm text-muted-foreground">
                If an account exists for <strong>{email}</strong>, we've sent a password reset link. The link expires in 1 hour.
              </p>
              <p className="text-xs text-muted-foreground">
                Don't see it? Check your spam folder.
              </p>
              <Link href="/login">
                <Button variant="outline" className="w-full mt-4 gap-2" data-testid="button-back-to-login">
                  <ArrowLeft className="w-4 h-4" /> Back to sign in
                </Button>
              </Link>
            </div>
          </Card>
        ) : (
          <>
            <div className="text-center">
              <h1 className="text-2xl font-extrabold tracking-tight">Reset your password</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Enter your email and we'll send you a reset link
              </p>
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
                    data-testid="input-reset-email"
                  />
                </div>
                <Button type="submit" className="w-full h-11 font-semibold gap-2" disabled={loading} data-testid="button-send-reset">
                  {loading ? "Sending..." : <><Mail className="w-4 h-4" /> Send reset link</>}
                </Button>
              </form>
            </Card>

            <p className="text-center text-sm text-muted-foreground">
              <Link href="/login" className="text-primary font-semibold hover:underline" data-testid="link-back-login">
                <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
