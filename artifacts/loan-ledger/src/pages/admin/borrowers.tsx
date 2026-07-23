import { useState } from "react";
import { useListBorrowers, useGetUserStats, getListBorrowersQueryKey, getGetUserStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { Search, Eye, IndianRupee } from "lucide-react";

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    closed: "bg-slate-100 text-slate-600 border-slate-200",
    defaulted: "bg-red-50 text-red-700 border-red-200",
  };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${map[status] ?? "bg-slate-100 text-slate-600"}`}>{status}</span>;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

export default function AdminBorrowers() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [userFilter, setUserFilter] = useState<string | undefined>(undefined);

  const { data: userStats } = useGetUserStats({ query: { queryKey: getGetUserStatsQueryKey() } });

  const borrowerParams = { search: search || undefined, status: statusFilter as any };
  const { data: borrowers, isLoading: borrowersLoading } = useListBorrowers(borrowerParams, {
    query: { queryKey: getListBorrowersQueryKey(borrowerParams) },
  });

  const filteredBorrowers = (borrowers?.data ?? []).filter(b =>
    !userFilter || String(b.userId) === userFilter
  );

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5" data-testid="admin-borrowers-page">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">All Borrowers</h1>
        <p className="text-slate-500 text-sm mt-0.5">Admin view — all borrowers across all users</p>
      </div>

      <div className="flex flex-wrap gap-2 md:gap-3">
        <div className="relative flex-1 min-w-0" style={{ minWidth: "150px" }}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-borrowers"
          />
        </div>
        <Select value={statusFilter ?? "all"} onValueChange={v => setStatusFilter(v === "all" ? undefined : v)}>
          <SelectTrigger className="w-28 md:w-36" data-testid="select-status-filter">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="defaulted">Defaulted</SelectItem>
          </SelectContent>
        </Select>
        <Select value={userFilter ?? "all"} onValueChange={v => setUserFilter(v === "all" ? undefined : v)}>
          <SelectTrigger className="w-32 md:w-44" data-testid="select-user-filter">
            <SelectValue placeholder="All Users" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Users</SelectItem>
            {(userStats ?? []).map(u => (
              <SelectItem key={u.userId} value={String(u.userId)}>{u.userName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="border-slate-200">
        {borrowersLoading ? (
          <CardContent className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </CardContent>
        ) : filteredBorrowers.length === 0 ? (
          <CardContent className="py-16 text-center">
            <IndianRupee className="h-12 w-12 mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500">No borrowers found</p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Borrower</th>
                  <th className="text-left px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Managed By</th>
                  <th className="text-right px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Principal</th>
                  <th className="text-right px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Rate</th>
                  <th className="text-right px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Monthly</th>
                  <th className="text-right px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Commission</th>
                  <th className="px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Status</th>
                  <th className="px-4 md:px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBorrowers.map(b => {
                  const monthly = (b.principalAmount * b.interestRate) / 100;
                  const commission = (b.principalAmount * b.commissionRate) / 100;
                  return (
                    <tr key={b.id} className="hover:bg-slate-50" data-testid={`row-borrower-${b.id}`}>
                      <td className="px-4 md:px-6 py-3 md:py-4">
                        <p className="font-medium text-slate-900">{b.name}</p>
                        <p className="text-xs text-slate-400 truncate hidden sm:block">{b.address}</p>
                        <div className="sm:hidden mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-slate-400">{b.userName ?? `User #${b.userId}`}</span>
                          {statusBadge(b.status)}
                        </div>
                      </td>
                      <td className="px-4 md:px-6 py-3 md:py-4 hidden sm:table-cell">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">
                          {b.userName ?? `User #${b.userId}`}
                        </span>
                      </td>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-right font-semibold text-slate-900 whitespace-nowrap">{formatCurrency(b.principalAmount)}</td>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-right text-slate-700 whitespace-nowrap hidden md:table-cell">{b.interestRate}%</td>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-right text-slate-700 whitespace-nowrap">{formatCurrency(monthly)}</td>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-right text-emerald-600 font-medium whitespace-nowrap hidden md:table-cell">{formatCurrency(commission)}</td>
                      <td className="px-4 md:px-6 py-3 md:py-4 hidden sm:table-cell">{statusBadge(b.status)}</td>
                      <td className="px-4 md:px-6 py-3 md:py-4">
                        <Link href={`/borrowers/${b.id}`}>
                          <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-900" data-testid={`button-view-${b.id}`}>
                            <Eye className="h-4 w-4" />
                          </button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
