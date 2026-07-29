import { useState, useMemo } from "react";
import { useRoute } from "wouter";
import {
  useGetBorrower, useListPayments, useCreatePayment, useUpdatePayment,
  useDeletePayment, useUpdateBorrower,
  useListBorrowerSubAccounts, useCreateBorrowerSubAccount, useMergeBorrowerSubAccounts,
  getGetBorrowerQueryKey, getListPaymentsQueryKey, getListBorrowersQueryKey, getListBorrowerSubAccountsQueryKey,
  getListPaymentsQueryOptions,
} from "@workspace/api-client-react";
import { useQueryClient, useQueries } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft, Plus, CheckCircle, Circle, Trash2, Calendar, CalendarRange,
  TrendingDown, Info, Edit2, XCircle, Printer, AlertTriangle, Clock,
  Network, GitMerge, ExternalLink,
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useSchedule } from "@/hooks/use-schedule";
import { useSplitPreview } from "@/hooks/use-split-preview";
import { printStatement } from "@/lib/print-statement";

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

const editSchema = z.object({
  name: z.string().min(1, "Name required"),
  address: z.string().min(1, "Address required"),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  interestRate: z.coerce.number().min(0, "Must be non-negative"),
  tenure: z.coerce.number().optional(),
  endDate: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["active", "closed", "defaulted"]),
});

const subAccountSchema = z.object({
  principalAmount: z.coerce.number().min(1, "Amount must be positive"),
  interestRate: z.coerce.number().min(0).default(10),
  startDate: z.string().min(1, "Start date is required"),
  tenure: z.coerce.number().optional(),
  notes: z.string().optional(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;
type BulkFormData = z.infer<typeof bulkSchema>;
type EditFormData = z.infer<typeof editSchema>;
type SubAccountFormData = z.infer<typeof subAccountSchema>;

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
  const [activeTab, setActiveTab] = useState<"history" | "schedule">("history");
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [showBulkPayment, setShowBulkPayment] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showCloseLoan, setShowCloseLoan] = useState(false);
  const [showAddSubAccount, setShowAddSubAccount] = useState(false);
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { getToken } = useAuth();

  const { data: borrower, isLoading: borrowerLoading } = useGetBorrower(id, { query: { enabled: !!id, queryKey: getGetBorrowerQueryKey(id) } });
  const { data: payments, isLoading: paymentsLoading } = useListPayments(id, { query: { enabled: !!id, queryKey: getListPaymentsQueryKey(id) } });
  const { data: subAccounts } = useListBorrowerSubAccounts(id, { query: { enabled: !!id && !borrower?.parentId, queryKey: getListBorrowerSubAccountsQueryKey(id) } });

  // Fetch payments for each sub-account in parallel
  const subAccountIds = useMemo(() => subAccounts?.map(s => s.id) ?? [], [subAccounts]);
  const subPaymentQueries = useQueries({
    queries: subAccountIds.map(subId => getListPaymentsQueryOptions(subId)),
  });
  // subPaymentQueries[i].data corresponds to subAccountIds[i]

  const createPayment = useCreatePayment();
  const updatePayment = useUpdatePayment();
  const deletePayment = useDeletePayment();
  const updateBorrower = useUpdateBorrower();
  const createSubAccount = useCreateBorrowerSubAccount();
  const mergeSubs = useMergeBorrowerSubAccounts();

  const now = new Date();
  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { month: now.getMonth() + 1, year: now.getFullYear(), isPaid: false, amountPaid: "" },
  });

  const bulkForm = useForm<BulkFormData>({
    resolver: zodResolver(bulkSchema),
    defaultValues: { fromMonth: now.getMonth() + 1, fromYear: now.getFullYear(), toMonth: now.getMonth() + 1, toYear: now.getFullYear(), isPaid: false },
  });

  const subAccountForm = useForm<SubAccountFormData>({
    resolver: zodResolver(subAccountSchema),
    defaultValues: { interestRate: 10, startDate: new Date().toISOString().split("T")[0] },
  });

  const editForm = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    values: borrower ? {
      name: borrower.name,
      address: borrower.address,
      phone: borrower.phone ?? "",
      email: borrower.email ?? "",
      interestRate: borrower.interestRate,
      tenure: borrower.tenure ?? undefined,
      endDate: borrower.endDate ?? "",
      notes: borrower.notes ?? "",
      status: borrower.status as "active" | "closed" | "defaulted",
    } : undefined,
  });

  // Combined totals across parent + all sub-accounts (only meaningful when subs exist)
  const combinedTotals = useMemo(() => {
    if (!subAccounts || subAccounts.length === 0) return null;
    // Use outstandingPrincipal (post-payment) if available; fall back to principalAmount
    const subOutstanding = subAccounts.reduce((s, a) => s + (a.outstandingPrincipal ?? a.principalAmount), 0);
    const subMonthlyInterest = subAccounts.reduce((s, a) => s + ((a.outstandingPrincipal ?? a.principalAmount) * a.interestRate) / 100, 0);
    const subCommission = subAccounts.reduce((s, a) => s + ((a.outstandingPrincipal ?? a.principalAmount) * a.commissionRate) / 100, 0);
    return { subOutstanding, subMonthlyInterest, subCommission };
  }, [subAccounts]);

  // Current outstanding principal
  const currentOutstanding = useMemo(() => {
    if (!payments || !borrower) return borrower ? borrower.principalAmount : 0;
    const sorted = [...payments].sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
    for (const p of sorted) {
      if (p.outstandingPrincipal != null) return p.outstandingPrincipal;
    }
    return borrower.principalAmount;
  }, [payments, borrower]);

  // Repayment schedule
  const schedule = useSchedule(borrower, payments);

  // Payment dialog preview
  const amountPaidWatch = form.watch("amountPaid");
  const selectedMonth = form.watch("month");
  const selectedYear = form.watch("year");

  const splitPreview = useSplitPreview(borrower, amountPaidWatch, selectedMonth, selectedYear, payments, currentOutstanding);

  // Bulk preview
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
      const y = Math.floor(c / 12); const m = (c % 12) + 1;
      if (existingSet.has(`${y}-${m}`)) skipped++;
    }
    return { count: total - skipped, valid: true, skipped, total };
  }, [bulkFromMonth, bulkFromYear, bulkToMonth, bulkToYear, payments]);

  const handleAddPayment = (data: PaymentFormData) => {
    const amountPaid = data.amountPaid && data.amountPaid.trim() !== "" ? Number(data.amountPaid) : undefined;
    createPayment.mutate(
      { borrowerId: id, data: { ...data, paidDate: data.paidDate || undefined, notes: data.notes || undefined, amountPaid } as any },
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
        body: JSON.stringify({ fromMonth: Number(data.fromMonth), fromYear: Number(data.fromYear), toMonth: Number(data.toMonth), toYear: Number(data.toYear), isPaid: data.isPaid, paidDate: data.isPaid && data.paidDate ? data.paidDate : undefined }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed");
      toast({ title: `${result.created} payment${result.created !== 1 ? "s" : ""} created`, description: result.skipped > 0 ? `${result.skipped} month(s) skipped (already existed).` : undefined });
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

  const handleEditSubmit = (data: EditFormData) => {
    updateBorrower.mutate(
      { id, data: { ...data, phone: data.phone || undefined, email: data.email || undefined, endDate: data.endDate || undefined, notes: data.notes || undefined } },
      {
        onSuccess: () => {
          toast({ title: "Borrower updated" });
          queryClient.invalidateQueries({ queryKey: getGetBorrowerQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListBorrowersQueryKey() });
          setShowEdit(false);
        },
        onError: () => toast({ title: "Error", description: "Update failed.", variant: "destructive" }),
      }
    );
  };

  const handleCloseLoan = () => {
    updateBorrower.mutate(
      { id, data: { status: "closed", endDate: new Date().toISOString().split("T")[0] } },
      {
        onSuccess: () => {
          toast({ title: "Loan closed", description: "This loan has been marked as closed." });
          queryClient.invalidateQueries({ queryKey: getGetBorrowerQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListBorrowersQueryKey() });
          setShowCloseLoan(false);
        },
        onError: () => toast({ title: "Error", variant: "destructive" }),
      }
    );
  };

  const togglePaid = (paymentId: number, current: boolean) => {
    updatePayment.mutate(
      { borrowerId: id, paymentId, data: { isPaid: !current, paidDate: !current ? new Date().toISOString().split("T")[0] : undefined } },
      { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey(id) }); queryClient.invalidateQueries({ queryKey: getGetBorrowerQueryKey(id) }); } }
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

  const handleAddSubAccount = (data: SubAccountFormData) => {
    createSubAccount.mutate(
      { id, data: { ...data, notes: data.notes || undefined } },
      {
        onSuccess: () => {
          toast({ title: "Sub-account added", description: "New loan tranche created." });
          queryClient.invalidateQueries({ queryKey: getListBorrowerSubAccountsQueryKey(id) });
          setShowAddSubAccount(false);
          subAccountForm.reset({ interestRate: 10, startDate: new Date().toISOString().split("T")[0] });
        },
        onError: () => toast({ title: "Error", description: "Failed to create sub-account.", variant: "destructive" }),
      }
    );
  };

  const handleMerge = () => {
    mergeSubs.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Sub-accounts merged", description: "All tranches consolidated into this loan." });
        queryClient.invalidateQueries({ queryKey: getGetBorrowerQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListBorrowerSubAccountsQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListBorrowersQueryKey() });
        setShowMergeConfirm(false);
      },
      onError: (err: any) => toast({ title: "Error", description: err?.message ?? "Merge failed.", variant: "destructive" }),
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
  const overdueCount = (payments ?? []).filter(p => !p.isPaid && (p.year * 12 + (p.month - 1) < now.getFullYear() * 12 + now.getMonth())).length;

  // Combined payment stats across parent + all sub-accounts (only when subs exist)
  const hasSubs = (subAccounts?.length ?? 0) > 0;
  const allSubPaymentsLoaded = hasSubs && subPaymentQueries.every(q => q.data !== undefined);
  // Computed inline (not memoized) so it always reflects latest query data
  let combinedPaymentStats: {
    combinedTotalPaid: number;
    combinedTotalCommission: number;
    combinedPaymentsCount: number;
    combinedPaidCount: number;
  } | null = null;
  if (hasSubs) {
    let combinedTotalPaid = totalPaid;
    let combinedTotalCommission = totalCommission;
    let combinedPaymentsCount = payments?.length ?? 0;
    let combinedPaidCount = paidPayments.length;
    for (const q of subPaymentQueries) {
      const subPmts = q.data ?? [];
      const subPaid = subPmts.filter(p => p.isPaid);
      combinedTotalPaid += subPaid.reduce((s, p) => s + p.interestAmount, 0);
      combinedTotalCommission += subPaid.reduce((s, p) => s + p.commissionAmount, 0);
      combinedPaymentsCount += subPmts.length;
      combinedPaidCount += subPaid.length;
    }
    combinedPaymentStats = { combinedTotalPaid, combinedTotalCommission, combinedPaymentsCount, combinedPaidCount };
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5" data-testid="borrower-detail-page">
      {/* Header */}
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
            {overdueCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                <AlertTriangle className="h-3 w-3" />{overdueCount} overdue
              </span>
            )}
          </div>
          <p className="text-slate-500 text-sm truncate">{borrower.address}</p>
        </div>
        {/* Action buttons */}
        <div className="flex gap-2 flex-shrink-0">
          <Button size="sm" variant="outline" onClick={() => printStatement(borrower, payments ?? [])} title="Print Statement">
            <Printer className="h-4 w-4 md:mr-1" />
            <span className="hidden md:inline">Statement</span>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowEdit(true)} data-testid="button-edit-borrower">
            <Edit2 className="h-4 w-4 md:mr-1" />
            <span className="hidden md:inline">Edit</span>
          </Button>
          {borrower.status === "active" && (
            <Button size="sm" variant="outline" onClick={() => setShowCloseLoan(true)} className="text-red-600 border-red-200 hover:bg-red-50" data-testid="button-close-loan">
              <XCircle className="h-4 w-4 md:mr-1" />
              <span className="hidden md:inline">Close Loan</span>
            </Button>
          )}
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
        <Card className={`border-slate-200 ${combinedPaymentStats ? "border-t-2 border-t-violet-400" : ""}`}>
          <CardContent className="p-3 md:p-4 text-center">
            <p className="text-xs text-slate-500 mb-1">
              Total Collected{combinedPaymentStats ? <span className="text-violet-500 ml-1">(all tranches)</span> : null}
            </p>
            <p className="text-base md:text-lg font-bold text-slate-900">
              {formatCurrency(combinedPaymentStats ? combinedPaymentStats.combinedTotalPaid : totalPaid)}
            </p>
            {combinedPaymentStats && !allSubPaymentsLoaded && (
              <p className="text-xs text-slate-400 mt-0.5">loading…</p>
            )}
          </CardContent>
        </Card>
        <Card className={`border-slate-200 ${combinedPaymentStats ? "border-t-2 border-t-violet-400" : ""}`}>
          <CardContent className="p-3 md:p-4 text-center">
            <p className="text-xs text-emerald-600 mb-1">
              Commission Earned{combinedPaymentStats ? <span className="text-violet-500 ml-1">(all tranches)</span> : null}
            </p>
            <p className="text-base md:text-lg font-bold text-emerald-700">
              {formatCurrency(combinedPaymentStats ? combinedPaymentStats.combinedTotalCommission : totalCommission)}
            </p>
          </CardContent>
        </Card>
        <Card className={`border-slate-200 ${combinedPaymentStats ? "border-t-2 border-t-violet-400" : ""}`}>
          <CardContent className="p-3 md:p-4 text-center">
            <p className="text-xs text-slate-500 mb-1">
              Payments{combinedPaymentStats ? <span className="text-violet-500 ml-1">(all tranches)</span> : null}
            </p>
            <p className="text-base md:text-lg font-bold text-slate-900">
              {combinedPaymentStats ? combinedPaymentStats.combinedPaymentsCount : (payments?.length ?? 0)}{" "}
              <span className="text-sm text-emerald-600">
                ({combinedPaymentStats ? combinedPaymentStats.combinedPaidCount : paidPayments.length} paid)
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sub-account breadcrumb — shown when this borrower IS a sub-account */}
      {borrower.parentId != null && (
        <div className="flex items-center gap-2 px-1 -mt-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200">
            <Network className="h-3 w-3" />Sub-account
          </span>
          <Link href={`/borrowers/${borrower.parentId}`}>
            <button className="text-xs text-violet-600 hover:underline flex items-center gap-1">
              View parent loan <ExternalLink className="h-3 w-3" />
            </button>
          </Link>
        </div>
      )}

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

      {/* Sub-accounts section — only for top-level borrowers */}
      {borrower.parentId == null && (
        <Card className="border-slate-200">
          <CardHeader className="pb-3 px-4 md:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-semibold text-slate-900">Sub-accounts</CardTitle>
                {(subAccounts?.length ?? 0) > 0 && (
                  <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-700">
                    {subAccounts!.length}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {(subAccounts?.length ?? 0) > 0 && (
                  <Button size="sm" variant="outline" onClick={() => setShowMergeConfirm(true)} className="text-violet-700 border-violet-200 hover:bg-violet-50">
                    <GitMerge className="h-4 w-4 mr-1" />
                    <span className="hidden sm:inline">Merge All</span>
                    <span className="sm:hidden">Merge</span>
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setShowAddSubAccount(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Tranche
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {!subAccounts || subAccounts.length === 0 ? (
              <div className="px-4 md:px-6 pb-5 text-center">
                <Network className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-400">No sub-accounts yet.</p>
                <p className="text-xs text-slate-400 mt-0.5">Use "Add Tranche" to record an additional loan top-up for this borrower.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[500px]">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-4 md:px-6 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tranche</th>
                      <th className="text-right px-4 md:px-6 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Principal</th>
                      <th className="text-right px-4 md:px-6 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Rate</th>
                      <th className="text-left px-4 md:px-6 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Start Date</th>
                      <th className="px-4 md:px-6 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Status</th>
                      <th className="px-4 md:px-6 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {subAccounts.map(sub => (
                      <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 md:px-6 py-3">
                          <p className="font-medium text-slate-900">{sub.name}</p>
                          {sub.notes && <p className="text-xs text-slate-400 truncate max-w-[180px]">{sub.notes}</p>}
                          {sub.overdueCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                              <AlertTriangle className="h-3 w-3" />{sub.overdueCount} overdue
                            </span>
                          )}
                        </td>
                        <td className="px-4 md:px-6 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                          {formatCurrency(sub.principalAmount)}
                        </td>
                        <td className="px-4 md:px-6 py-3 text-right text-slate-600 whitespace-nowrap hidden sm:table-cell">
                          {sub.interestRate}%
                        </td>
                        <td className="px-4 md:px-6 py-3 text-slate-600 whitespace-nowrap hidden md:table-cell text-sm">
                          {sub.startDate}
                        </td>
                        <td className="px-4 md:px-6 py-3 hidden sm:table-cell">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                            sub.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            sub.status === "defaulted" ? "bg-red-50 text-red-700 border-red-200" :
                            "bg-slate-100 text-slate-600 border-slate-200"
                          }`}>{sub.status}</span>
                        </td>
                        <td className="px-4 md:px-6 py-3">
                          <Link href={`/borrowers/${sub.id}`}>
                            <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-900" title="View tranche detail">
                              <ExternalLink className="h-4 w-4" />
                            </button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Combined totals bar — only when sub-accounts exist */}
      {combinedTotals && borrower && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
          <div className="flex items-center gap-2 mb-3">
            <Network className="h-4 w-4 text-violet-600" />
            <span className="text-sm font-semibold text-violet-800">Combined Totals (all tranches)</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-lg border border-violet-100 px-3 py-2.5">
              <p className="text-xs text-violet-500 mb-1">Total Outstanding</p>
              <p className="text-base font-bold text-violet-900">
                {formatCurrency(currentOutstanding + combinedTotals.subOutstanding)}
              </p>
              <p className="text-xs text-violet-400 mt-0.5">
                {formatCurrency(currentOutstanding)} + {formatCurrency(combinedTotals.subOutstanding)} subs
              </p>
            </div>
            <div className="bg-white rounded-lg border border-violet-100 px-3 py-2.5">
              <p className="text-xs text-violet-500 mb-1">Monthly Interest</p>
              <p className="text-base font-bold text-violet-900">
                {formatCurrency(
                  (currentOutstanding * borrower.interestRate) / 100 + combinedTotals.subMonthlyInterest
                )}
              </p>
              <p className="text-xs text-violet-400 mt-0.5">across all tranches</p>
            </div>
            <div className="bg-white rounded-lg border border-violet-100 px-3 py-2.5">
              <p className="text-xs text-emerald-600 mb-1">Monthly Commission</p>
              <p className="text-base font-bold text-emerald-700">
                {formatCurrency(
                  (currentOutstanding * borrower.commissionRate) / 100 + combinedTotals.subCommission
                )}
              </p>
              <p className="text-xs text-emerald-400 mt-0.5">across all tranches</p>
            </div>
          </div>
        </div>
      )}

      {/* Payment History / Schedule Tabs */}
      <Card className="border-slate-200">
        {/* Tab headers */}
        <div className="border-b border-slate-100 px-4 md:px-6 pt-4 flex items-center justify-between gap-2">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab("history")}
              className={`px-3 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors ${activeTab === "history" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}
            >
              Payment History
            </button>
            <button
              onClick={() => setActiveTab("schedule")}
              className={`px-3 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === "schedule" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}
            >
              <Clock className="h-3.5 w-3.5" />Repayment Schedule
            </button>
          </div>
          {activeTab === "history" && (
            <div className="flex gap-2 pb-2">
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
          )}
        </div>

        {/* Payment History Tab */}
        {activeTab === "history" && (
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
                    {payments.map(p => {
                      const isOverdue = !p.isPaid && (p.year * 12 + (p.month - 1) < now.getFullYear() * 12 + now.getMonth());
                      return (
                        <tr key={p.id} className={`hover:bg-slate-50 ${isOverdue ? "bg-red-50/40" : ""}`} data-testid={`row-payment-${p.id}`}>
                          <td className="px-4 md:px-6 py-3 font-medium text-slate-900 whitespace-nowrap">
                            {MONTHS[p.month - 1]} {p.year}
                            {isOverdue && <span className="ml-1.5 text-red-500 text-xs">overdue</span>}
                          </td>
                          <td className="px-4 md:px-6 py-3 text-right whitespace-nowrap">
                            {p.amountPaid != null ? <span className="text-slate-900 font-medium">{formatCurrency(p.amountPaid)}</span> : <span className="text-slate-400 text-xs">—</span>}
                          </td>
                          <td className="px-4 md:px-6 py-3 text-right text-slate-600 whitespace-nowrap hidden md:table-cell">{formatCurrency(p.interestAmount)}</td>
                          <td className="px-4 md:px-6 py-3 text-right text-emerald-600 font-medium whitespace-nowrap">{formatCurrency(p.commissionAmount)}</td>
                          <td className="px-4 md:px-6 py-3 text-right hidden lg:table-cell">
                            {(p.principalReduction ?? 0) > 0 ? <span className="text-blue-600 font-medium">−{formatCurrency(p.principalReduction!)}</span> : <span className="text-slate-300 text-xs">—</span>}
                          </td>
                          <td className="px-4 md:px-6 py-3">
                            <button
                              onClick={() => togglePaid(p.id, p.isPaid)}
                              className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full transition-colors whitespace-nowrap ${p.isPaid ? "bg-emerald-50 text-emerald-700" : isOverdue ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                              data-testid={`button-toggle-payment-${p.id}`}
                            >
                              {p.isPaid ? <CheckCircle className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                              {p.isPaid ? "Paid" : isOverdue ? "Overdue" : "Pending"}
                            </button>
                          </td>
                          <td className="px-4 md:px-6 py-3">
                            <button onClick={() => handleDeletePayment(p.id)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600" data-testid={`button-delete-payment-${p.id}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        )}

        {/* Repayment Schedule Tab */}
        {activeTab === "schedule" && (
          <CardContent className="p-0">
            {schedule.length === 0 ? (
              <div className="py-10 text-center text-slate-400">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No schedule to show yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[580px]">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">#</th>
                      <th className="text-left px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Period</th>
                      <th className="text-right px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Outstanding</th>
                      <th className="text-right px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Interest Due</th>
                      <th className="text-right px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Commission</th>
                      <th className="text-right px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Principal ↓</th>
                      <th className="px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {schedule.map((row, i) => (
                      <tr key={`${row.year}-${row.month}`} className={`${row.isUpcoming ? "opacity-60" : ""} ${row.isOverdue ? "bg-red-50/40" : ""} hover:bg-slate-50`}>
                        <td className="px-4 md:px-6 py-2.5 text-slate-400 text-xs">{i + 1}</td>
                        <td className="px-4 md:px-6 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                          {MONTHS[row.month - 1]} {row.year}
                          {row.isUpcoming && <span className="ml-1.5 text-xs text-slate-400 font-normal">(upcoming)</span>}
                        </td>
                        <td className="px-4 md:px-6 py-2.5 text-right text-slate-700 whitespace-nowrap">{formatCurrency(row.outstanding)}</td>
                        <td className="px-4 md:px-6 py-2.5 text-right font-medium text-slate-900 whitespace-nowrap">{formatCurrency(row.interestDue)}</td>
                        <td className="px-4 md:px-6 py-2.5 text-right text-emerald-600 whitespace-nowrap hidden md:table-cell">{formatCurrency(row.commissionDue)}</td>
                        <td className="px-4 md:px-6 py-2.5 text-right hidden lg:table-cell">
                          {row.existing && (row.existing.principalReduction ?? 0) > 0 ? (
                            <span className="text-blue-600 font-medium">−{formatCurrency(row.existing.principalReduction!)}</span>
                          ) : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 md:px-6 py-2.5">
                          {row.isUpcoming ? (
                            <span className="text-xs text-slate-400 flex items-center gap-1"><Clock className="h-3 w-3" />Upcoming</span>
                          ) : row.existing?.isPaid ? (
                            <span className="text-xs text-emerald-600 flex items-center gap-1 font-medium"><CheckCircle className="h-3 w-3" />Paid</span>
                          ) : row.isOverdue ? (
                            <span className="text-xs text-red-600 flex items-center gap-1 font-medium"><AlertTriangle className="h-3 w-3" />Overdue</span>
                          ) : (
                            <span className="text-xs text-amber-600 flex items-center gap-1"><Circle className="h-3 w-3" />Pending</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Edit Borrower Dialog ── */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Borrower</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="name" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Full Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="address" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Address</FormLabel>
                    <FormControl><Textarea rows={2} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="interestRate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Interest Rate (%/mo)</FormLabel>
                    <FormControl><Input type="number" step="0.5" {...field} /></FormControl>
                    {editForm.watch("interestRate") > 10 && (
                      <p className="text-xs text-emerald-600">Commission: {(editForm.watch("interestRate") - 10).toFixed(1)}%</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                        <SelectItem value="defaulted">Defaulted</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="tenure" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tenure (months)</FormLabel>
                    <FormControl><Input type="number" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="endDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="notes" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Notes</FormLabel>
                    <FormControl><Textarea rows={2} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
                <Button type="submit" disabled={updateBorrower.isPending} className="bg-slate-900 hover:bg-slate-800">
                  {updateBorrower.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Add Sub-account Dialog ── */}
      <Dialog open={showAddSubAccount} onOpenChange={setShowAddSubAccount}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Loan Tranche</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500 -mt-1">
            A new tranche is an additional top-up loan for <strong>{borrower.name}</strong>. It will be linked to this parent account and tracked separately.
          </p>
          <Form {...subAccountForm}>
            <form onSubmit={subAccountForm.handleSubmit(handleAddSubAccount)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={subAccountForm.control} name="principalAmount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Loan Amount (₹)</FormLabel>
                    <FormControl><Input type="number" placeholder="50000" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={subAccountForm.control} name="interestRate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Interest Rate (%/mo)</FormLabel>
                    <FormControl><Input type="number" step="0.5" placeholder="10" {...field} /></FormControl>
                    {subAccountForm.watch("interestRate") > 10 && (
                      <p className="text-xs text-emerald-600">Commission: {(subAccountForm.watch("interestRate") - 10).toFixed(1)}%</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={subAccountForm.control} name="startDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={subAccountForm.control} name="tenure" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tenure (months)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="12"
                        {...field}
                        value={field.value ?? ""}
                        onChange={e => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={subAccountForm.control} name="notes" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl><Textarea placeholder="Purpose of this top-up, any conditions…" rows={2} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowAddSubAccount(false)}>Cancel</Button>
                <Button type="submit" disabled={createSubAccount.isPending} className="bg-slate-900 hover:bg-slate-800">
                  {createSubAccount.isPending ? "Adding…" : "Add Tranche"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Merge Sub-accounts Confirmation ── */}
      <Dialog open={showMergeConfirm} onOpenChange={setShowMergeConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Merge All Sub-accounts?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              This will consolidate <strong>{subAccounts?.length ?? 0} sub-account{(subAccounts?.length ?? 0) !== 1 ? "s" : ""}</strong> into this loan:
            </p>
            <ul className="text-sm text-slate-600 space-y-1.5 pl-1">
              {subAccounts?.map(s => (
                <li key={s.id} className="flex items-center justify-between gap-2 bg-slate-50 rounded-md px-3 py-1.5 border border-slate-100">
                  <span className="text-slate-700 font-medium truncate">{s.name}</span>
                  <span className="text-slate-900 font-semibold whitespace-nowrap">{formatCurrency(s.principalAmount)}</span>
                </li>
              ))}
            </ul>
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-700 space-y-1">
              <p className="font-semibold">What happens:</p>
              <p>• All outstanding principals are summed and set as this loan's new principal.</p>
              <p>• All sub-account payment records are moved here.</p>
              <p>• Sub-account records are permanently deleted.</p>
              <p>• This loan's interest rate is unchanged.</p>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowMergeConfirm(false)}>Cancel</Button>
              <Button onClick={handleMerge} disabled={mergeSubs.isPending} className="bg-violet-600 hover:bg-violet-700 text-white">
                <GitMerge className="h-4 w-4 mr-1.5" />
                {mergeSubs.isPending ? "Merging…" : "Merge Sub-accounts"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Close Loan Confirmation ── */}
      <Dialog open={showCloseLoan} onOpenChange={setShowCloseLoan}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Close This Loan?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              This will mark the loan for <strong>{borrower.name}</strong> as <strong>closed</strong> and set today as the end date.
              The payment history will be preserved and you can always reopen it by editing the borrower status.
            </p>
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-700">
              {overdueCount > 0 ? `⚠ This borrower has ${overdueCount} overdue payment${overdueCount !== 1 ? "s" : ""}.` : "All payments are up to date."}
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowCloseLoan(false)}>Cancel</Button>
              <Button onClick={handleCloseLoan} disabled={updateBorrower.isPending} className="bg-red-600 hover:bg-red-700 text-white">
                {updateBorrower.isPending ? "Closing..." : "Close Loan"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Single Payment Dialog ── */}
      <Dialog open={showAddPayment} onOpenChange={setShowAddPayment}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="dialog-add-payment">
          <DialogHeader><DialogTitle>Record Monthly Payment</DialogTitle></DialogHeader>
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 text-sm">
            <div className="flex items-center gap-1.5 text-blue-700 font-medium mb-1"><Info className="h-3.5 w-3.5" />Current Outstanding Principal</div>
            <p className="text-blue-900 font-bold text-base">{formatCurrency(currentOutstanding)}</p>
            {currentOutstanding !== borrower.principalAmount && <p className="text-blue-500 text-xs mt-0.5">Original: {formatCurrency(borrower.principalAmount)}</p>}
          </div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleAddPayment)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="month" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Month</FormLabel>
                    <Select value={String(field.value)} onValueChange={v => field.onChange(Number(v))}>
                      <SelectTrigger data-testid="select-payment-month"><SelectValue /></SelectTrigger>
                      <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
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
                    <Input type="number" step="0.01" placeholder={splitPreview ? `Interest due: ₹${splitPreview.fullInterest}` : "Enter amount"} {...field} data-testid="input-amount-paid" />
                  </FormControl>
                  <p className="text-xs text-slate-400">Surplus above interest reduces the outstanding principal.</p>
                  <FormMessage />
                </FormItem>
              )} />

              {(() => {
                if (!splitPreview || !("amountPaid" in splitPreview)) return null;
                const sp = splitPreview as any;
                return (
                  <div className={`p-3 rounded-lg text-sm border ${sp.isPartial ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
                    {sp.isPartial ? (
                      <>
                        <p className="font-medium text-amber-700 mb-2">⚠ Partial payment — {formatCurrency(sp.shortfall)} short</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div><p className="text-amber-600">Interest Portion</p><p className="font-semibold text-amber-900">{formatCurrency(sp.interestPortion)}</p></div>
                          <div><p className="text-amber-600">Principal Reduction</p><p className="font-semibold text-amber-900">—</p></div>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="font-medium text-emerald-700 mb-2">✓ Full payment{sp.principalReduction > 0 ? ` + ₹${sp.principalReduction} reduces principal` : ""}</p>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div><p className="text-emerald-600">Interest</p><p className="font-semibold text-emerald-900">{formatCurrency(sp.interestPortion)}</p></div>
                          <div><p className="text-emerald-600">Principal ↓</p><p className="font-semibold text-emerald-900">{sp.principalReduction > 0 ? formatCurrency(sp.principalReduction) : "—"}</p></div>
                          <div><p className="text-emerald-600">New Outstanding</p><p className="font-semibold text-emerald-900">{formatCurrency(sp.newOutstanding)}</p></div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}

              <FormField control={form.control} name="isPaid" render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl>
                    <input type="checkbox" checked={field.value} onChange={field.onChange} className="h-4 w-4 rounded border-slate-300" data-testid="checkbox-is-paid" />
                  </FormControl>
                  <FormLabel className="!mt-0">Mark as paid now</FormLabel>
                </FormItem>
              )} />

              {form.watch("isPaid") && (
                <FormField control={form.control} name="paidDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Paid Date</FormLabel>
                    <FormControl><Input type="date" {...field} defaultValue={new Date().toISOString().split("T")[0]} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowAddPayment(false)}>Cancel</Button>
                <Button type="submit" disabled={createPayment.isPending} className="bg-slate-900 hover:bg-slate-800" data-testid="button-submit-payment">
                  {createPayment.isPending ? "Recording..." : "Record Payment"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Payment Dialog ── */}
      <Dialog open={showBulkPayment} onOpenChange={setShowBulkPayment}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="dialog-bulk-payment">
          <DialogHeader><DialogTitle>Bulk Record Payments</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500">Record interest-only payments for a date range. Existing months are skipped automatically.</p>
          <Form {...bulkForm}>
            <form onSubmit={bulkForm.handleSubmit(handleBulkPayment)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={bulkForm.control} name="fromMonth" render={({ field }) => (
                  <FormItem>
                    <FormLabel>From Month</FormLabel>
                    <Select value={String(field.value)} onValueChange={v => field.onChange(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={bulkForm.control} name="fromYear" render={({ field }) => (
                  <FormItem><FormLabel>From Year</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={bulkForm.control} name="toMonth" render={({ field }) => (
                  <FormItem>
                    <FormLabel>To Month</FormLabel>
                    <Select value={String(field.value)} onValueChange={v => field.onChange(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={bulkForm.control} name="toYear" render={({ field }) => (
                  <FormItem><FormLabel>To Year</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>
                )} />
              </div>

              {bulkPreview.valid && (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm">
                  {bulkPreview.count > 0 ? (
                    <p className="text-slate-700">Will create <strong>{bulkPreview.count} payment record{bulkPreview.count !== 1 ? "s" : ""}</strong>{bulkPreview.skipped ? ` (${bulkPreview.skipped} month${bulkPreview.skipped !== 1 ? "s" : ""} already exist and will be skipped)` : ""}.</p>
                  ) : (
                    <p className="text-slate-400">No new records to create — all months in this range already exist.</p>
                  )}
                </div>
              )}
              {!bulkPreview.valid && <p className="text-red-500 text-sm">From date must be before or equal to To date.</p>}

              <FormField control={bulkForm.control} name="isPaid" render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl><input type="checkbox" checked={field.value} onChange={field.onChange} className="h-4 w-4 rounded border-slate-300" /></FormControl>
                  <FormLabel className="!mt-0">Mark all as paid</FormLabel>
                </FormItem>
              )} />
              {bulkForm.watch("isPaid") && (
                <FormField control={bulkForm.control} name="paidDate" render={({ field }) => (
                  <FormItem><FormLabel>Paid Date</FormLabel><FormControl><Input type="date" {...field} defaultValue={new Date().toISOString().split("T")[0]} /></FormControl></FormItem>
                )} />
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowBulkPayment(false)}>Cancel</Button>
                <Button type="submit" disabled={bulkLoading || !bulkPreview.valid || bulkPreview.count === 0} className="bg-slate-900 hover:bg-slate-800" data-testid="button-submit-bulk">
                  {bulkLoading ? "Creating..." : `Create ${bulkPreview.count || ""} Record${(bulkPreview.count ?? 0) !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
