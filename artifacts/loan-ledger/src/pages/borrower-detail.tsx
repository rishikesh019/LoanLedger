import { useState } from "react";
import { useRoute } from "wouter";
import { useGetBorrower, useListPayments, useCreatePayment, useUpdatePayment, useDeletePayment, useUpdateBorrower, getGetBorrowerQueryKey, getListPaymentsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Plus, CheckCircle, Circle, Trash2, IndianRupee, Calendar, Percent } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const paymentSchema = z.object({
  month: z.coerce.number().min(1).max(12),
  year: z.coerce.number().min(2000),
  isPaid: z.boolean().default(false),
  paidDate: z.string().optional(),
  notes: z.string().optional(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    closed: "bg-slate-100 text-slate-600 border-slate-200",
    defaulted: "bg-red-50 text-red-700 border-red-200",
  };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${map[status] ?? "bg-slate-100 text-slate-600"}`}>{status}</span>;
}

export default function BorrowerDetail() {
  const [, params] = useRoute("/borrowers/:id");
  const id = Number(params?.id);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: borrower, isLoading: borrowerLoading } = useGetBorrower(id, { query: { enabled: !!id, queryKey: getGetBorrowerQueryKey(id) } });
  const { data: payments, isLoading: paymentsLoading } = useListPayments(id, { query: { enabled: !!id, queryKey: getListPaymentsQueryKey(id) } });
  const createPayment = useCreatePayment();
  const updatePayment = useUpdatePayment();
  const deletePayment = useDeletePayment();

  const now = new Date();
  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { month: now.getMonth() + 1, year: now.getFullYear(), isPaid: false },
  });

  const handleAddPayment = (data: PaymentFormData) => {
    createPayment.mutate(
      { borrowerId: id, data: { ...data, paidDate: data.paidDate || undefined, notes: data.notes || undefined } },
      {
        onSuccess: () => {
          toast({ title: "Payment recorded" });
          queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getGetBorrowerQueryKey(id) });
          setShowAddPayment(false);
          form.reset({ month: now.getMonth() + 1, year: now.getFullYear(), isPaid: false });
        },
        onError: () => toast({ title: "Error", description: "Failed to record payment.", variant: "destructive" }),
      }
    );
  };

  const togglePaid = (paymentId: number, current: boolean) => {
    updatePayment.mutate(
      { borrowerId: id, paymentId, data: { isPaid: !current, paidDate: !current ? new Date().toISOString().split("T")[0] : undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getGetBorrowerQueryKey(id) });
        },
      }
    );
  };

  const handleDeletePayment = (paymentId: number) => {
    if (!confirm("Delete this payment record?")) return;
    deletePayment.mutate({ borrowerId: id, paymentId }, {
      onSuccess: () => {
        toast({ title: "Payment deleted" });
        queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetBorrowerQueryKey(id) });
      },
    });
  };

  if (borrowerLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!borrower) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-500">Borrower not found.</p>
        <Link href="/borrowers" className="text-emerald-600 text-sm mt-2 block">Go back</Link>
      </div>
    );
  }

  const monthlyInterest = (borrower.principalAmount * borrower.interestRate) / 100;
  const monthlyBase = (borrower.principalAmount * borrower.baseInterestRate) / 100;
  const monthlyCommission = (borrower.principalAmount * borrower.commissionRate) / 100;
  const paidPayments = (payments ?? []).filter(p => p.isPaid);
  const totalPaid = paidPayments.reduce((sum, p) => sum + p.interestAmount, 0);
  const totalCommission = paidPayments.reduce((sum, p) => sum + p.commissionAmount, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="borrower-detail-page">
      <div className="flex items-center gap-3">
        <Link href="/borrowers">
          <button className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" data-testid="button-back"><ArrowLeft className="h-5 w-5" /></button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{borrower.name}</h1>
            {statusBadge(borrower.status)}
          </div>
          <p className="text-slate-500 text-sm">{borrower.address}</p>
        </div>
      </div>

      {/* Loan Info Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 mb-1">Principal</p>
            <p className="text-xl font-bold text-slate-900">{formatCurrency(borrower.principalAmount)}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 mb-1">Monthly Interest</p>
            <p className="text-xl font-bold text-slate-900">{formatCurrency(monthlyInterest)}</p>
            <p className="text-xs text-slate-400">{borrower.interestRate}%/mo</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 mb-1">Base (10%)</p>
            <p className="text-xl font-bold text-slate-700">{formatCurrency(monthlyBase)}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <p className="text-xs text-emerald-600 mb-1">Commission ({borrower.commissionRate}%)</p>
            <p className="text-xl font-bold text-emerald-700">{formatCurrency(monthlyCommission)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-slate-200">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-500 mb-1">Total Interest Collected</p>
            <p className="text-lg font-bold text-slate-900">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-emerald-600 mb-1">Total Commission Earned</p>
            <p className="text-lg font-bold text-emerald-700">{formatCurrency(totalCommission)}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-500 mb-1">Payments Recorded</p>
            <p className="text-lg font-bold text-slate-900">{payments?.length ?? 0} <span className="text-sm text-emerald-600">({paidPayments.length} paid)</span></p>
          </CardContent>
        </Card>
      </div>

      {/* Borrower Info */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-slate-900">Loan Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div><p className="text-slate-400 text-xs">Start Date</p><p className="text-slate-900 font-medium">{borrower.startDate}</p></div>
            {borrower.endDate && <div><p className="text-slate-400 text-xs">End Date</p><p className="text-slate-900 font-medium">{borrower.endDate}</p></div>}
            {borrower.tenure && <div><p className="text-slate-400 text-xs">Tenure</p><p className="text-slate-900 font-medium">{borrower.tenure} months</p></div>}
            {borrower.phone && <div><p className="text-slate-400 text-xs">Phone</p><p className="text-slate-900 font-medium">{borrower.phone}</p></div>}
            {borrower.email && <div><p className="text-slate-400 text-xs">Email</p><p className="text-slate-900 font-medium">{borrower.email}</p></div>}
            {borrower.monthsElapsed != null && <div><p className="text-slate-400 text-xs">Months Elapsed</p><p className="text-slate-900 font-medium">{borrower.monthsElapsed}</p></div>}
          </div>
          {borrower.notes && <div className="mt-4 pt-4 border-t border-slate-100"><p className="text-slate-400 text-xs mb-1">Notes</p><p className="text-slate-700 text-sm">{borrower.notes}</p></div>}
        </CardContent>
      </Card>

      {/* Payments */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold text-slate-900">Payment History</CardTitle>
          <Button size="sm" onClick={() => setShowAddPayment(true)} className="bg-slate-900 hover:bg-slate-800" data-testid="button-add-payment">
            <Plus className="h-4 w-4 mr-1" /> Record Payment
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {paymentsLoading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
          ) : !payments || payments.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No payments recorded yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Period</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Interest</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Base (10%)</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Commission</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50" data-testid={`row-payment-${p.id}`}>
                      <td className="px-6 py-3 font-medium text-slate-900">{MONTHS[p.month - 1]} {p.year}</td>
                      <td className="px-6 py-3 text-right text-slate-900">{formatCurrency(p.interestAmount)}</td>
                      <td className="px-6 py-3 text-right text-slate-600">{formatCurrency(p.baseInterestAmount)}</td>
                      <td className="px-6 py-3 text-right text-emerald-600 font-medium">{formatCurrency(p.commissionAmount)}</td>
                      <td className="px-6 py-3">
                        <button
                          onClick={() => togglePaid(p.id, p.isPaid)}
                          className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full transition-colors ${p.isPaid ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                          data-testid={`button-toggle-payment-${p.id}`}
                        >
                          {p.isPaid ? <CheckCircle className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                          {p.isPaid ? "Paid" : "Pending"}
                        </button>
                      </td>
                      <td className="px-6 py-3">
                        <button onClick={() => handleDeletePayment(p.id)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600" data-testid={`button-delete-payment-${p.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAddPayment} onOpenChange={setShowAddPayment}>
        <DialogContent data-testid="dialog-add-payment">
          <DialogHeader>
            <DialogTitle>Record Monthly Payment</DialogTitle>
          </DialogHeader>
          <div className="p-4 bg-slate-50 rounded-lg mb-4 text-sm">
            <div className="grid grid-cols-3 gap-3">
              <div><p className="text-slate-400 text-xs">Total Interest</p><p className="font-semibold text-slate-900">{formatCurrency(monthlyInterest)}</p></div>
              <div><p className="text-slate-400 text-xs">Base (10%)</p><p className="font-semibold text-slate-700">{formatCurrency(monthlyBase)}</p></div>
              <div><p className="text-emerald-600 text-xs">Commission</p><p className="font-semibold text-emerald-700">{formatCurrency(monthlyCommission)}</p></div>
            </div>
          </div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleAddPayment)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="month" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Month</FormLabel>
                    <Select value={String(field.value)} onValueChange={v => field.onChange(Number(v))}>
                      <SelectTrigger data-testid="select-payment-month"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="year" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Year</FormLabel>
                    <FormControl><Input type="number" {...field} data-testid="input-payment-year" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="isPaid" render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl>
                    <input type="checkbox" checked={field.value} onChange={field.onChange} className="h-4 w-4 rounded" data-testid="checkbox-payment-paid" />
                  </FormControl>
                  <FormLabel className="!mt-0">Mark as paid</FormLabel>
                </FormItem>
              )} />
              {form.watch("isPaid") && (
                <FormField control={form.control} name="paidDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Paid Date</FormLabel>
                    <FormControl><Input type="date" {...field} data-testid="input-payment-date" /></FormControl>
                  </FormItem>
                )} />
              )}
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setShowAddPayment(false)}>Cancel</Button>
                <Button type="submit" disabled={createPayment.isPending} className="bg-slate-900 hover:bg-slate-800" data-testid="button-submit-payment">
                  {createPayment.isPending ? "Recording..." : "Record Payment"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
