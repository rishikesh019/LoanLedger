import { useGetCurrentMonthCollections, useUpdatePayment, getListPaymentsQueryKey, getGetBorrowerQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, Circle, AlertTriangle, CalendarCheck, Phone, ExternalLink, Calendar, ChevronLeft, ChevronRight, XCircle, PlusCircle } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function Collections() {
  const now = new Date();
  const queryClient = useQueryClient();
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));

  const selectedYear = selectedDate.getFullYear();
  const selectedMonth = selectedDate.getMonth() + 1;
  const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1;
  const currentMonthLabel = `${MONTH_NAMES[selectedDate.getMonth()]} ${selectedYear}`;
  const { data: items, isLoading, refetch } = useGetCurrentMonthCollections({
    year: selectedYear,
    month: selectedMonth,
  });
  const updatePayment = useUpdatePayment();

  const activeItems = (items ?? []).filter(i => !i.isClosed);
  const closedItems = (items ?? []).filter(i => i.isClosed);
  const paid = activeItems.filter(i => i.isPaid);
  const missed = activeItems.filter(i => i.isMissed);
  const notRecorded = activeItems.filter(i => !i.hasPaymentRecord || (!i.isPaid && !i.isMissed));

  const totalDue = activeItems.reduce((s, i) => s + i.interestDue, 0);
  const totalCollected = paid.reduce((s, i) => s + (i.amountPaid ?? i.interestDue), 0);
  const totalCapitalized = missed.reduce((s, i) => s + i.capitalizedAmount, 0);
  const totalClosedAmount = closedItems.reduce((s, i) => s + i.outstandingPrincipal, 0);

  const refreshPaymentData = (borrowerId: number) => {
    queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey(borrowerId) });
    queryClient.invalidateQueries({ queryKey: getGetBorrowerQueryKey(borrowerId) });
    refetch();
  };

  const handleStatusChange = async (
    item: typeof items extends (infer T)[] | undefined ? T : never,
    status: "paid" | "missed" | "not_recorded",
  ) => {
    if (!item) return;
    setTogglingId(item.borrowerId);
    try {
      const token = await getToken();

      if (status === "not_recorded") {
        if (item.paymentId) {
          const res = await fetch(`/api/borrowers/${item.borrowerId}/payments/${item.paymentId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error("Failed to remove payment record");
        }
        toast({ title: "Marked as not recorded", description: "Any missed-EMI balance increase was removed." });
        refreshPaymentData(item.borrowerId);
        return;
      }

      const payload = {
        isPaid: status === "paid",
        isMissed: status === "missed",
        paidDate: status === "paid" ? new Date().toISOString().split("T")[0] : undefined,
      };

      if (!item.hasPaymentRecord || !item.paymentId) {
        const token = await getToken();
        const res = await fetch(`/api/borrowers/${item.borrowerId}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ month: selectedMonth, year: selectedYear, ...payload }),
        });
        if (!res.ok) throw new Error(`Failed to mark EMI as ${status}`);
      } else {
        await updatePayment.mutateAsync({
          borrowerId: item.borrowerId,
          paymentId: item.paymentId,
          data: payload,
        });
      }

      toast({
        title: status === "paid" ? "Marked as paid" : "Marked as missed",
        description: status === "missed"
          ? "The full EMI was added to the outstanding principal."
          : "The selected month has been updated.",
      });
      refreshPaymentData(item.borrowerId);
    } catch (error) {
      toast({
        title: "Unable to update EMI status",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setTogglingId(null);
    }
  };

  const changeMonth = (offset: number) => {
    setSelectedDate(current => new Date(current.getFullYear(), current.getMonth() + offset, 1));
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
              {item.startDate && <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><Calendar className="h-3 w-3" />Loan from {formatDate(item.startDate)}</p>}
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
          <Select
            value={item.isPaid ? "paid" : item.isMissed ? "missed" : "not_recorded"}
            onValueChange={(value) => handleStatusChange(item, value as "paid" | "missed" | "not_recorded")}
            disabled={isToggling}
          >
            <SelectTrigger
              className={`h-8 w-[132px] text-xs font-medium ${
                item.isPaid ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : item.isMissed ? "border-red-200 bg-red-50 text-red-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
              data-testid={`select-collection-status-${item.borrowerId}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="paid"><span className="flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-emerald-600" />Paid</span></SelectItem>
              <SelectItem value="missed"><span className="flex items-center gap-1.5"><XCircle className="h-3.5 w-3.5 text-red-600" />Missed</span></SelectItem>
              <SelectItem value="not_recorded"><span className="flex items-center gap-1.5"><Circle className="h-3.5 w-3.5 text-amber-600" />Not recorded</span></SelectItem>
            </SelectContent>
          </Select>
        </td>
        <td className="px-4 md:px-6 py-3">
          {item.isMissed ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 whitespace-nowrap">
              <CheckCircle className="h-3.5 w-3.5" />
              {formatCurrency(item.capitalizedAmount)} added
            </span>
          ) : !item.isPaid ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => handleStatusChange(item, "missed")}
              disabled={isToggling}
              className="h-8 border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 whitespace-nowrap"
              data-testid={`button-add-emi-outstanding-${item.borrowerId}`}
            >
              <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
              Add {formatCurrency(item.emiAmount)} EMI
            </Button>
          ) : (
            <span className="text-xs text-slate-300">—</span>
          )}
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
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white shadow-sm">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => changeMonth(-1)}
              className="h-8 w-8 rounded-r-none text-slate-500 hover:text-slate-900"
              aria-label="View previous month"
              data-testid="button-previous-collection-month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex min-w-[142px] items-center justify-center gap-1.5 px-2 text-sm font-medium text-slate-700">
              <CalendarCheck className="h-4 w-4 text-emerald-600" />
              {currentMonthLabel}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => changeMonth(1)}
              disabled={isCurrentMonth}
              className="h-8 w-8 rounded-l-none text-slate-500 hover:text-slate-900 disabled:opacity-40"
              aria-label="View next month"
              data-testid="button-next-collection-month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {!isCurrentMonth && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedDate(new Date(now.getFullYear(), now.getMonth(), 1))}
              className="h-8 text-xs"
              data-testid="button-current-collection-month"
            >
              Current month
            </Button>
          )}
          <span className="text-slate-500 text-sm">{activeItems.length} active borrowers</span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-3 md:p-4">
            <p className="text-xs text-emerald-600 mb-1">Collected</p>
            <p className="text-lg font-bold text-emerald-700">{formatCurrency(totalCollected)}</p>
            <p className="text-xs text-emerald-500">{paid.length} borrower{paid.length !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-3 md:p-4">
            <p className="text-xs text-red-600 mb-1">Missed EMI</p>
            <p className="text-lg font-bold text-red-700">{formatCurrency(totalCapitalized)}</p>
            <p className="text-xs text-red-500">{missed.length} added to principal</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-3 md:p-4">
            <p className="text-xs text-slate-500 mb-1">Not Recorded</p>
            <p className="text-lg font-bold text-slate-900">{notRecorded.length}</p>
            <p className="text-xs text-slate-400">needs manager review</p>
          </CardContent>
        </Card>
        <Card className="border-red-100 bg-red-50">
          <CardContent className="p-3 md:p-4">
            <p className="text-xs text-red-600 mb-1">Total Due</p>
            <p className="text-lg font-bold text-red-700">{formatCurrency(totalDue)}</p>
            <p className="text-xs text-red-400">selected month interest</p>
          </CardContent>
        </Card>
        <Card className="border-slate-300 bg-slate-100">
          <CardContent className="p-3 md:p-4">
            <p className="text-xs text-slate-600 mb-1">Closed Amount</p>
            <p className="text-lg font-bold text-slate-800">{formatCurrency(totalClosedAmount)}</p>
            <p className="text-xs text-slate-500">{closedItems.length} closed loan{closedItems.length !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
      </div>

      {/* Missed / not recorded section */}
      {(missed.length > 0 || notRecorded.length > 0) && (
        <Card className="border-amber-200">
          <CardHeader className="pb-3 px-4 md:px-6">
            <CardTitle className="text-base font-semibold text-amber-700">⚠ Needs Review ({missed.length + notRecorded.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="border-b border-amber-100 bg-amber-50">
                    <th className="text-left px-4 md:px-6 py-2.5 text-xs font-semibold text-amber-600 uppercase tracking-wide">Borrower</th>
                    <th className="text-right px-4 md:px-6 py-2.5 text-xs font-semibold text-amber-600 uppercase tracking-wide hidden md:table-cell">Outstanding</th>
                    <th className="text-right px-4 md:px-6 py-2.5 text-xs font-semibold text-amber-600 uppercase tracking-wide">Interest Due</th>
                    <th className="text-right px-4 md:px-6 py-2.5 text-xs font-semibold text-amber-600 uppercase tracking-wide hidden sm:table-cell">Paid</th>
                    <th className="px-4 md:px-6 py-2.5 text-xs font-semibold text-amber-600 uppercase tracking-wide">Status</th>
                    <th className="px-4 md:px-6 py-2.5 text-xs font-semibold text-amber-600 uppercase tracking-wide">Outstanding Action</th>
                    <th className="px-4 md:px-6 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-50">
                  {[...missed, ...notRecorded].map(item => <BorrowerRow key={item.borrowerId} item={item} />)}
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
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 md:px-6 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Borrower</th>
                    <th className="text-right px-4 md:px-6 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Outstanding</th>
                    <th className="text-right px-4 md:px-6 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Interest Due</th>
                    <th className="text-right px-4 md:px-6 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Paid</th>
                    <th className="px-4 md:px-6 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 md:px-6 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Outstanding Action</th>
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

      {activeItems.length === 0 && (
        <Card className="border-slate-200">
          <CardContent className="py-16 text-center text-slate-400">
            <CalendarCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No borrowers had an active loan during this month.</p>
            <Link href="/borrowers" className="text-emerald-600 text-sm mt-2 block hover:underline">Go add a borrower</Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
