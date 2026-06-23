import { useState } from "react";
import { useGetMonthlyStats, useGetYearlyStats, useGetDashboardStats, getGetMonthlyStatsQueryKey, getGetYearlyStatsQueryKey, getGetDashboardStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";
import { Users, TrendingUp, Wallet, AlertCircle } from "lucide-react";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

export default function Analytics() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const monthlyParams = { year: selectedYear };
  const { data: monthlyStats, isLoading: monthlyLoading } = useGetMonthlyStats(monthlyParams, { query: { queryKey: getGetMonthlyStatsQueryKey(monthlyParams) } });
  const { data: yearlyStats, isLoading: yearlyLoading } = useGetYearlyStats(undefined, { query: { queryKey: getGetYearlyStatsQueryKey() } });
  const { data: dashStats, isLoading: dashLoading } = useGetDashboardStats({ query: { queryKey: getGetDashboardStatsQueryKey() } });

  const monthlyData = (monthlyStats ?? []).map(s => ({
    name: MONTH_NAMES[s.month - 1],
    "Base Interest": Number(s.baseInterest.toFixed(2)),
    "Commission": Number(s.commission.toFixed(2)),
    "Total Interest": Number(s.totalInterest.toFixed(2)),
  }));

  const yearlyData = (yearlyStats ?? []).map(s => ({
    name: String(s.year),
    "Base Interest": Number(s.baseInterest.toFixed(2)),
    "Commission": Number(s.commission.toFixed(2)),
    "Total Interest": Number(s.totalInterest.toFixed(2)),
  }));

  const totalMonthlyInterest = (monthlyStats ?? []).reduce((sum, s) => sum + s.totalInterest, 0);
  const totalMonthlyCommission = (monthlyStats ?? []).reduce((sum, s) => sum + s.commission, 0);
  const totalMonthlyBase = (monthlyStats ?? []).reduce((sum, s) => sum + s.baseInterest, 0);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5" data-testid="analytics-page">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="text-slate-500 text-sm mt-0.5">Portfolio overview and interest breakdown</p>
        </div>
        <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
          <SelectTrigger className="w-28" data-testid="select-year">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Portfolio summary — always visible, even before any payments are recorded */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {dashLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
        ) : (
          <>
            <Card className="border-slate-200">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Users className="h-5 w-5 text-slate-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Active Borrowers</p>
                  <p className="text-lg font-bold text-slate-900">{dashStats?.activeBorrowers ?? 0}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Wallet className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Principal Out</p>
                  <p className="text-lg font-bold text-slate-900">{formatCurrency(dashStats?.totalPrincipal ?? 0)}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Total Collected</p>
                  <p className="text-lg font-bold text-emerald-700">{formatCurrency(dashStats?.totalInterestEarned ?? 0)}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Pending</p>
                  <p className="text-lg font-bold text-amber-700">{dashStats?.pendingPaymentsCount ?? 0} payments</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {monthlyLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="border-slate-200">
            <CardContent className="p-4 md:p-5 text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{selectedYear} — Total Interest</p>
              <p className="text-xl md:text-2xl font-bold text-slate-900">{formatCurrency(totalMonthlyInterest)}</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardContent className="p-4 md:p-5 text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{selectedYear} — Base (10%)</p>
              <p className="text-xl md:text-2xl font-bold text-slate-700">{formatCurrency(totalMonthlyBase)}</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200 border-l-4 border-l-emerald-500">
            <CardContent className="p-4 md:p-5 text-center">
              <p className="text-xs text-emerald-600 uppercase tracking-wide mb-1">{selectedYear} — Commission</p>
              <p className="text-xl md:text-2xl font-bold text-emerald-700">{formatCurrency(totalMonthlyCommission)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-slate-200">
        <CardHeader className="pb-3 px-4 md:px-6">
          <CardTitle className="text-base font-semibold text-slate-900">Monthly Breakdown — {selectedYear}</CardTitle>
        </CardHeader>
        <CardContent className="px-2 md:px-6">
          {monthlyLoading ? <Skeleton className="h-56 rounded-lg" /> : monthlyData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-slate-400 text-sm">No data for {selectedYear}</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} width={45} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Base Interest" fill="#64748b" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Commission" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="pb-3 px-4 md:px-6">
          <CardTitle className="text-base font-semibold text-slate-900">Year-over-Year Trend</CardTitle>
        </CardHeader>
        <CardContent className="px-2 md:px-6">
          {yearlyLoading ? <Skeleton className="h-56 rounded-lg" /> : yearlyData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-slate-400 text-sm">No yearly data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={yearlyData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} width={45} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="Total Interest" stroke="#1e293b" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="Base Interest" stroke="#64748b" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="Commission" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {!monthlyLoading && monthlyData.length > 0 && (
        <Card className="border-slate-200">
          <CardHeader className="pb-3 px-4 md:px-6">
            <CardTitle className="text-base font-semibold text-slate-900">Monthly Detail — {selectedYear}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Month</th>
                    <th className="text-right px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                    <th className="text-right px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Base</th>
                    <th className="text-right px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Commission</th>
                    <th className="text-right px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(monthlyStats ?? []).map(s => (
                    <tr key={`${s.year}-${s.month}`} className="hover:bg-slate-50" data-testid={`row-monthly-${s.year}-${s.month}`}>
                      <td className="px-4 md:px-6 py-3 font-medium text-slate-900 whitespace-nowrap">{MONTH_NAMES[s.month - 1]} {s.year}</td>
                      <td className="px-4 md:px-6 py-3 text-right text-slate-900 whitespace-nowrap">{formatCurrency(s.totalInterest)}</td>
                      <td className="px-4 md:px-6 py-3 text-right text-slate-600 whitespace-nowrap hidden sm:table-cell">{formatCurrency(s.baseInterest)}</td>
                      <td className="px-4 md:px-6 py-3 text-right text-emerald-600 font-medium whitespace-nowrap">{formatCurrency(s.commission)}</td>
                      <td className="px-4 md:px-6 py-3 text-right text-emerald-600 hidden sm:table-cell">{s.paidCount}/{s.paymentsCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
