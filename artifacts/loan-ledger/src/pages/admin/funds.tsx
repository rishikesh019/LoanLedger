import { useState } from "react";
import {
  useListFunds,
  useCreateFund,
  useUpdateFund,
  useDeleteFund,
  useListUsers,
  getListFundsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, IndianRupee, Pencil, Trash2, TrendingUp, Users, Wallet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PAYMENT_METHODS = [
  { value: "online", label: "Online Transfer" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "upi", label: "UPI" },
  { value: "neft", label: "NEFT / RTGS" },
];

const fundSchema = z.object({
  userId: z.coerce.number().min(1, "Select a user"),
  amount: z.coerce.number().min(0.01, "Amount must be positive"),
  paymentMethod: z.string().min(1, "Select a payment method"),
  notes: z.string().optional(),
  fundedAt: z.string().optional(),
});

type FundFormData = z.infer<typeof fundSchema>;

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AdminFunds() {
  const [showAdd, setShowAdd] = useState(false);
  const [editFundId, setEditFundId] = useState<number | null>(null);
  const [deleteFundId, setDeleteFundId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: funds, isLoading } = useListFunds({ query: { queryKey: getListFundsQueryKey() } });
  const { data: users } = useListUsers();
  const createFund = useCreateFund();
  const updateFund = useUpdateFund();
  const deleteFund = useDeleteFund();

  const activeUsers = (users ?? []).filter(u => u.isActive && u.role === "user");

  const form = useForm<FundFormData>({
    resolver: zodResolver(fundSchema),
    defaultValues: {
      paymentMethod: "online",
      fundedAt: new Date().toISOString().split("T")[0],
    },
  });

  const editFund = editFundId ? (funds ?? []).find(f => f.id === editFundId) : null;

  function openEdit(fundId: number) {
    const f = (funds ?? []).find(f => f.id === fundId);
    if (!f) return;
    setEditFundId(fundId);
    form.reset({
      userId: f.userId,
      amount: Number(f.amount),
      paymentMethod: f.paymentMethod,
      notes: f.notes ?? "",
      fundedAt: f.fundedAt ? new Date(f.fundedAt).toISOString().split("T")[0] : "",
    });
    setShowAdd(true);
  }

  function openCreate() {
    setEditFundId(null);
    form.reset({
      paymentMethod: "online",
      fundedAt: new Date().toISOString().split("T")[0],
    });
    setShowAdd(true);
  }

  function closeDialog() {
    setShowAdd(false);
    setEditFundId(null);
    form.reset();
  }

  const onSubmit = (data: FundFormData) => {
    const payload = {
      userId: data.userId,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      notes: data.notes || undefined,
      fundedAt: data.fundedAt ? new Date(data.fundedAt).toISOString() : undefined,
    };

    if (editFundId) {
      updateFund.mutate(
        { id: editFundId, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Fund record updated" });
            queryClient.invalidateQueries({ queryKey: getListFundsQueryKey() });
            closeDialog();
          },
          onError: () => toast({ title: "Error", description: "Failed to update fund record.", variant: "destructive" }),
        }
      );
    } else {
      createFund.mutate(
        { data: payload },
        {
          onSuccess: () => {
            toast({ title: "Fund recorded", description: `${formatCurrency(data.amount)} sent to user.` });
            queryClient.invalidateQueries({ queryKey: getListFundsQueryKey() });
            closeDialog();
          },
          onError: () => toast({ title: "Error", description: "Failed to record fund transfer.", variant: "destructive" }),
        }
      );
    }
  };

  const confirmDelete = () => {
    if (!deleteFundId) return;
    deleteFund.mutate(
      { id: deleteFundId },
      {
        onSuccess: () => {
          toast({ title: "Deleted", description: "Fund record removed." });
          queryClient.invalidateQueries({ queryKey: getListFundsQueryKey() });
          setDeleteFundId(null);
        },
        onError: () => toast({ title: "Error", description: "Failed to delete record.", variant: "destructive" }),
      }
    );
  };

  // Aggregate stats
  const totalFunded = (funds ?? []).reduce((s, f) => s + Number(f.amount), 0);
  const byUser = (funds ?? []).reduce<Record<number, { name: string; total: number }>>((acc, f) => {
    if (!acc[f.userId]) acc[f.userId] = { name: f.userName ?? `User #${f.userId}`, total: 0 };
    acc[f.userId].total += Number(f.amount);
    return acc;
  }, {});
  const uniqueUsers = Object.keys(byUser).length;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5" data-testid="admin-funds-page">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Fund Transfers</h1>
          <p className="text-slate-500 text-sm mt-0.5">{(funds ?? []).length} transfer records</p>
        </div>
        <Button onClick={openCreate} className="bg-slate-900 hover:bg-slate-800 flex-shrink-0" data-testid="button-record-fund">
          <Plus className="h-4 w-4 mr-1 md:mr-2" />
          <span className="hidden sm:inline">Record Transfer</span>
          <span className="sm:hidden">Record</span>
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <IndianRupee className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total Funded</p>
              <p className="text-xl font-bold text-slate-900">{formatCurrency(totalFunded)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5 text-blue-700" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Users Funded</p>
              <p className="text-xl font-bold text-slate-900">{uniqueUsers}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="h-5 w-5 text-purple-700" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Avg per User</p>
              <p className="text-xl font-bold text-slate-900">{formatCurrency(uniqueUsers > 0 ? totalFunded / uniqueUsers : 0)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-user totals */}
      {uniqueUsers > 0 && (
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Breakdown by User</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(byUser).map(([uid, { name, total }]) => (
                <div key={uid} className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2">
                  <span className="text-sm font-medium text-slate-700">{name}</span>
                  <span className="text-sm font-bold text-emerald-700">{formatCurrency(total)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transfers table */}
      <Card className="border-slate-200">
        {isLoading ? (
          <CardContent className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </CardContent>
        ) : (funds ?? []).length === 0 ? (
          <CardContent className="py-16 text-center">
            <Wallet className="h-12 w-12 mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500">No fund transfers recorded yet</p>
            <button onClick={openCreate} className="text-emerald-600 text-sm mt-2 hover:underline">
              Record your first transfer
            </button>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">User</th>
                  <th className="text-right px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                  <th className="px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Method</th>
                  <th className="text-right px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Date</th>
                  <th className="px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Notes</th>
                  <th className="px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(funds ?? []).map(f => (
                  <tr key={f.id} className="hover:bg-slate-50" data-testid={`row-fund-${f.id}`}>
                    <td className="px-4 md:px-6 py-3 md:py-4">
                      <div>
                        <p className="font-medium text-slate-900">{f.userName ?? `User #${f.userId}`}</p>
                        {f.userEmail && <p className="text-xs text-slate-400">{f.userEmail}</p>}
                      </div>
                    </td>
                    <td className="px-4 md:px-6 py-3 md:py-4 text-right">
                      <span className="font-semibold text-emerald-700">{formatCurrency(Number(f.amount))}</span>
                    </td>
                    <td className="px-4 md:px-6 py-3 md:py-4 hidden sm:table-cell">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        {PAYMENT_METHODS.find(m => m.value === f.paymentMethod)?.label ?? f.paymentMethod}
                      </span>
                    </td>
                    <td className="px-4 md:px-6 py-3 md:py-4 text-right text-slate-500 hidden md:table-cell whitespace-nowrap">
                      {formatDate(f.fundedAt)}
                    </td>
                    <td className="px-4 md:px-6 py-3 md:py-4 text-slate-400 text-xs hidden lg:table-cell max-w-[200px] truncate">
                      {f.notes ?? "—"}
                    </td>
                    <td className="px-4 md:px-6 py-3 md:py-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(f.id)}
                          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                          data-testid={`button-edit-fund-${f.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteFundId(f.id)}
                          className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600"
                          data-testid={`button-delete-fund-${f.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={v => { if (!v) closeDialog(); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="dialog-fund-form">
          <DialogHeader>
            <DialogTitle>{editFundId ? "Edit Fund Transfer" : "Record Fund Transfer"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500 -mt-2">
            {editFundId ? "Update the fund transfer details below." : "Record a fund transfer you made to a user."}
          </p>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {!editFundId && (
                <FormField control={form.control} name="userId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recipient User</FormLabel>
                    <Select value={field.value ? String(field.value) : ""} onValueChange={v => field.onChange(Number(v))}>
                      <SelectTrigger data-testid="select-fund-user">
                        <SelectValue placeholder="Select a user..." />
                      </SelectTrigger>
                      <SelectContent>
                        {activeUsers.map(u => (
                          <SelectItem key={u.id} value={String(u.id)}>{u.name} — {u.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              {editFundId && editFund && (
                <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                  <p className="text-xs text-slate-500 mb-0.5">Recipient</p>
                  <p className="text-sm font-medium text-slate-900">{editFund.userName ?? `User #${editFund.userId}`}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="amount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="10000" {...field} data-testid="input-fund-amount" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="fundedAt" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Transfer Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-fund-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="paymentMethod" render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Method</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger data-testid="select-fund-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map(m => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Reference number, remarks…" {...field} rows={2} data-testid="input-fund-notes" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button
                  type="submit"
                  disabled={createFund.isPending || updateFund.isPending}
                  className="bg-slate-900 hover:bg-slate-800"
                  data-testid="button-submit-fund"
                >
                  {(createFund.isPending || updateFund.isPending) ? "Saving…" : editFundId ? "Save Changes" : "Record Transfer"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteFundId} onOpenChange={v => { if (!v) setDeleteFundId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete fund record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the fund transfer record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
