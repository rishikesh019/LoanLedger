import { useState, useEffect, useCallback } from "react";
import { useListBorrowers, useCreateBorrower, useDeleteBorrower, useGetMe, getListBorrowersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { Search, Plus, IndianRupee, Trash2, Eye, AlertTriangle, ChevronLeft, ChevronRight, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const borrowerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  address: z.string().min(1, "Address is required"),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  principalAmount: z.coerce.number().min(1, "Amount must be positive"),
  interestRate: z.coerce.number().min(0).default(10),
  startDate: z.string().min(1, "Start date is required"),
  tenure: z.coerce.number().optional(),
  notes: z.string().optional(),
});

type BorrowerFormData = z.infer<typeof borrowerSchema>;

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    closed: "bg-slate-100 text-slate-600 border-slate-200",
    defaulted: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[status] ?? "bg-slate-100 text-slate-600"}`}>
      {status}
    </span>
  );
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

const PAGE_SIZES = [10, 20, 50] as const;

export default function Borrowers() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [showAdd, setShowAdd] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Debounce search — reset to page 1 on change
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page when filter changes
  useEffect(() => { setPage(1); }, [statusFilter, limit]);

  const params = {
    search: debouncedSearch || undefined,
    status: statusFilter as any,
    page,
    limit,
  };

  const { data: me } = useGetMe();
  const isAdmin = me?.role === "admin";

  const { data: result, isLoading } = useListBorrowers(params, {
    query: { queryKey: getListBorrowersQueryKey(params) },
  });

  const borrowers = result?.data ?? [];
  const total = result?.total ?? 0;
  const totalPages = result?.totalPages ?? 1;

  const createBorrower = useCreateBorrower();
  const deleteBorrower = useDeleteBorrower();

  const form = useForm<BorrowerFormData>({
    resolver: zodResolver(borrowerSchema),
    defaultValues: { interestRate: 10, startDate: new Date().toISOString().split("T")[0] },
  });

  const onSubmit = (data: BorrowerFormData) => {
    createBorrower.mutate(
      { data: { ...data, phone: data.phone || undefined, email: data.email || undefined, notes: data.notes || undefined } },
      {
        onSuccess: () => {
          toast({ title: "Borrower added", description: `${data.name} has been added.` });
          queryClient.invalidateQueries({ queryKey: getListBorrowersQueryKey() });
          setShowAdd(false);
          form.reset({ interestRate: 10, startDate: new Date().toISOString().split("T")[0] });
        },
        onError: () => toast({ title: "Error", description: "Failed to add borrower.", variant: "destructive" }),
      }
    );
  };

  const handleDelete = (id: number, name: string) => {
    if (!confirm(`Delete borrower "${name}"? This will also delete all payment records.`)) return;
    deleteBorrower.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Deleted", description: `${name} removed.` });
        queryClient.invalidateQueries({ queryKey: getListBorrowersQueryKey() });
        // Go back a page if the last item on a non-first page was deleted
        if (borrowers.length === 1 && page > 1) setPage(p => p - 1);
      },
    });
  };

  const totalOverdue = borrowers.reduce((s, b) => s + b.overdueCount, 0);

  // Pagination helpers
  const canPrev = page > 1;
  const canNext = page < totalPages;
  const pageStart = total === 0 ? 0 : (page - 1) * limit + 1;
  const pageEnd = Math.min(page * limit, total);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5" data-testid="borrowers-page">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Borrowers</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {total} total
            {isAdmin && <span className="ml-1 text-xs text-slate-400">(all users)</span>}
            {totalOverdue > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-red-600 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />{totalOverdue} overdue
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="bg-slate-900 hover:bg-slate-800 flex-shrink-0" data-testid="button-add-borrower">
          <Plus className="h-4 w-4 mr-1 md:mr-2" />
          <span className="hidden sm:inline">Add Borrower</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 md:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by name, address, phone…"
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
      </div>

      {/* Table */}
      <Card className="border-slate-200">
        {isLoading ? (
          <CardContent className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </CardContent>
        ) : borrowers.length === 0 ? (
          <CardContent className="py-16 text-center">
            <IndianRupee className="h-12 w-12 mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500">{debouncedSearch ? `No borrowers matching "${debouncedSearch}"` : "No borrowers found"}</p>
            {!debouncedSearch && (
              <button onClick={() => setShowAdd(true)} className="text-emerald-600 text-sm mt-2 hover:underline">
                Add your first borrower
              </button>
            )}
          </CardContent>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Borrower</th>
                    {isAdmin && (
                      <th className="text-left px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Added By</th>
                    )}
                    <th className="text-right px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Principal</th>
                    <th className="text-right px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Rate</th>
                    <th className="text-right px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Monthly</th>
                    <th className="px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Status</th>
                    <th className="px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {borrowers.map(b => {
                    const monthlyInterest = (b.principalAmount * b.interestRate) / 100;
                    return (
                      <tr
                        key={b.id}
                        className={`hover:bg-slate-50 transition-colors ${b.overdueCount > 0 ? "bg-red-50/30" : ""}`}
                        data-testid={`row-borrower-${b.id}`}
                      >
                        <td className="px-4 md:px-6 py-3 md:py-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div>
                              <p className="font-medium text-slate-900">{b.name}</p>
                              <p className="text-xs text-slate-400 mt-0.5 hidden sm:block truncate max-w-[200px]">{b.address}</p>
                            </div>
                            {b.overdueCount > 0 && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200 whitespace-nowrap">
                                <AlertTriangle className="h-3 w-3" />{b.overdueCount}
                              </span>
                            )}
                            <span className="sm:hidden">{statusBadge(b.status)}</span>
                          </div>
                        </td>
                        {isAdmin && (
                          <td className="px-4 md:px-6 py-3 md:py-4 hidden md:table-cell">
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                              <User className="h-3 w-3" />{b.userName ?? "—"}
                            </span>
                          </td>
                        )}
                        <td className="px-4 md:px-6 py-3 md:py-4 text-right font-semibold text-slate-900 whitespace-nowrap">{formatCurrency(b.principalAmount)}</td>
                        <td className="px-4 md:px-6 py-3 md:py-4 text-right font-medium text-slate-700 whitespace-nowrap">{b.interestRate}%</td>
                        <td className="px-4 md:px-6 py-3 md:py-4 text-right font-medium text-slate-900 whitespace-nowrap hidden md:table-cell">{formatCurrency(monthlyInterest)}</td>
                        <td className="px-4 md:px-6 py-3 md:py-4 hidden sm:table-cell">{statusBadge(b.status)}</td>
                        <td className="px-4 md:px-6 py-3 md:py-4">
                          <div className="flex items-center gap-1">
                            <Link href={`/borrowers/${b.id}`}>
                              <button className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-900" data-testid={`button-view-borrower-${b.id}`}>
                                <Eye className="h-4 w-4" />
                              </button>
                            </Link>
                            <button
                              onClick={() => handleDelete(b.id, b.name)}
                              className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600"
                              data-testid={`button-delete-borrower-${b.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="flex items-center justify-between px-4 md:px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <p className="text-xs text-slate-500">
                  {total === 0 ? "No results" : `Showing ${pageStart}–${pageEnd} of ${total}`}
                </p>
                <Select value={String(limit)} onValueChange={v => setLimit(Number(v))}>
                  <SelectTrigger className="h-7 text-xs w-20 border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZES.map(s => (
                      <SelectItem key={s} value={String(s)}>{s} / page</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={!canPrev}
                  className="h-7 w-7 rounded flex items-center justify-center text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none text-xs font-medium"
                >
                  «
                </button>
                <button
                  onClick={() => setPage(p => p - 1)}
                  disabled={!canPrev}
                  className="h-7 w-7 rounded flex items-center justify-center text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {/* Page number buttons */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 5) {
                    p = i + 1;
                  } else if (page <= 3) {
                    p = i + 1;
                  } else if (page >= totalPages - 2) {
                    p = totalPages - 4 + i;
                  } else {
                    p = page - 2 + i;
                  }
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`h-7 min-w-[28px] px-1.5 rounded text-xs font-medium transition-colors ${
                        p === page ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}

                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={!canNext}
                  className="h-7 w-7 rounded flex items-center justify-center text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={!canNext}
                  className="h-7 w-7 rounded flex items-center justify-center text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none text-xs font-medium"
                >
                  »
                </button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Add Borrower Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-add-borrower">
          <DialogHeader>
            <DialogTitle>Add New Borrower</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Full Name</FormLabel>
                    <FormControl><Input placeholder="Borrower name" {...field} data-testid="input-borrower-name" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="address" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Address</FormLabel>
                    <FormControl><Textarea placeholder="Full address" {...field} rows={2} data-testid="input-borrower-address" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl><Input placeholder="+91 99999 99999" {...field} data-testid="input-borrower-phone" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (optional)</FormLabel>
                    <FormControl><Input placeholder="email@example.com" {...field} data-testid="input-borrower-email" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="principalAmount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Loan Amount (₹)</FormLabel>
                    <FormControl><Input type="number" placeholder="100000" {...field} data-testid="input-borrower-amount" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="interestRate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Interest Rate (%/mo)</FormLabel>
                    <FormControl><Input type="number" step="0.5" placeholder="10" {...field} data-testid="input-borrower-rate" /></FormControl>
                    {form.watch("interestRate") > 10 && (
                      <p className="text-xs text-emerald-600">Commission: {(form.watch("interestRate") - 10).toFixed(1)}%</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="startDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl><Input type="date" {...field} data-testid="input-borrower-start-date" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="tenure" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tenure (months)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="12"
                        {...field}
                        value={field.value ?? ""}
                        onChange={e => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                        data-testid="input-borrower-tenure"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl><Textarea placeholder="Any notes about this loan…" {...field} rows={2} data-testid="input-borrower-notes" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button type="submit" disabled={createBorrower.isPending} className="bg-slate-900 hover:bg-slate-800" data-testid="button-submit-borrower">
                  {createBorrower.isPending ? "Adding…" : "Add Borrower"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
