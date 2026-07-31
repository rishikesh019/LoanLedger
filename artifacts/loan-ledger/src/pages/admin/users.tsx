import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  useListUsers, useCreateUser, useUpdateUser, getListUsersQueryKey,
  getGetUserBalanceQueryOptions,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Shield, User, Mail, Phone, Search, ChevronDown, ChevronRight, IndianRupee, Wallet, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const createUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required"),
  phone: z.string().optional(),
  role: z.enum(["admin", "user"]),
});

type CreateUserData = z.infer<typeof createUserSchema>;

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

function utilizationColor(rate: number): string {
  if (rate >= 90) return "bg-red-500";
  if (rate >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function utilizationTextColor(rate: number): string {
  if (rate >= 90) return "text-red-600";
  if (rate >= 70) return "text-amber-600";
  return "text-emerald-700";
}

function UtilizationBar({ rate, funded }: { rate: number; funded: number }) {
  if (funded === 0) {
    return <span className="text-xs text-slate-400 italic">No funds</span>;
  }
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${utilizationColor(rate)}`}
          style={{ width: `${Math.min(rate, 100)}%` }}
        />
      </div>
      <span className={`text-xs font-semibold tabular-nums w-9 text-right ${utilizationTextColor(rate)}`}>
        {rate.toFixed(0)}%
      </span>
    </div>
  );
}

function ExpandedBalanceDetail({ userId, balanceData }: {
  userId: number;
  balanceData: { totalFunded: number; totalDisbursed: number; available: number } | undefined;
}) {
  if (!balanceData) {
    return (
      <div className="px-6 pb-4 pt-1">
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    );
  }

  const { totalFunded, totalDisbursed, available } = balanceData;
  const rate = totalFunded > 0 ? (totalDisbursed / totalFunded) * 100 : 0;

  return (
    <div className="px-6 pb-4 pt-1 bg-slate-50 border-t border-slate-100" data-testid={`balance-detail-${userId}`}>
      <div className="grid grid-cols-3 gap-3 mt-2">
        <div className="bg-white rounded-lg border border-slate-200 px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <IndianRupee className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total Funded</p>
          </div>
          <p className="text-sm font-bold text-slate-900">{fmt(totalFunded)}</p>
        </div>
        <div className="bg-white rounded-lg border border-blue-100 px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
            <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">Disbursed</p>
          </div>
          <p className="text-sm font-bold text-blue-700">{fmt(totalDisbursed)}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Wallet className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Available</p>
          </div>
          <p className={`text-sm font-bold ${available < 0 ? "text-red-600" : "text-slate-900"}`}>{fmt(available)}</p>
        </div>
      </div>
      {totalFunded > 0 && (
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              className={`h-full rounded-full ${utilizationColor(rate)}`}
              style={{ width: `${Math.min(rate, 100)}%` }}
            />
          </div>
          <span className={`text-xs font-semibold ${utilizationTextColor(rate)} w-20 text-right`}>
            {rate.toFixed(1)}% deployed
          </span>
        </div>
      )}
    </div>
  );
}

export default function AdminUsers() {
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: users, isLoading } = useListUsers({ query: { queryKey: getListUsersQueryKey() } });
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  // Fetch balance for every lender (role=user) in parallel
  const lenderUsers = (users ?? []).filter(u => u.role === "user");
  const balanceResults = useQueries({
    queries: lenderUsers.map(u => getGetUserBalanceQueryOptions(u.id)),
  });
  const balanceByUserId = Object.fromEntries(
    lenderUsers.map((u, i) => [u.id, balanceResults[i]?.data])
  );

  const form = useForm<CreateUserData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: "user" },
  });

  const filteredUsers = (users ?? []).filter(u =>
    !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  );

  const onSubmit = (data: CreateUserData) => {
    createUser.mutate(
      { data },
      {
        onSuccess: () => {
          toast({ title: "User created", description: `${data.name} can now sign in with their email.` });
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          setShowCreate(false);
          form.reset({ role: "user" });
        },
        onError: () => toast({ title: "Error", description: "Failed to create user.", variant: "destructive" }),
      }
    );
  };

  const toggleActive = (userId: number, current: boolean) => {
    updateUser.mutate(
      { id: userId, data: { isActive: !current } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          toast({ title: `User ${!current ? "activated" : "deactivated"}` });
        },
      }
    );
  };

  const toggleRole = (userId: number, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    updateUser.mutate(
      { id: userId, data: { role: newRole as "admin" | "user" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          toast({ title: `Role changed to ${newRole}` });
        },
      }
    );
  };

  function toggleExpand(userId: number) {
    setExpandedId(prev => (prev === userId ? null : userId));
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5" data-testid="admin-users-page">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Manage Users</h1>
          <p className="text-slate-500 text-sm mt-0.5">{users?.length ?? 0} registered users</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-slate-900 hover:bg-slate-800 flex-shrink-0" data-testid="button-create-user">
          <Plus className="h-4 w-4 mr-1 md:mr-2" />
          <span className="hidden sm:inline">Create User</span>
          <span className="sm:hidden">Create</span>
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search users..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-search-users"
        />
      </div>

      <Card className="border-slate-200">
        {isLoading ? (
          <CardContent className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </CardContent>
        ) : filteredUsers.length === 0 ? (
          <CardContent className="py-16 text-center">
            <User className="h-12 w-12 mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500">No users found</p>
          </CardContent>
        ) : (
          <>
            {/* Mobile card view */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredUsers.map(u => {
                const bal = u.role === "user" ? balanceByUserId[u.id] : undefined;
                const rate = bal && bal.totalFunded > 0 ? (bal.totalDisbursed / bal.totalFunded) * 100 : 0;
                const isExpanded = expandedId === u.id;
                return (
                  <div key={u.id} data-testid={`row-user-${u.id}`}>
                    <div className="p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-slate-900 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-white">{u.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900 truncate">{u.name}</p>
                          <p className="text-xs text-slate-400 truncate">{u.email}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${u.role === "admin" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
                            <Shield className="h-3 w-3" />{u.role === "admin" ? "Admin" : "User"}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${u.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                            {u.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </div>

                      {/* Utilization on mobile */}
                      {u.role === "user" && (
                        <button
                          onClick={() => toggleExpand(u.id)}
                          className="w-full flex items-center gap-2 text-left"
                          data-testid={`button-expand-${u.id}`}
                        >
                          {isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                            : <ChevronRight className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                          }
                          <span className="text-xs text-slate-500 mr-1">Utilization</span>
                          <div className="flex-1">
                            <UtilizationBar rate={rate} funded={bal?.totalFunded ?? 0} />
                          </div>
                        </button>
                      )}

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleRole(u.id, u.role)}
                          className="flex-1 text-xs px-2.5 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 text-center"
                          data-testid={`button-toggle-role-${u.id}`}
                        >
                          Make {u.role === "admin" ? "User" : "Admin"}
                        </button>
                        <button
                          onClick={() => toggleActive(u.id, u.isActive ?? true)}
                          className={`flex-1 text-xs px-2.5 py-1.5 rounded-md border text-center ${u.isActive ? "border-red-200 text-red-600 hover:bg-red-50" : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"}`}
                          data-testid={`button-toggle-active-${u.id}`}
                        >
                          {u.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </div>

                    {/* Mobile expanded detail */}
                    {isExpanded && u.role === "user" && (
                      <ExpandedBalanceDetail userId={u.id} balanceData={balanceByUserId[u.id]} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop table view */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">User</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">Utilization</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Joined</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(u => {
                    const bal = u.role === "user" ? balanceByUserId[u.id] : undefined;
                    const rate = bal && bal.totalFunded > 0 ? (bal.totalDisbursed / bal.totalFunded) * 100 : 0;
                    const isExpanded = expandedId === u.id;
                    return (
                      <>
                        <tr
                          key={u.id}
                          className={`border-b border-slate-100 hover:bg-slate-50 ${u.role === "user" ? "cursor-pointer" : ""}`}
                          onClick={() => u.role === "user" && toggleExpand(u.id)}
                          data-testid={`row-user-${u.id}`}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {u.role === "user" ? (
                                isExpanded
                                  ? <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                  : <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
                              ) : (
                                <div className="w-4 flex-shrink-0" />
                              )}
                              <div className="h-9 w-9 rounded-full bg-slate-900 flex items-center justify-center flex-shrink-0">
                                <span className="text-sm font-bold text-white">{u.name.charAt(0).toUpperCase()}</span>
                              </div>
                              <div>
                                <p className="font-medium text-slate-900">{u.name}</p>
                                <div className="flex items-center gap-1 text-slate-400 text-xs mt-0.5">
                                  <Mail className="h-3 w-3" /> {u.email}
                                </div>
                                {u.phone && (
                                  <div className="flex items-center gap-1 text-slate-400 text-xs">
                                    <Phone className="h-3 w-3" /> {u.phone}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${u.role === "admin" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
                              <Shield className="h-3 w-3" />
                              {u.role === "admin" ? "Admin" : "User"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${u.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                              {u.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-6 py-4 min-w-[160px]">
                            {u.role === "user" && (
                              <UtilizationBar rate={rate} funded={bal?.totalFunded ?? 0} />
                            )}
                          </td>
                          <td className="px-6 py-4 text-right text-slate-500">
                            {new Date(u.createdAt).toLocaleDateString("en-IN")}
                          </td>
                          <td className="px-6 py-4">
                            <div
                              className="flex items-center gap-2"
                              onClick={e => e.stopPropagation()}
                            >
                              <button
                                onClick={() => toggleRole(u.id, u.role)}
                                className="text-xs px-2.5 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 whitespace-nowrap"
                                data-testid={`button-toggle-role-${u.id}`}
                              >
                                Make {u.role === "admin" ? "User" : "Admin"}
                              </button>
                              <button
                                onClick={() => toggleActive(u.id, u.isActive ?? true)}
                                className={`text-xs px-2.5 py-1 rounded-md border whitespace-nowrap ${u.isActive ? "border-red-200 text-red-600 hover:bg-red-50" : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"}`}
                                data-testid={`button-toggle-active-${u.id}`}
                              >
                                {u.isActive ? "Deactivate" : "Activate"}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded balance detail row */}
                        {isExpanded && u.role === "user" && (
                          <tr key={`${u.id}-detail`} className="border-b border-slate-100">
                            <td colSpan={6} className="p-0">
                              <ExpandedBalanceDetail userId={u.id} balanceData={balanceByUserId[u.id]} />
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="dialog-create-user">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500 -mt-2">
            The user will be able to sign in with their email address. They can use "Forgot password?" on the login page to set their own password.
          </p>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl><Input placeholder="Name" {...field} data-testid="input-user-name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" placeholder="email@example.com" {...field} data-testid="input-user-email" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone (optional)</FormLabel>
                  <FormControl><Input placeholder="+91 99999 99999" {...field} data-testid="input-user-phone" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger data-testid="select-user-role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button type="submit" disabled={createUser.isPending} className="bg-slate-900 hover:bg-slate-800" data-testid="button-submit-create-user">
                  {createUser.isPending ? "Creating..." : "Create User"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
