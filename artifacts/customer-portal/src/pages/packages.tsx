import { useState, useEffect } from "react";
import {
  useListPortalPackages,
  useInitiateStkPush,
  useGetStkPushStatus,
  useGetPortalDashboard,
} from "@workspace/api-client-react";
import type { HotspotPackagePublic } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wifi, Zap, Clock, Database, LogIn, User, Smartphone, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const KENYAN_PHONE_RE = /^0[17]\d{8}$/;

type StkStage = "form" | "pending" | "success" | "failed";

function formatBytes(mb: number | null | undefined): string {
  if (!mb) return "Unlimited";
  if (mb >= 1024) return `${(mb / 1024).toFixed(0)} GB`;
  return `${mb} MB`;
}

function formatSpeed(kbps: number | null | undefined): string {
  if (!kbps) return "—";
  if (kbps >= 1024) return `${(kbps / 1024).toFixed(0)} Mbps`;
  return `${kbps} Kbps`;
}

function formatValidity(hours: number | null | undefined, days: number): string {
  if (hours) {
    if (hours >= 24) return `${Math.floor(hours / 24)} day${Math.floor(hours / 24) > 1 ? "s" : ""}`;
    return `${hours} hour${hours > 1 ? "s" : ""}`;
  }
  return `${days} day${days > 1 ? "s" : ""}`;
}

function BuyDialog({
  pkg,
  open,
  onOpenChange,
}: {
  pkg: HotspotPackagePublic | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { isAuthenticated, customer } = useAuth();
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [editingPhone, setEditingPhone] = useState(!isAuthenticated || !customer?.phone);
  const [phoneError, setPhoneError] = useState("");
  const [stage, setStage] = useState<StkStage>("form");
  const [txId, setTxId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPhone(customer?.phone ?? "");
      setEditingPhone(!isAuthenticated || !customer?.phone);
      setPhoneError("");
      setStage("form");
      setTxId(null);
    }
  }, [open, customer?.phone, isAuthenticated]);

  const stkPush = useInitiateStkPush({
    mutation: {
      onSuccess(data) {
        setTxId(data.id);
        setStage("pending");
      },
      onError() {
        setStage("failed");
      },
    },
  });

  const statusQuery = useGetStkPushStatus(txId ?? "", {
    query: {
      enabled: stage === "pending" && Boolean(txId),
      queryKey: ["stk-push-status", txId],
      refetchInterval: (query) =>
        query.state.data?.status === "PENDING" ? 1500 : false,
    },
  });

  useEffect(() => {
    if (stage !== "pending") return;
    if (statusQuery.data?.status === "COMPLETED") {
      setStage("success");
    } else if (statusQuery.data?.status === "FAILED") {
      setStage("failed");
    }
  }, [stage, statusQuery.data?.status]);

  function reset() {
    setStage("form");
    setTxId(null);
    setPhoneError("");
    setPhone(customer?.phone ?? "");
    setEditingPhone(!isAuthenticated || !customer?.phone);
  }

  function handleClose(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pkg) return;
    const trimmed = phone.trim();
    if (!KENYAN_PHONE_RE.test(trimmed)) {
      setPhoneError("Enter a valid M-PESA phone number, e.g. 0712345678");
      return;
    }
    setPhoneError("");
    stkPush.mutate({ data: { planId: pkg.id, phone: trimmed } });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm">
        {stage === "form" && (
          <>
            <DialogHeader>
              <DialogTitle>Buy {pkg?.name}</DialogTitle>
              <DialogDescription>
                KES {pkg ? parseFloat(pkg.price).toLocaleString() : ""} · An M-PESA STK
                push prompt will be sent to the number below.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="buy-phone">M-PESA Phone Number</Label>
                {isAuthenticated && customer?.phone && !editingPhone ? (
                  <div className="flex items-center justify-between rounded-md border px-3 py-2 bg-muted/40">
                    <span className="text-sm font-medium">{phone}</span>
                    <button
                      type="button"
                      onClick={() => setEditingPhone(true)}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Change Number
                    </button>
                  </div>
                ) : (
                  <Input
                    id="buy-phone"
                    inputMode="tel"
                    placeholder="0712345678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoFocus
                  />
                )}
                {phoneError && (
                  <p className="text-xs text-destructive">{phoneError}</p>
                )}
              </div>
              <DialogFooter>
                <Button type="submit" className="w-full" disabled={stkPush.isPending}>
                  {stkPush.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
                    </>
                  ) : (
                    "Send STK Push"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}

        {stage === "pending" && (
          <div className="py-6 flex flex-col items-center text-center gap-3">
            <Smartphone className="w-12 h-12 text-primary animate-pulse" />
            <h3 className="font-semibold text-lg">Check your phone</h3>
            <p className="text-sm text-muted-foreground">
              Enter your M-PESA PIN on the prompt sent to {phone} to complete this
              purchase.
            </p>
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {stage === "success" && (
          <div className="py-6 flex flex-col items-center text-center gap-3">
            <CheckCircle2 className="w-12 h-12 text-green-600" />
            <h3 className="font-semibold text-lg">Payment received!</h3>
            <p className="text-sm text-muted-foreground">
              Your {pkg?.name} package is now active. Enjoy your internet.
            </p>
            <Button className="w-full" onClick={() => handleClose(false)}>
              Done
            </Button>
          </div>
        )}

        {stage === "failed" && (
          <div className="py-6 flex flex-col items-center text-center gap-3">
            <XCircle className="w-12 h-12 text-destructive" />
            <h3 className="font-semibold text-lg">Payment failed</h3>
            <p className="text-sm text-muted-foreground">
              We couldn't confirm the M-PESA payment. Please try again.
            </p>
            <Button variant="outline" className="w-full" onClick={reset}>
              Try Again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function PackagesPage() {
  const tenantId = new URLSearchParams(window.location.search).get("tenantId") ?? "";
  const { data: packages, isLoading } = useListPortalPackages(
    { tenantId },
    { query: { enabled: Boolean(tenantId) } },
  );
  const [, navigate] = useLocation();
  const { isAuthenticated, customer } = useAuth();
  const [buyTarget, setBuyTarget] = useState<HotspotPackagePublic | null>(null);

  // An already-active customer doesn't need the purchase flow at all — send
  // them straight to their account instead of showing the captive/packages page.
  const dashboardQuery = useGetPortalDashboard({ query: { enabled: isAuthenticated } });
  useEffect(() => {
    if (dashboardQuery.data?.activeSession) navigate("/dashboard");
  }, [dashboardQuery.data, navigate]);

  if (isAuthenticated && dashboardQuery.isLoading) {
    return (
      <div className="min-h-screen portal-shell grid place-items-center">
        <Skeleton className="h-8 w-40" />
      </div>
    );
  }

  return (
    <div className="min-h-screen portal-shell">
      {/* Header */}
      <header className="bg-primary text-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wifi className="w-6 h-6" />
            <span className="font-bold text-lg">PulseNet Networks</span>
          </div>
          {isAuthenticated ? (
            <button
              onClick={() => navigate("/dashboard")}
              className="flex items-center gap-1 text-sm text-white/90 hover:text-white"
            >
              <User className="w-4 h-4" />
              <span>{customer?.firstName}</span>
            </button>
          ) : (
            <button
              onClick={() => navigate("/login")}
              className="flex items-center gap-1 text-sm text-white/90 hover:text-white"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-foreground">Internet Packages</h2>
          <p className="text-muted-foreground mt-1">Choose a plan that fits your needs</p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-4 space-y-3">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-8 w-20" />
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-6 w-20" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !tenantId ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">This Wi-Fi network is not configured yet. Please contact support.</CardContent></Card>
        ) : packages && packages.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {packages.map((pkg, index) => (
              <Card
                key={pkg.id}
                className={`portal-package overflow-hidden transition-all hover:-translate-y-1 hover:shadow-xl ${
                  index === 0 ? "border-primary ring-1 ring-primary/20" : ""
                }`}
              >
                {index === 0 && (
                  <div className="bg-primary text-white text-center text-xs font-semibold py-1">
                    MOST POPULAR
                  </div>
                )}
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{pkg.name}</CardTitle>
                      {pkg.description && (
                        <CardDescription className="mt-1">{pkg.description}</CardDescription>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary">
                        KES {parseFloat(pkg.price).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Database className="w-3 h-3" />
                      {formatBytes(pkg.dataLimitMb)}
                    </Badge>
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatValidity(pkg.validityHours, pkg.durationDays)}
                    </Badge>
                    {pkg.speedDownKbps && (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        Up to {formatSpeed(pkg.speedDownKbps)}
                      </Badge>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="pt-0">
                  <Button
                    className="w-full"
                    variant={index === 0 ? "default" : "outline"}
                    onClick={() => setBuyTarget(pkg)}
                  >
                    Buy now
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="text-center py-12">
              <Wifi className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No packages available at the moment.</p>
            </CardContent>
          </Card>
        )}

        {!isAuthenticated && (
          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground mb-2">Already have an account?</p>
            <Button variant="outline" className="w-full" onClick={() => navigate("/login")}>
              <LogIn className="mr-2 h-4 w-4" />
              Sign In to Your Account
            </Button>
          </div>
        )}
      </div>

      <BuyDialog
        pkg={buyTarget}
        open={buyTarget !== null}
        onOpenChange={(open) => {
          if (!open) setBuyTarget(null);
        }}
      />
    </div>
  );
}
