import { useState } from "react";
import { useLocation } from "wouter";
import { usePortalLogin } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Wifi, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState("");
  const { login, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  if (isAuthenticated) {
    navigate("/dashboard");
    return null;
  }

  const loginMutation = usePortalLogin({
    mutation: {
      onSuccess(data) {
        login(data.accessToken, data.refreshToken, data.customer as {
          id: string;
          firstName: string;
          lastName: string;
          phone: string;
          accountNumber: string | null;
          tenantId: string;
        });
        navigate("/dashboard");
      },
      onError() {
        setError("Customer not found or account is inactive. Please check your phone number or account number.");
      },
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!identifier.trim()) {
      setError("Please enter your phone number or account number.");
      return;
    }
    loginMutation.mutate({ data: { identifier: identifier.trim() } });
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-primary/10 to-background p-4">
      {/* Logo / Brand */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mb-3 shadow-lg">
          <Wifi className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">PulseNet</h1>
        <p className="text-sm text-muted-foreground mt-1">Customer Self-Service Portal</p>
      </div>

      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-xl">Sign In</CardTitle>
          <CardDescription>
            Enter your phone number or account number to access your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="identifier">Phone Number or Account Number</Label>
              <Input
                id="identifier"
                type="text"
                placeholder="e.g. 0712345678 or PN-000001"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoFocus
                inputMode="tel"
              />
              <p className="text-xs text-muted-foreground">
                Use your registered phone or your PulseNet account number
              </p>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={() => navigate("/packages")}
            >
              Browse packages without signing in →
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
