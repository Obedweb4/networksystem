import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  useListSubscriptions, getListSubscriptionsQueryKey, useCreateSubscription,
  useUpdateSubscription, useListCustomers, useListPlans,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-500/10 text-green-700",
  SUSPENDED: "bg-yellow-500/10 text-yellow-700",
  EXPIRED: "bg-red-500/10 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

const schema = z.object({
  customerId: z.string().uuid("Select a customer"),
  planId: z.string().uuid("Select a plan"),
  startsAt: z.string().min(1, "Required"),
  autoRenew: z.boolean().optional(),
});

type SubForm = z.infer<typeof schema>;

export default function SubscriptionsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const limit = 20;

  const params = { page, limit, ...(statusFilter ? { status: statusFilter as any } : {}) };
  const { data, isLoading } = useListSubscriptions(params, { query: { queryKey: getListSubscriptionsQueryKey(params) } });
  const { data: customers } = useListCustomers({ limit: 200 }, { query: { queryKey: ["customers-select"] as any } });
  const { data: plans } = useListPlans({}, { query: { queryKey: ["plans-select"] as any } });
  const createMut = useCreateSubscription();
  const updateMut = useUpdateSubscription();

  const form = useForm<SubForm>({ resolver: zodResolver(schema), defaultValues: { customerId: "", planId: "", startsAt: new Date().toISOString().slice(0, 10) } });

  function onSubmit(values: SubForm) {
    createMut.mutate({ data: { ...values, startsAt: values.startsAt } }, {
      onSuccess: () => { toast({ title: "Subscription created" }); qc.invalidateQueries({ queryKey: getListSubscriptionsQueryKey() }); setOpen(false); form.reset(); },
      onError: () => toast({ title: "Failed to create subscription", variant: "destructive" }),
    });
  }

  function handleStatus(id: string, status: string) {
    updateMut.mutate({ id, data: { status: status as any } }, {
      onSuccess: () => { toast({ title: "Status updated" }); qc.invalidateQueries({ queryKey: getListSubscriptionsQueryKey() }); },
    });
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-4 max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Subscriptions</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{data?.total ?? 0} total</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All statuses</SelectItem>
                {["ACTIVE", "SUSPENDED", "EXPIRED", "CANCELLED"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setOpen(true)} data-testid="btn-add-subscription"><Plus className="w-3.5 h-3.5 mr-1" /> New</Button>
          </div>
        </div>

        <div className="bg-card border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["Client", "Plan", "Status", "Starts", "Expires", "Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && <tr><td colSpan={6} className="text-center py-8 text-xs text-muted-foreground">Loading...</td></tr>}
              {!isLoading && !data?.data?.length && <tr><td colSpan={6} className="text-center py-8 text-xs text-muted-foreground">No subscriptions found</td></tr>}
              {data?.data?.map(s => (
                <tr key={s.id} data-testid={`row-subscription-${s.id}`}>
                  <td className="px-4 py-2.5 text-xs font-medium">{s.customerName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{s.planName ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex px-1.5 py-0.5 rounded-sm text-xs font-medium ${STATUS_COLORS[s.status] ?? ""}`}>{s.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{new Date(s.startsAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{new Date(s.expiresAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2.5">
                    <Select value={s.status} onValueChange={v => handleStatus(s.id, v)}>
                      <SelectTrigger className="h-6 text-xs w-28" data-testid={`select-status-${s.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["ACTIVE", "SUSPENDED", "EXPIRED", "CANCELLED"].map(st => <SelectItem key={st} value={st} className="text-xs">{st}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.total > limit && (
            <div className="px-4 py-2.5 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Page {page} of {Math.ceil(data.total / limit)}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                <Button size="sm" variant="outline" disabled={page * limit >= data.total} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Subscription</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <FormField control={form.control} name="customerId" render={({ field }) => (
                <FormItem><FormLabel>Client</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger data-testid="select-customer"><SelectValue placeholder="Select client" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {customers?.data?.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.firstName} {c.lastName} — {c.phone}</SelectItem>)}
                    </SelectContent>
                  </Select><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="planId" render={({ field }) => (
                <FormItem><FormLabel>Plan</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger data-testid="select-plan"><SelectValue placeholder="Select plan" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {(plans as any)?.map((p: any) => <SelectItem key={p.id} value={p.id} className="text-xs">{p.name} — KES {Number(p.price).toLocaleString()}</SelectItem>)}
                    </SelectContent>
                  </Select><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="startsAt" render={({ field }) => (
                <FormItem><FormLabel>Starts At</FormLabel><FormControl><Input {...field} type="date" data-testid="input-starts-at" /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMut.isPending} data-testid="btn-submit-subscription">Create</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
