import { useGetFundAnalytics } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { IndianRupee, TrendingDown, TrendingUp, AlertTriangle, Wallet } from "lucide-react";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const fmtShort = (n: number) => {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}K`;
  return `₹${n}`;
};

const PIE_COLORS = ["#059669", "#2563eb", "#7c3aed", "#d97706", "#dc2626", "#0891b2"];

// Custom tooltip for bar chart
function MonthTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow text-sm">
      <p className="font-semibold text-slate-900 mb-1">{label}</p>
      <p className="text-emerald-700">{fmt(payload[0]?.value ?? 0)}</p>
      <p className="text-slate-400 text-xs">{payload[0]?.payload?.count} transfer{payload[0]?.payload?.count !== 1 ? "s" : ""}</p>
    </div>
  );
}

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow text-sm">
      <p className="font-semibold text-slate-900">{d.label}</p>
      <p className="text-emerald-700">{fmt(d.amount)}</p>
      <p className="text-slate-400 text-xs">{d.count} transfer{d.count !== 1 ? "s" : ""}</p>
    </div>
  );
}

export default function AdminFundAnalytics() {
  const { data, isLoading } = useGetFundAnalytics();

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  const {
    totalFunded, totalDisbursed, totalAvailable, atRisk,
    utilizationRate, monthlyInflows, paymentMethodBreakdown,
  } = data;

  const utilizationColor =
    utilizationRate >= 90 ? "bg-red-500" :
    utilizationRate >= 70 ? "bg-amber-500" :
    "bg-emerald-500";

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6" data-testid="fund-analytics-page">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">Fund Analytics</h1>
        <p className="text-slate-500 text-sm mt-0.5">Capital deployment overview — admin only</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <IndianRupee className="h-4 w-4 text-emerald-700" />
              </div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total Funded</p>
            </div>
            <p className="text-xl font-bold text-slate-900">{fmt(totalFunded)}</p>
            <p className="text-xs text-slate-400 mt-0.5">All transfers ever</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="h-4 w-4 text-blue-700" />
              </div>
              <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">Disbursed</p>
            </div>
            <p className="text-xl font-bold text-blue-700">{fmt(totalDisbursed)}</p>
            <p className="text-xs text-blue-400 mt-0.5">Active loans principal</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Wallet className="h-4 w-4 text-emerald-700" />
              </div>
              <p className="text-xs text-emerald-600 font-medium uppercase tracking-wide">Available</p>
            </div>
            <p className="text-xl font-bold text-emerald-700">{fmt(totalAvailable)}</p>
            <p className="text-xs text-emerald-400 mt-0.5">Idle capital</p>
          </CardContent>
        </Card>

        <Card className={`border-slate-200 ${atRisk > 0 ? "border-l-4 border-l-red-500" : ""}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${atRisk > 0 ? "bg-red-100" : "bg-slate-100"}`}>
                <AlertTriangle className={`h-4 w-4 ${atRisk > 0 ? "text-red-600" : "text-slate-400"}`} />
              </div>
              <p className={`text-xs font-medium uppercase tracking-wide ${atRisk > 0 ? "text-red-600" : "text-slate-500"}`}>At Risk</p>
            </div>
            <p className={`text-xl font-bold ${atRisk > 0 ? "text-red-700" : "text-slate-400"}`}>{fmt(atRisk)}</p>
            <p className="text-xs text-slate-400 mt-0.5">Overdue borrowers</p>
          </CardContent>
        </Card>
      </div>

      {/* Utilization bar */}
      <Card className="border-slate-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-slate-400" />
              <p className="text-sm font-semibold text-slate-700">Capital Utilization</p>
            </div>
            <span className={`text-sm font-bold ${utilizationRate >= 90 ? "text-red-600" : utilizationRate >= 70 ? "text-amber-600" : "text-emerald-700"}`}>
              {utilizationRate.toFixed(1)}%
            </span>
          </div>
          <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${utilizationColor}`}
              style={{ width: `${Math.min(utilizationRate, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-1.5">
            <span>{fmt(totalDisbursed)} deployed</span>
            <span>{fmt(totalAvailable)} idle</span>
          </div>
        </CardContent>
      </Card>

      {/* Monthly inflows chart */}
      <Card className="border-slate-200">
        <CardHeader className="pb-2 px-4 md:px-6">
          <CardTitle className="text-base font-semibold text-slate-900">Monthly Fund Inflows</CardTitle>
          <p className="text-xs text-slate-400">Last 12 months of fund transfers</p>
        </CardHeader>
        <CardContent className="px-2 md:px-4 pb-4">
          {monthlyInflows.length === 0 ? (
            <div className="h-56 flex items-center justify-center">
              <p className="text-slate-400 text-sm">No fund transfers recorded yet</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthlyInflows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={fmtShort}
                  width={55}
                />
                <Tooltip content={<MonthTooltip />} cursor={{ fill: "#f1f5f9" }} />
                <Bar dataKey="amount" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Payment method breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-slate-200">
          <CardHeader className="pb-2 px-4 md:px-6">
            <CardTitle className="text-base font-semibold text-slate-900">By Payment Method</CardTitle>
            <p className="text-xs text-slate-400">Distribution of fund transfers</p>
          </CardHeader>
          <CardContent className="pb-4">
            {paymentMethodBreakdown.length === 0 ? (
              <div className="h-48 flex items-center justify-center">
                <p className="text-slate-400 text-sm">No data</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={paymentMethodBreakdown}
                    dataKey="amount"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {paymentMethodBreakdown.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                  <Legend
                    formatter={(value) => <span className="text-xs text-slate-600">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="pb-2 px-4 md:px-6">
            <CardTitle className="text-base font-semibold text-slate-900">Method Breakdown</CardTitle>
            <p className="text-xs text-slate-400">Amount and count per method</p>
          </CardHeader>
          <CardContent className="pb-4 px-4 md:px-6">
            {paymentMethodBreakdown.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-8">No data</p>
            ) : (
              <div className="space-y-3 mt-1">
                {paymentMethodBreakdown.map((m, i) => {
                  const pct = totalFunded > 0 ? (m.amount / totalFunded) * 100 : 0;
                  return (
                    <div key={m.method}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                            style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                          />
                          <span className="text-slate-700 font-medium">{m.label}</span>
                          <span className="text-slate-400 text-xs">({m.count})</span>
                        </div>
                        <span className="font-semibold text-slate-900">{fmt(m.amount)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
