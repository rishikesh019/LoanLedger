import { useState, useMemo } from "react";
import { useRoute } from "wouter";
import { useGetBorrower, useListPayments, useCreatePayment, useUpdatePayment, useDeletePayment, getGetBorrowerQueryKey, getListPaymentsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Plus, CheckCircle, Circle, Trash2, Calendar, CalendarRange, TrendingDown, Info } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const paymentSchema = z.object({
  month: z.coerce.number().min(1).max(12),
  year: z.coerce.number().min(2000),
  amountPaid: z.string().optional(),
  isPaid: z.boolean().default(false),
  paidDate: z.string().optional(),
  notes: z.string().optional(),
});

const bulkSchema = z.object({
  fromMonth: z.coerce.number().min(1).max(12),
  fromYear: z.coerce.number().min(2000),
  toMonth: z.coerce.number().min(1).max(12),
  toYear: z.coerce.number().min(2000),
  isPaid: z.boolean().default(false),
  paidDate: z.string().optional(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;
type BulkFormData = z.infer<typeof bulkSchema>;

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    closed: "bg-slate-100 text-slate-600 border-slate-200",
    defaulted: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${map[status] ?? "bg-slate-100 text-slate-600"}`}>
      {status}
    </span>
  );
}

export default function BorrowerDetail() {
  const [, params] = useRoute("/borrowers/:id");
  const id = Number(params?.id);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [showBulkPayment, setShowBulkPayment] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { getToken } = useAuth();

  const { data: borrower, isLoading: borrowerLoading } = useGetBorrower(id, { query: { enabled: !!id, queryKey: getGetBorrowerQueryKey(id) } });
  const { data: payments, isLoading: paymentsLoading } = useListPayments(id, { query: { enabled: !!id, queryKey: getListPaymentsQueryKey(id) } });
  const createPayment = useCreatePayment();
  const updatePayment = useUpdatePayment();
  const deletePayment = useDeletePayment();

  const now = new Date();
  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { month: now.getMonth() + 1, year: now.getFullYear(), isPaid: false, amountPaid: "" },
  });

  const bulkForm = useForm<BulkFormData>({
    resolver: zodResolver(bulkSchema),
    defaultValues: { fromMonth: now.getMonth() + 1, fromYear: now.getFullYear(), toMonth: now.getMonth() + 1, toYear: now.getFullYear(), isPaid: false },
  });

  // Current outstanding principal — last payment that has outstandingPrincipal set, or original
  const currentOutstanding = useMemo(() => {
    if (!payments || !borrower) return borrower ? borrower.principalAmount : 0;
    const sorted = [...payments].sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
    for (const p of sorted) {
      if (p.outstandingPrincipal != null) return p.outstandingPrincipal;
    }
    return borrower.principalAmount;
  }, [payments, borrower]);

  // Live split preview for the single payment dialog
  const amountPaidWatch = form.watch("amountPaid");
  const selectedMonth = form.watch("month");
  const selectedYear = form.watch("year");

  const splitPreview = useMemo(() => {
    if (!borrower) return null;
    // For the selected month, find the outstanding before that month
    const outstandingForMonth = (() => {
      if (!payments) return currentOutstanding;
      const sorted = [...payments]
        .filter(p => p.year * 12 + p.month < selectedYear * 12 + selectedMonth)
        .sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
      for (const p of sorted) {
        if (p.outstandingPrincipal != null) return p.outstandingPrincipal;
      }
      return borrower.principalAmount;
    })();

    const fullInterest = Math.round((outstandingForMonth * borrower.interestRate) / 100 * 100) / 100;
    const fullBase = Math.round((outstandingForMonth * borrower.baseInterestRate) / 100 * 100) / 100;
    const fullCommission = Math.round((outstandingForMonth * borrower.commissionRate) / 100 * 100) / 100;

    const paid = amountPaidWatch ? parseFloat(amountPaidWatch) : null;

    if (paid != null && !isNaN(paid) && paid > 0) {
      if (paid >= fullInterest) {
        const principalReduction = Math.round((paid - fullInterest) * 100) / 100;
        return {
          outstanding: outstandingForMonth,
          fullInterest, fullBase, fullCommission,
          amountPaid: paid,
          interestPortion: fullInterest,
          principalReduction,
          newOutstanding: Math.round((outstandingForMonth - principalReduction) * 100) / 100,
          isPartial: false,
        };
      } else {
        // Partial payment
        const ratio = paid / fullInterest;
        return {
          outstanding: outstandingForMonth,
          fullInterest, fullBase, fullCommission,
          amountPaid: paid,
          interestPortion: paid,
          baseInterestPortion: Math.round(fullBase * ratio * 100) / 100,
          commissionPortion: Math.round(fullCommission * ratio * 100) / 100,
          principalReduction: 0,
          newOutstanding: outstandingForMonth,
          isPartial: true,
          shortfall: Math.round((fullInterest - paid) * 100) / 100,
        };
      }
    }
    return { outstanding: outstandingForMonth, fullInterest, fullBase, fullCommission };
  }, [borrower, amountPaidWatch, selectedMonth, selectedYear, payments, currentOutstanding]);

  // Bulk range preview
  const bulkFromMonth = bulkForm.watch("fromMonth");
  const bulkFromYear = bulkForm.watch("fromYear");
  const bulkToMonth = bulkForm.watch("toMonth");
  const bulkToYear = bulkForm.watch("toYear");

  const bulkPreview = useMemo(() => {
    const from = bulkFromYear * 12 + (bulkFromMonth - 1);
    const to = bulkToYear * 12 + (bulkToMonth - 1);
    if (from > to) return { count: 0, valid: false };
    const total = to - from + 1;
    if (!payments) return { count: total, valid: true, skipped: 0 };
    const existingSet = new Set(payments.map(p => `${p.year}-${p.month}`));
    let skipped = 0;
    for (let c = from; c <= to; c++) {
      const y = Math.floor(c / 12);
      const m = (c % 12) + 1;
      if (existingSet.has(`${y}-${m}`)) skipped++;
    }
    return { count: total - skipped, valid: true, skipped, total };
  }, [bulkFromMonth, bulkFromYear, bulkToMonth, bulkToYear, payments]);

  const handleAddPayment = (data: PaymentFormData) => {
    const amountPaid = data.amountPaid && data.amountPaid.trim() !== "" ? Number(data.amountPaid) : undefined;
    createPayment.mutate(
      {
        borrowerId: id,
        data: {
          ...data,
          paidDate: data.paidDate || undefined,
          notes: data.notes || undefined,
          // @ts-ignore — amountPaid is not in generated schema but handled by the API
          amountPaid,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Payment recorded" });
          queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getGetBorrowerQueryKey(id) });
          setShowAddPayment(false);
          form.reset({ month: now.getMonth() + 1, year: now.getFullYear(), isPaid: false, amountPaid: "" });
        },
        onError: () => toast({ title: "Error", description: "Failed to record payment.", variant: "destructive" }),
      }
    );
  };

  const handleBulkPayment = async (data: BulkFormData) => {
    setBulkLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/borrowers/${id}/payments/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          fromMonth: Number(data.fromMonth),
          fromYear: Number(data.fromYear),
          toMonth: Number(data.toMonth),
          toYear: Number(data.toYear),
          isPaid: data.isPaid,
          paidDate: data.isPaid && data.paidDate ? data.paidDate : undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed");
      toast({
        title: `${result.created} payment${result.created !== 1 ? "s" : ""} created`,
        description: result.skipped > 0 ? `${result.skipped} month${result.skipped !== 1 ? "s" : ""} already existed and were skipped.` : undefined,
      });
      queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getGetBorrowerQueryKey(id) });
      setShowBulkPayment(false);
      bulkForm.reset({ fromMonth: now.getMonth() + 1, fromYear: now.getFullYear(), toMonth: now.getMonth() + 1, toYear: now.getFullYear(), isPaid: false });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setBulkLoading(false);
    }
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
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!borrower) {
    return (
      <div className="p-4 text-center">
        <p className="text-slate-500">Borrower not found.</p>
        <Link href="/borrowers" className="text-emerald-600 text-sm mt-2 block">Go back</Link>
      </div>
    );
  }

  const paidPayments = (payments ?? []).filter(p => p.isPaid);
  const totalPaid = paidPayments.reduce((sum, p) => sum + p.interestAmount, 0);
  const totalCommission = paidPayments.reduce((sum, p) => sum + p.commissionAmount, 0);
  const totalPrincipalReduced = (payments ?? []).reduce((sum, p) => sum + (p.principalReduction ?? 0), 0);
  const principalReduced = totalPrincipalReduced > 0;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5" data-testid="borrower-detail-page">
      <div className="flex items-start gap-3">
        <Link href="/borrowers">
          <button className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 flex-shrink-0 mt-0.5" data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </button>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 truncate">{borrower.name}</h1>
            {statusBadge(borrower.status)}
          </div>
          <p className="text-slate-500 text-sm truncate">{borrower.address}</p>
        </div>
      </div>

      {/* Loan Info Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-slate-200">
          <CardContent className="p-3 md:p-4">
            <p className="text-xs text-slate-500 mb-1">Original Principal</p>
            <p className="text-lg md:text-xl font-bold text-slate-900">{formatCurrency(borrower.principalAmount)}</p>
          </CardContent>
        </Card>
        <Card className={`border-slate-200 ${principalReduced ? "border-l-4 border-l-blue-500" : ""}`}>
          <CardContent className="p-3 md:p-4">
            <p className="text-xs text-blue-600 mb-1">Outstanding Principal</p>
            <p className="text-lg md:text-xl font-bold text-blue-700">{formatCurrency(currentOutstanding)}</p>
            {principalReduced && (
              <p className="text-xs text-blue-400 flex items-center gap-1">
                <TrendingDown className="h-3 w-3" />↓ {formatCurrency(totalPrincipalReduced)} reduced
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-3 md:p-4">
            <p className="text-xs text-slate-500 mb-1">Monthly Interest</p>
            <p className="text-lg md:text-xl font-bold text-slate-900">{formatCurrency((currentOutstanding * borrower.interestRate) / 100)}</p>
            <p className="text-xs text-slate-400">{borrower.interestRate}%/mo on outstanding</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 border-l-4 border-l-emerald-500">
          <CardContent className="p-3 md:p-4">
            <p className="text-xs text-emerald-600 mb-1">Commission ({borrower.commissionRate}%)</p>
            <p className="text-lg md:text-xl font-bold text-emerald-700">{formatCurrency((currentOutstanding * borrower.commissionRate) / 100)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-slate-200">
          <CardContent className="p-3 md:p-4 text-center">
            <p className="text-xs text-slate-500 mb-1">Total Collected</p>
            <p className="text-base md:text-lg font-bold text-slate-900">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-3 md:p-4 text-center">
            <p className="text-xs text-emerald-600 mb-1">Commission Earned</p>
            <p className="text-base md:text-lg font-bold text-emerald-700">{formatCurrency(totalCommission)}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-3 md:p-4 text-center">
            <p className="text-xs text-slate-500 mb-1">Payments</p>
            <p className="text-base md:text-lg font-bold text-slate-900">{payments?.length ?? 0} <span className="text-sm text-emerald-600">({paidPayments.length} paid)</span></p>
          </CardContent>
        </Card>
      </div>

      {/* Loan Information */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3 px-4 md:px-6">
          <CardTitle className="text-base font-semibold text-slate-900">Loan Information</CardTitle>
        </CardHeader>
        <CardContent className="px-4 md:px-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div><p className="text-slate-400 text-xs">Start Date</p><p className="text-slate-900 font-medium">{borrower.startDate}</p></div>
            {borrower.endDate && <div><p className="text-slate-400 text-xs">End Date</p><p className="text-slate-900 font-medium">{borrower.endDate}</p></div>}
            {borrower.tenure && <div><p className="text-slate-400 text-xs">Tenure</p><p className="text-slate-900 font-medium">{borrower.tenure} months</p></div>}
            {borrower.phone && <div><p className="text-slate-400 text-xs">Phone</p><p className="text-slate-900 font-medium">{borrower.phone}</p></div>}
            {borrower.email && <div><p className="text-slate-400 text-xs">Email</p><p className="text-slate-900 font-medium break-all">{borrower.email}</p></div>}
            {borrower.monthsElapsed != null && <div><p className="text-slate-400 text-xs">Months Elapsed</p><p className="text-slate-900 font-medium">{borrower.monthsElapsed}</p></div>}
          </div>
          {borrower.notes && <div className="mt-4 pt-4 border-t border-slate-100"><p className="text-slate-400 text-xs mb-1">Notes</p><p className="text-slate-700 text-sm">{borrower.notes}</p></div>}
        </CardContent>
      </Card>

      {/* Payments */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3 px-4 md:px-6 flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold text-slate-900">Payment History</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowBulkPayment(true)} data-testid="button-bulk-payment">
              <CalendarRange className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Bulk Record</span>
              <span className="sm:hidden">Bulk</span>
            </Button>
            <Button size="sm" onClick={() => setShowAddPayment(true)} className="bg-slate-900 hover:bg-slate-800" data-testid="button-add-payment">
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Record Payment</span>
              <span className="sm:hidden">Record</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {paymentsLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
          ) : !payments || payments.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No payments recorded yet</p>
              <p className="text-xs mt-1">Use "Record Payment" for a single month or "Bulk Record" for a date range.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Period</th>
                    <th className="text-right px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount Paid</th>
                    <th className="text-right px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Interest</th>
                    <th className="text-right px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Commission</th>
                    <th className="text-right px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Principal ↓</th>
                    <th className="px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 md:px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50" data-testid={`row-payment-${p.id}`}>
                      <td className="px-4 md:px-6 py-3 font-medium text-slate-900 whitespace-nowrap">{MONTHS[p.month - 1]} {p.year}</td>
                      <td className="px-4 md:px-6 py-3 text-right whitespace-nowrap">
                        {p.amountPaid != null ? (
                          <span className="text-slate-900 font-medium">{formatCurrency(p.amountPaid)}</span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 md:px-6 py-3 text-right text-slate-600 whitespace-nowrap hidden md:table-cell">{formatCurrency(p.interestAmount)}</td>
                      <td className="px-4 md:px-6 py-3 text-right text-emerald-600 font-medium whitespace-nowrap">{formatCurrency(p.commissionAmount)}</td>
                      <td className="px-4 md:px-6 py-3 text-right hidden lg:table-cell">
                        {(p.principalReduction ?? 0) > 0 ? (
                          <span className="text-blue-600 font-medium">−{formatCurrency(p.principalReduction!)}</span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 md:px-6 py-3">
                        <button
                          onClick={() => togglePaid(p.id, p.isPaid)}
                          className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full transition-colors whitespace-nowrap ${p.isPaid ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                          data-testid={`button-toggle-payment-${p.id}`}
                        >
                          {p.isPaid ? <CheckCircle className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                          {p.isPaid ? "Paid" : "Pending"}
                        </button>
                      </td>
                      <td className="px-4 md:px-6 py-3">
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

      {/* Single Payment Dialog */}
      <Dialog open={showAddPayment} onOpenChange={setShowAddPayment}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="dialog-add-payment">
          <DialogHeader>
            <DialogTitle>Record Monthly Payment</DialogTitle>
          </DialogHeader>

          {/* Current outstanding summary */}
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 text-sm">
            <div className="flex items-center gap-1.5 text-blue-700 font-medium mb-1">
              <Info className="h-3.5 w-3.5" />
              Current Outstanding Principal
            </div>
            <p className="text-blue-900 font-bold text-base">{formatCurrency(currentOutstanding)}</p>
            {currentOutstanding !== borrower.principalAmount && (
              <p className="text-blue-500 text-xs mt-0.5">Original: {formatCurrency(borrower.principalAmount)}</p>
            )}
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

              {/* Interest breakdown for selected month */}
              {splitPreview && (
                <div className="p-3 bg-slate-50 rounded-lg text-sm border border-slate-200">
                  <p className="text-xs text-slate-500 font-medium mb-2">Monthly breakdown on {formatCurrency(splitPreview.outstanding)}</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div><p className="text-slate-400 text-xs">Total Interest</p><p className="font-semibold text-slate-900">{formatCurrency(splitPreview.fullInterest)}</p></div>
                    <div><p className="text-slate-400 text-xs">Base (10%)</p><p className="font-semibold text-slate-700">{formatCurrency(splitPreview.fullBase)}</p></div>
                    <div><p className="text-emerald-600 text-xs">Commission</p><p className="font-semibold text-emerald-700">{formatCurrency(splitPreview.fullCommission)}</p></div>
                  </div>
                </div>
              )}

              <FormField control={form.control} name="amountPaid" render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount Paid (optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={splitPreview ? `Interest due: ₹${splitPreview.fullInterest}` : "Enter amount"}
                      {...field}
                      data-testid="input-amount-paid"
                    />
                  </FormControl>
                  <p className="text-xs text-slate-400">If paid amount exceeds interest, the surplus reduces the outstanding principal.</p>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Live split preview when amount is entered */}
              {(() => {
                if (!splitPreview || !("amountPaid" in splitPreview)) return null;
                const sp = splitPreview as {
                  outstanding: number; fullInterest: number; fullBase: number; fullCommission: number;
                  amountPaid: number; interestPortion: number; principalReduction: number;
                  newOutstanding: number; isPartial: boolean; shortfall?: number;
                };
                if (!sp.amountPaid || sp.amountPaid <= 0) return null;
                const bgClass = sp.isPartial ? "bg-amber-50 border-amber-200" : sp.principalReduction > 0 ? "bg-blue-50 border-blue-200" : "bg-emerald-50 border-emerald-200";
                return (
                  <div className={`p-3 rounded-lg border text-sm ${bgClass}`}>
                    <p className="text-xs font-semibold mb-2 text-slate-600">Payment Split Preview</p>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Amount paid</span>
                        <span className="font-semibold">{formatCurrency(sp.amountPaid)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">→ Interest portion</span>
                        <span className="font-medium text-slate-700">{formatCurrency(sp.interestPortion)}</span>
                      </div>
                      {sp.principalReduction > 0 && (
                        <div className="flex justify-between">
                          <span className="text-blue-600">→ Principal reduced by</span>
                          <span className="font-semibold text-blue-700">−{formatCurrency(sp.principalReduction)}</span>
                        </div>
                      )}
                      {sp.isPartial && sp.shortfall != null && (
                        <div className="flex justify-between text-amber-700">
                          <span>⚠ Interest shortfall</span>
                          <span className="font-medium">{formatCurrency(sp.shortfall)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-current border-opacity-20 pt-1.5 mt-1.5">
                        <span className="text-slate-500">New outstanding principal</span>
                        <span className={`font-bold ${sp.principalReduction > 0 ? "text-blue-700" : "text-slate-900"}`}>
                          {formatCurrency(sp.newOutstanding)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {!amountPaidWatch || amountPaidWatch.trim() === "" ? (
                <FormField control={form.control} name="isPaid" render={({ field }) => (
                  <FormItem className="flex items-center gap-3">
                    <FormControl>
                      <input type="checkbox" checked={field.value} onChange={field.onChange} className="h-4 w-4 rounded" data-testid="checkbox-payment-paid" />
                    </FormControl>
                    <FormLabel className="!mt-0">Mark as paid (interest only)</FormLabel>
                  </FormItem>
                )} />
              ) : null}

              {(form.watch("isPaid") && (!amountPaidWatch || amountPaidWatch.trim() === "")) && (
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

      {/* Bulk Payment Dialog */}
      <Dialog open={showBulkPayment} onOpenChange={setShowBulkPayment}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="dialog-bulk-payment">
          <DialogHeader>
            <DialogTitle>Bulk Record Payments</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">Generate interest payment entries for a range of months at once. Already-existing months are skipped automatically.</p>

          <Form {...bulkForm}>
            <form onSubmit={bulkForm.handleSubmit(handleBulkPayment)} className="space-y-4">
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">From</p>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={bulkForm.control} name="fromMonth" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Month</FormLabel>
                      <Select value={String(field.value)} onValueChange={v => field.onChange(Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={bulkForm.control} name="fromYear" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Year</FormLabel>
                      <FormControl><Input type="number" min={2000} {...field} /></FormControl>
                    </FormItem>
                  )} />
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">To</p>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={bulkForm.control} name="toMonth" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Month</FormLabel>
                      <Select value={String(field.value)} onValueChange={v => field.onChange(Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={bulkForm.control} name="toYear" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Year</FormLabel>
                      <FormControl><Input type="number" min={2000} {...field} /></FormControl>
                    </FormItem>
                  )} />
                </div>
              </div>

              {/* Range preview */}
              {bulkPreview.valid ? (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm">
                  {bulkPreview.count > 0 ? (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Will create</span>
                      <span className="font-bold text-slate-900">{bulkPreview.count} payment{bulkPreview.count !== 1 ? "s" : ""}</span>
                    </div>
                  ) : (
                    <p className="text-amber-600 font-medium">All months in this range already have records.</p>
                  )}
                  {(bulkPreview.skipped ?? 0) > 0 && (
                    <p className="text-slate-400 text-xs mt-1">{bulkPreview.skipped} already existing month{bulkPreview.skipped !== 1 ? "s" : ""} will be skipped.</p>
                  )}
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
                  "From" date must be before or equal to "To" date.
                </div>
              )}

              <FormField control={bulkForm.control} name="isPaid" render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl>
                    <input type="checkbox" checked={field.value} onChange={field.onChange} className="h-4 w-4 rounded" />
                  </FormControl>
                  <FormLabel className="!mt-0">Mark all as paid</FormLabel>
                </FormItem>
              )} />
              {bulkForm.watch("isPaid") && (
                <FormField control={bulkForm.control} name="paidDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Paid Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                  </FormItem>
                )} />
              )}

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setShowBulkPayment(false)}>Cancel</Button>
                <Button
                  type="submit"
                  disabled={bulkLoading || !bulkPreview.valid || bulkPreview.count === 0}
                  className="bg-slate-900 hover:bg-slate-800"
                  data-testid="button-submit-bulk"
                >
                  {bulkLoading ? "Creating..." : `Create ${bulkPreview.count > 0 ? bulkPreview.count : ""} Payment${bulkPreview.count !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
