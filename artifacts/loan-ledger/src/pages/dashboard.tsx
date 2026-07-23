import { useGetDashboardStats, useListBorrowers, getListBorrowersQueryKey } from "@workspace/api-client-react";
import { useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { TrendingUp, Users, IndianRupee, AlertCircle, CalendarCheck, Percent, ArrowUpRight } from "lucide-react";

function StatCard({ title, value, sub, icon: Icon, accent = false }: { title: string; value: string; sub?: string; icon: any; accent?: boolean }) {
  return (
    <Card className="relative overflow-hidden border-slate-200">
      <CardContent className="p-4 md:p-6">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1 pr-2">
            <p className="text-xs font-medium text-slate-500 mb-1 truncate">{title}</p>
            <p className={`text-xl md:text-2xl font-bold truncate ${accent ? "text-emerald-600" : "text-slate-900"}`}>{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-1 truncate">{sub}</p>}
          </div>
          <div className={`h-9 w-9 md:h-10 md:w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${accent ? "bg-emerald-50" : "bg-slate-100"}`}>
            <Icon className={`h-4 w-4 md:h-5 md:w-5 ${accent ? "text-emerald-600" : "text-slate-600"}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: borrowers, isLoading: borrowersLoading } = useListBorrowers({ status: "active" }, { query: { queryKey: getListBorrowersQueryKey({ status: "active" }) } });
  const { data: user } = useGetMe();

  const isLoading = statsLoading || borrowersLoading;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6" data-testid="dashboard-page">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">Welcome back{user?.name ? `, ${user.name}` : ""}</p>
        </div>
        <Link href="/borrowers">
          <button className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors whitespace-nowrap" data-testid="button-add-borrower">
            <span className="hidden sm:inline">Add Borrower</span>
            <span className="sm:hidden">Add</span>
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard title="Active Borrowers" value={String(stats?.activeBorrowers ?? 0)} sub={`${stats?.totalBorrowers ?? 0} total`} icon={Users} />
            <StatCard title="Total Principal" value={formatCurrency(stats?.totalPrincipal ?? 0)} sub="Deployed" icon={IndianRupee} />
            <StatCard title="Total Interest" value={formatCurrency(stats?.totalInterestEarned ?? 0)} sub="All time" icon={TrendingUp} accent />
            <StatCard title="Commission" value={formatCurrency(stats?.totalCommissionEarned ?? 0)} sub="Above 10%" icon={Percent} accent />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard title="This Month Interest" value={formatCurrency(stats?.currentMonthInterest ?? 0)} sub="Base earned" icon={CalendarCheck} />
            <StatCard title="This Month Commission" value={formatCurrency(stats?.currentMonthCommission ?? 0)} sub="Earned" icon={Percent} accent />
            <StatCard title="Pending Payments" value={String(stats?.pendingPaymentsCount ?? 0)} sub="Unpaid" icon={AlertCircle} />
            <StatCard title="Closed / Defaulted" value={`${stats?.closedBorrowers ?? 0} / ${stats?.defaultedBorrowers ?? 0}`} sub="Closed & defaulted" icon={Users} />
          </div>

          <Card className="border-slate-200">
            <CardHeader className="pb-3 px-4 md:px-6">
              <CardTitle className="text-base font-semibold text-slate-900">Current Month Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="px-4 md:px-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Total Interest</p>
                  <p className="text-xl md:text-2xl font-bold text-slate-900">{formatCurrency(stats?.currentMonthInterest ?? 0)}</p>
                </div>
                <div className="text-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Base Interest (10%)</p>
                  <p className="text-xl md:text-2xl font-bold text-slate-700">{formatCurrency(stats?.currentMonthBaseInterest ?? 0)}</p>
                </div>
                <div className="text-center p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                  <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide mb-1">Commission (above 10%)</p>
                  <p className="text-xl md:text-2xl font-bold text-emerald-700">{formatCurrency(stats?.currentMonthCommission ?? 0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader className="pb-3 flex-row items-center justify-between px-4 md:px-6">
              <CardTitle className="text-base font-semibold text-slate-900">Active Borrowers</CardTitle>
              <Link href="/borrowers" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">View all</Link>
            </CardHeader>
            <CardContent className="p-0">
              {!borrowers?.data || borrowers.data.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No active borrowers yet</p>
                  <Link href="/borrowers" className="text-emerald-600 text-sm hover:underline mt-2 block">Add your first borrower</Link>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {(borrowers.data ?? []).slice(0, 5).map(b => (
                    <Link key={b.id} href={`/borrowers/${b.id}`}>
                      <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 hover:bg-slate-50 transition-colors cursor-pointer" data-testid={`row-borrower-${b.id}`}>
                        <div className="min-w-0 flex-1 pr-3">
                          <p className="font-medium text-slate-900 text-sm truncate">{b.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">{b.address}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-semibold text-slate-900 text-sm">{formatCurrency(b.principalAmount)}</p>
                          <p className="text-xs text-emerald-600 mt-0.5">{b.interestRate}%/mo</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
