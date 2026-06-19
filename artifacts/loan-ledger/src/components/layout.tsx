import { Link, useLocation } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { useClerk } from "@clerk/react";
import { Landmark, LayoutDashboard, Users, BarChart3, Settings, LogOut, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function Layout({ children, adminOnly = false }: { children: React.ReactNode, adminOnly?: boolean }) {
  const [location] = useLocation();
  const { data: user, isLoading } = useGetMe();
  const { signOut } = useClerk();

  if (isLoading) {
    return <div className="flex h-screen w-full items-center justify-center bg-slate-50"><Skeleton className="h-32 w-32 rounded-full" /></div>;
  }

  if (adminOnly && user?.role !== "admin") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <div className="text-center max-w-md p-8 bg-white rounded-xl shadow-sm border border-slate-200">
          <ShieldAlert className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
          <p className="text-slate-500 mb-6">You need administrator privileges to view this page.</p>
          <Link href="/dashboard" className="text-emerald-600 hover:text-emerald-700 font-medium">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/borrowers", label: "Borrowers", icon: Users },
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
  ];

  const adminNavItems = [
    { href: "/admin/dashboard", label: "System Overview", icon: LayoutDashboard },
    { href: "/admin/users", label: "Manage Users", icon: Users },
    { href: "/admin/borrowers", label: "All Borrowers", icon: Landmark },
  ];

  return (
    <div className="flex min-h-screen w-full bg-slate-50">
      <aside className="w-64 flex-shrink-0 bg-slate-900 text-slate-300 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-slate-800">
          <Landmark className="h-6 w-6 text-emerald-500 mr-3" />
          <span className="text-lg font-bold tracking-tight text-white">LoanLedger</span>
        </div>
        
        <div className="flex-1 overflow-y-auto py-6 px-4">
          <div className="space-y-1 mb-8">
            <div className="px-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Main</div>
            {navItems.map((item) => (
              <Link 
                key={item.href} 
                href={item.href}
                className={`flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                  location === item.href 
                    ? "bg-slate-800 text-white" 
                    : "hover:bg-slate-800 hover:text-white"
                }`}
              >
                <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
                {item.label}
              </Link>
            ))}
          </div>

          {user?.role === "admin" && (
            <div className="space-y-1 mb-8">
              <div className="px-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Admin</div>
              {adminNavItems.map((item) => (
                <Link 
                  key={item.href} 
                  href={item.href}
                  className={`flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                    location === item.href 
                      ? "bg-slate-800 text-white" 
                      : "hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-800">
          <Link 
            href="/profile"
            className={`flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors mb-2 ${
              location === "/profile" ? "bg-slate-800 text-white" : "hover:bg-slate-800 hover:text-white"
            }`}
          >
            <Settings className="mr-3 h-5 w-5 flex-shrink-0" />
            Settings
          </Link>
          <button
            onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL.replace(/\/$/, "") || "/" })}
            className="w-full flex items-center px-2 py-2 text-sm font-medium rounded-md text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <LogOut className="mr-3 h-5 w-5 flex-shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="h-16 flex items-center justify-between px-8 border-b border-slate-200 bg-white shadow-sm z-10">
          <h1 className="text-xl font-semibold text-slate-900 capitalize">
            {location.split('/').pop() || 'Dashboard'}
          </h1>
          <div className="flex items-center">
            <span className="text-sm text-slate-500 mr-4">{user?.name}</span>
            <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
