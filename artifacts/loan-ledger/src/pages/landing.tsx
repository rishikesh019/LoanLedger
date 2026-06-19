import { Link } from "wouter";
import { Landmark, ArrowRight, ShieldCheck, Activity, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="h-16 px-6 lg:px-12 flex items-center justify-between border-b border-slate-200 bg-white">
        <div className="flex items-center">
          <Landmark className="h-6 w-6 text-emerald-600 mr-2" />
          <span className="text-xl font-bold text-slate-900 tracking-tight">LoanLedger</span>
        </div>
        <div className="flex items-center space-x-4">
          <Link href="/sign-in" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Sign In
          </Link>
          <Link href="/sign-up">
            <Button className="bg-slate-900 text-white hover:bg-slate-800">Get Started</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center py-20">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-sm font-medium mb-8 border border-emerald-100">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 mr-2"></span>
            Professional lending management
          </div>
          
          <h1 className="text-5xl lg:text-7xl font-bold text-slate-900 tracking-tight mb-6">
            Every rupee <span className="text-emerald-600">accounted for.</span>
          </h1>
          
          <p className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
            The precision cockpit for serious money managers. Track principal, calculate exact commissions, and manage your lending portfolio with absolute confidence.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/sign-up">
              <Button size="lg" className="bg-slate-900 hover:bg-slate-800 text-white w-full sm:w-auto h-12 px-8 text-base">
                Start Managing Loans <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div className="h-12 w-12 bg-slate-50 rounded-xl flex items-center justify-center mb-4 border border-slate-100">
                <Activity className="h-6 w-6 text-slate-700" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Precision Analytics</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Separate base interest from commissions. Track exact yields across your entire portfolio down to the month.
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div className="h-12 w-12 bg-emerald-50 rounded-xl flex items-center justify-center mb-4 border border-emerald-100">
                <Users className="h-6 w-6 text-emerald-700" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Borrower CRM</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Complete profiles for every borrower. Track payment history, outstanding balances, and status in one place.
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div className="h-12 w-12 bg-slate-50 rounded-xl flex items-center justify-center mb-4 border border-slate-100">
                <ShieldCheck className="h-6 w-6 text-slate-700" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Authoritative Control</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Built for professional lenders. Clean, fast interfaces that respect your time and protect your data.
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="py-8 text-center text-slate-500 text-sm border-t border-slate-200 bg-white">
        © {new Date().getFullYear()} LoanLedger. All rights reserved.
      </footer>
    </div>
  );
}
