import { useGetAdminDashboard, getGetAdminDashboardQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { Users, IndianRupee, TrendingUp, Percent } from "lucide-react";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COLORS = ["#1e293b", "#10b981", "#64748b", "#f59e0b", "#3b82f6"];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

function StatCard({ title, value, sub, icon: Icon, accent = false }: any) {
  return (
    <Card className="border-slate-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">{title}</p>
            <p className={`text-2xl font-bold ${accent ? "text-emerald-600" : "text-slate-900"}`}>{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
          </div>
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${accent ? "bg-emerald-50" : "bg-slate-100"}`}>
            <Icon className={`h-5 w-5 ${accent ? "text-emerald-600" : "text-slate-600"}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const { data, isLoading } = useGetAdminDashboard({ query: { queryKey: getGetAdminDashboardQueryKey() } });

  const monthlyTrend = (data?.monthlyTrend ?? []).map(s => ({
    name: MONTH_NAMES[s.month - 1],
    "Base Interest": Number(s.baseInterest.toFixed(0)),
    "Commission": Number(s.commission.toFixed(0)),
  }));

  const topPerformers = (data?.topPerformers ?? []).slice(0, 5).map(u => ({
    name: u.userName.split(" ")[0],
    "Total Interest": Number(u.totalInterest.toFixed(0)),
    "Commission": Number(u.totalCommission.toFixed(0)),
  }));

  const pieData = [
    { name: "Base Interest", value: data?.totalBaseInterestEarned ?? 0 },
    { name: "Commission", value: data?.totalCommissionEarned ?? 0 },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="admin-dashboard-page">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">System-wide overview</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Total Users" value={data?.totalUsers ?? 0} sub={`${data?.activeUsers ?? 0} active`} icon={Users} />
            <StatCard title="Total Borrowers" value={data?.totalBorrowers ?? 0} sub={`${data?.activeBorrowers ?? 0} active`} icon={Users} />
            <StatCard title="Principal Deployed" value={formatCurrency(data?.totalPrincipalDeployed ?? 0)} icon={IndianRupee} />
            <StatCard title="Total Interest" value={formatCurrency(data?.totalInterestEarned ?? 0)} sub="All time" icon={TrendingUp} accent />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
            <StatCard title="Base Interest Earned" value={formatCurrency(data?.totalBaseInterestEarned ?? 0)} sub="At 10% base rate" icon={IndianRupee} />
            <StatCard title="Total Commission" value={formatCurrency(data?.totalCommissionEarned ?? 0)} sub="Above 10% rate" icon={Percent} accent />
          </div>

          {/* Monthly Trend */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-900">Monthly Revenue Trend (Last 12 Months)</CardTitle>
            </CardHeader>
            <CardContent>
              {monthlyTrend.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-slate-400 text-sm">No payment data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={monthlyTrend} margin={{ top: 5, right: 10, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#94a3b8" }} />
                    <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="Base Interest" stroke="#64748b" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="Commission" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Performers */}
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-slate-900">Top Performers</CardTitle>
              </CardHeader>
              <CardContent>
                {topPerformers.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No data yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={topPerformers} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#475569" }} width={60} />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Total Interest" fill="#1e293b" radius={[0, 3, 3, 0]} />
                      <Bar dataKey="Commission" fill="#10b981" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Revenue Split Pie */}
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-slate-900">Revenue Split</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                {(data?.totalInterestEarned ?? 0) === 0 ? (
                  <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No earnings yet</div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                          {pieData.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="grid grid-cols-2 gap-4 w-full mt-2">
                      {pieData.map((d, idx) => (
                        <div key={d.name} className="text-center">
                          <div className="flex items-center justify-center gap-1.5 mb-1">
                            <span className="h-2.5 w-2.5 rounded-full inline-block" style={{ backgroundColor: COLORS[idx] }} />
                            <span className="text-xs text-slate-500">{d.name}</span>
                          </div>
                          <p className="text-sm font-semibold text-slate-900">{formatCurrency(d.value)}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top Performers Table */}
          {(data?.topPerformers ?? []).length > 0 && (
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-slate-900">User Performance Summary</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">User</th>
                        <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Borrowers</th>
                        <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Principal</th>
                        <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Interest</th>
                        <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Commission</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(data?.topPerformers ?? []).map(u => (
                        <tr key={u.userId} className="hover:bg-slate-50" data-testid={`row-performer-${u.userId}`}>
                          <td className="px-6 py-3">
                            <p className="font-medium text-slate-900">{u.userName}</p>
                            <p className="text-xs text-slate-400">{u.userEmail}</p>
                          </td>
                          <td className="px-6 py-3 text-right text-slate-700">{u.totalBorrowers} <span className="text-xs text-emerald-600">({u.activeBorrowers} active)</span></td>
                          <td className="px-6 py-3 text-right font-medium text-slate-900">{formatCurrency(u.totalPrincipal)}</td>
                          <td className="px-6 py-3 text-right text-slate-700">{formatCurrency(u.totalInterest)}</td>
                          <td className="px-6 py-3 text-right text-emerald-600 font-medium">{formatCurrency(u.totalCommission)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
