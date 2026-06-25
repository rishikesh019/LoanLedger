import { useGetCurrentMonthCollections, useUpdatePayment, getListPaymentsQueryKey, getGetBorrowerQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CheckCircle, Circle, AlertTriangle, CalendarCheck, Phone, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function Collections() {
  const now = new Date();
  const currentMonthLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
  const queryClient = useQueryClient();
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const { data: items, isLoading, refetch } = useGetCurrentMonthCollections();
  const updatePayment = useUpdatePayment();

  const paid = (items ?? []).filter(i => i.isPaid);
  const pending = (items ?? []).filter(i => i.hasPaymentRecord && !i.isPaid);
  const notRecorded = (items ?? []).filter(i => !i.hasPaymentRecord);

  const totalDue = (items ?? []).reduce((s, i) => s + i.interestDue, 0);
  const totalCollected = paid.reduce((s, i) => s + (i.amountPaid ?? i.interestDue), 0);

  const handleMarkPaid = async (item: typeof items extends (infer T)[] | undefined ? T : never) => {
    if (!item) return;
    if (!item.hasPaymentRecord || !item.paymentId) {
      // No payment record — create one
      setTogglingId(item.borrowerId);
      try {
        const token = await getToken();
        const res = await fetch(`/api/borrowers/${item.borrowerId}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ month: now.getMonth() + 1, year: now.getFullYear(), isPaid: true, paidDate: new Date().toISOString().split("T")[0] }),
        });
        if (!res.ok) throw new Error("Failed to create payment");
        toast({ title: "Marked as paid" });
        refetch();
      } catch {
        toast({ title: "Error", variant: "destructive" });
      } finally {
        setTogglingId(null);
      }
      return;
    }

    // Toggle existing payment
    setTogglingId(item.borrowerId);
    updatePayment.mutate(
      { borrowerId: item.borrowerId, paymentId: item.paymentId, data: { isPaid: !item.isPaid, paidDate: !item.isPaid ? new Date().toISOString().split("T")[0] : undefined } },
      {
        onSuccess: () => {
          toast({ title: item.isPaid ? "Marked as pending" : "Marked as paid" });
          queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey(item.borrowerId) });
          queryClient.invalidateQueries({ queryKey: getGetBorrowerQueryKey(item.borrowerId) });
          refetch();
          setTogglingId(null);
        },
        onError: () => { toast({ title: "Error", variant: "destructive" }); setTogglingId(null); },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const BorrowerRow = ({ item }: { item: NonNullable<typeof items>[number] }) => {
    const isToggling = togglingId === item.borrowerId;
    return (
      <tr className="hover:bg-slate-50 transition-colors" key={item.borrowerId}>
        <td className="px-4 md:px-6 py-3">
          <div className="flex items-center gap-2">
            <div>
              <p className="font-medium text-slate-900">{item.borrowerName}</p>
              {item.phone && <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><Phone className="h-3 w-3" />{item.phone}</p>}
            </div>
            {item.overdueCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">
                <AlertTriangle className="h-3 w-3" />{item.overdueCount} overdue
              </span>
            )}
          </div>
        </td>
        <td className="px-4 md:px-6 py-3 text-right text-slate-700 whitespace-nowrap hidden md:table-cell">{formatCurrency(item.outstandingPrincipal)}</td>
        <td className="px-4 md:px-6 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">{formatCurrency(item.interestDue)}</td>
        <td className="px-4 md:px-6 py-3 text-right text-slate-600 whitespace-nowrap hidden sm:table-cell">
          {item.amountPaid != null ? formatCurrency(item.amountPaid) : <span className="text-slate-300">—</span>}
        </td>
        <td className="px-4 md:px-6 py-3">
          <button
            onClick={() => handleMarkPaid(item)}
            disabled={isToggling}
            className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full transition-colors whitespace-nowrap ${
              item.isPaid ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : item.hasPaymentRecord ? "bg-slate-100 text-slate-500 hover:bg-slate-200"
              : "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
            }`}
          >
            {item.isPaid ? <CheckCircle className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
            {item.isPaid ? "Paid" : item.hasPaymentRecord ? "Pending" : "Not Recorded"}
          </button>
        </td>
        <td className="px-4 md:px-6 py-3">
          <Link href={`/borrowers/${item.borrowerId}`}>
            <button className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700">
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </Link>
        </td>
      </tr>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">Monthly Collections</h1>
        <p className="text-slate-500 text-sm mt-0.5 flex items-center gap-1.5">
          <CalendarCheck className="h-4 w-4" />{currentMonthLabel} — {items?.length ?? 0} active borrowers
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-3 md:p-4">
            <p className="text-xs text-emerald-600 mb-1">Collected</p>
            <p className="text-lg font-bold text-emerald-700">{formatCurrency(totalCollected)}</p>
            <p className="text-xs text-emerald-500">{paid.length} borrower{paid.length !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-3 md:p-4">
            <p className="text-xs text-amber-600 mb-1">Pending</p>
            <p className="text-lg font-bold text-amber-700">{pending.length + notRecorded.length}</p>
            <p className="text-xs text-amber-500">not yet paid</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-3 md:p-4">
            <p className="text-xs text-slate-500 mb-1">Total Due</p>
            <p className="text-lg font-bold text-slate-900">{formatCurrency(totalDue)}</p>
            <p className="text-xs text-slate-400">this month</p>
          </CardContent>
        </Card>
        <Card className="border-red-100 bg-red-50">
          <CardContent className="p-3 md:p-4">
            <p className="text-xs text-red-600 mb-1">Overdue Borrowers</p>
            <p className="text-lg font-bold text-red-700">{(items ?? []).filter(i => i.overdueCount > 0).length}</p>
            <p className="text-xs text-red-400">have past-due payments</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending / Not recorded section */}
      {(pending.length > 0 || notRecorded.length > 0) && (
        <Card className="border-amber-200">
          <CardHeader className="pb-3 px-4 md:px-6">
            <CardTitle className="text-base font-semibold text-amber-700">⚠ Needs Collection ({pending.length + notRecorded.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="border-b border-amber-100 bg-amber-50">
                    <th className="text-left px-4 md:px-6 py-2.5 text-xs font-semibold text-amber-600 uppercase tracking-wide">Borrower</th>
                    <th className="text-right px-4 md:px-6 py-2.5 text-xs font-semibold text-amber-600 uppercase tracking-wide hidden md:table-cell">Outstanding</th>
                    <th className="text-right px-4 md:px-6 py-2.5 text-xs font-semibold text-amber-600 uppercase tracking-wide">Interest Due</th>
                    <th className="text-right px-4 md:px-6 py-2.5 text-xs font-semibold text-amber-600 uppercase tracking-wide hidden sm:table-cell">Paid</th>
                    <th className="px-4 md:px-6 py-2.5 text-xs font-semibold text-amber-600 uppercase tracking-wide">Status</th>
                    <th className="px-4 md:px-6 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-50">
                  {[...pending, ...notRecorded].map(item => <BorrowerRow key={item.borrowerId} item={item} />)}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paid section */}
      {paid.length > 0 && (
        <Card className="border-slate-200">
          <CardHeader className="pb-3 px-4 md:px-6">
            <CardTitle className="text-base font-semibold text-emerald-700">✓ Paid ({paid.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 md:px-6 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Borrower</th>
                    <th className="text-right px-4 md:px-6 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Outstanding</th>
                    <th className="text-right px-4 md:px-6 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Interest Due</th>
                    <th className="text-right px-4 md:px-6 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Paid</th>
                    <th className="px-4 md:px-6 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 md:px-6 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paid.map(item => <BorrowerRow key={item.borrowerId} item={item} />)}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {items?.length === 0 && (
        <Card className="border-slate-200">
          <CardContent className="py-16 text-center text-slate-400">
            <CalendarCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No active borrowers yet.</p>
            <Link href="/borrowers" className="text-emerald-600 text-sm mt-2 block hover:underline">Go add a borrower</Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
