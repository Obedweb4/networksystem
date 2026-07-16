import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth";

export default function SettingsPage() {
  const { user } = useAuth();
  return (
    <AppLayout>
      <div className="p-6 max-w-3xl space-y-6">
        <div>
          <h1 className="text-lg font-bold">Settings</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Account and tenant configuration</p>
        </div>
        <div className="bg-card border border-border rounded-md p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Account</p>
          {[
            ["Name", `${user?.firstName} ${user?.lastName}`],
            ["Email", user?.email ?? "—"],
            ["Tenant ID", user?.tenantId ?? "—"],
            ["Roles", user?.roles?.join(", ") ?? "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-medium font-mono">{v}</span>
            </div>
          ))}
        </div>
        <div className="bg-card border border-border rounded-md p-4">
          <p className="text-xs text-muted-foreground">Additional settings will be available in a future update.</p>
        </div>
      </div>
    </AppLayout>
  );
}
