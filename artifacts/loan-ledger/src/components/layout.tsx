import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { useClerk } from "@clerk/react";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { Landmark, LayoutDashboard, Users, BarChart3, LogOut, ShieldAlert, Menu, X, Settings, CalendarCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Layout({ children, adminOnly = false }: { children: React.ReactNode, adminOnly?: boolean }) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: user, isLoading } = useGetMe();
  const { signOut } = useClerk();
  const isAdmin = useIsAdmin();

  if (isLoading) {
    return <div className="flex h-screen w-full items-center justify-center bg-slate-50"><Skeleton className="h-32 w-32 rounded-full" /></div>;
  }

  if (adminOnly && !isAdmin) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 px-4">
        <div className="text-center max-w-md p-8 bg-white rounded-xl shadow-sm border border-slate-200">
          <ShieldAlert className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
          <p className="text-slate-500 mb-6">You need administrator privileges to view this page.</p>
          <Link href="/borrowers" className="text-emerald-600 hover:text-emerald-700 font-medium">
            Go to Borrowers
          </Link>
        </div>
      </div>
    );
  }

  // Regular users + admin "My Work" section
  const userNavItems = [
    { href: "/borrowers", label: "Borrowers", icon: Users },
    { href: "/collections", label: "Collections", icon: CalendarCheck },
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
  ];

  // Admin-only system section
  const adminNavItems = [
    { href: "/admin/dashboard", label: "System Overview", icon: LayoutDashboard },
    { href: "/admin/users", label: "Manage Users", icon: Users },
  ];

  const pageTitle = (() => {
    const parts = location.split("/").filter(Boolean);
    if (parts[0] === "admin") return parts[1] ? parts[1].replace(/-/g, " ") : "Admin";
    return parts[0]?.replace(/-/g, " ") || "Dashboard";
  })();

  const SidebarContent = () => (
    <>
      <div className="h-16 flex items-center px-6 border-b border-slate-800 flex-shrink-0">
        <Landmark className="h-6 w-6 text-emerald-500 mr-3 flex-shrink-0" />
        <span className="text-lg font-bold tracking-tight text-white">LoanLedger</span>
      </div>

      <div className="flex-1 overflow-y-auto py-6 px-4">
        {isAdmin ? (
          <>
            {/* Admin: show admin nav */}
            <div className="space-y-1 mb-8">
              <div className="px-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Admin</div>
              {adminNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                    location === item.href
                      ? "bg-slate-800 text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="space-y-1 mb-8">
              <div className="px-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">My Work</div>
              {userNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                    location === item.href
                      ? "bg-slate-800 text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
                  {item.label}
                </Link>
              ))}
            </div>
          </>
        ) : (
          /* Regular user: only Borrowers + Analytics */
          <div className="space-y-1 mb-8">
            {userNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                  location === item.href
                    ? "bg-slate-800 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-800 flex-shrink-0">
        {isAdmin && (
          <Link
            href="/profile"
            onClick={() => setSidebarOpen(false)}
            className={`flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors mb-1 ${
              location === "/profile" ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <Settings className="mr-3 h-5 w-5 flex-shrink-0" />
            Settings
          </Link>
        )}
        <button
          onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL.replace(/\/$/, "") || "/" })}
          className="w-full flex items-center px-2 py-2 text-sm font-medium rounded-md text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <LogOut className="mr-3 h-5 w-5 flex-shrink-0" />
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen w-full bg-slate-50">
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar (slide-in drawer) */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 flex-shrink-0 bg-slate-900 text-slate-300 flex flex-col transition-transform duration-200 md:static md:translate-x-0 md:z-auto ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Close button on mobile */}
        <button
          className="absolute top-4 right-4 md:hidden text-slate-400 hover:text-white"
          onClick={() => setSidebarOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarContent />
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="h-14 md:h-16 flex items-center justify-between px-4 md:px-8 border-b border-slate-200 bg-white shadow-sm z-10 flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Hamburger — mobile only */}
            <button
              className="md:hidden p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-base md:text-xl font-semibold text-slate-900 capitalize">{pageTitle}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:block text-sm text-slate-500">{user?.name}</span>
            <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm flex-shrink-0">
              {user?.name?.charAt(0).toUpperCase() || "U"}
            </div>
          </div>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
