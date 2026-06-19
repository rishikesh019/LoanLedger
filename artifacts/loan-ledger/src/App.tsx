import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import LandingPage from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import Borrowers from "@/pages/borrowers";
import BorrowerDetail from "@/pages/borrower-detail";
import Analytics from "@/pages/analytics";
import Profile from "@/pages/profile";

import AdminDashboard from "@/pages/admin/dashboard";
import AdminUsers from "@/pages/admin/users";
import AdminBorrowers from "@/pages/admin/borrowers";

import Layout from "@/components/layout";

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(222 47% 11%)",
    colorForeground: "hsl(222 47% 11%)",
    colorMutedForeground: "hsl(215.4 16.3% 46.9%)",
    colorDanger: "hsl(0 84.2% 60.2%)",
    colorBackground: "hsl(0 0% 100%)",
    colorInput: "hsl(214.3 31.8% 91.4%)",
    colorInputForeground: "hsl(222 47% 11%)",
    colorNeutral: "hsl(214 32% 91%)",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl border border-slate-200",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-2xl font-semibold tracking-tight text-slate-900",
    headerSubtitle: "text-sm text-slate-500",
    socialButtonsBlockButtonText: "text-sm font-medium",
    formFieldLabel: "text-sm font-medium text-slate-900",
    footerActionLink: "text-sm font-medium text-emerald-600 hover:text-emerald-700",
    footerActionText: "text-sm text-slate-500",
    dividerText: "text-xs text-slate-500",
    identityPreviewEditButton: "text-emerald-600 hover:text-emerald-700",
    formFieldSuccessText: "text-sm text-emerald-600",
    alertText: "text-sm text-red-600",
    logoBox: "h-10",
    logoImage: "h-10 w-auto",
    socialButtonsBlockButton: "bg-white border-slate-200 hover:bg-slate-50",
    formButtonPrimary: "bg-slate-900 hover:bg-slate-800 text-white",
    formFieldInput: "bg-white border-slate-200 focus:ring-slate-900",
    footerAction: "mt-6 border-t border-slate-100 pt-6",
    dividerLine: "bg-slate-200",
    alert: "bg-red-50 border-red-200",
    otpCodeFieldInput: "bg-white border-slate-200 focus:ring-slate-900",
    formFieldRow: "mb-4",
    main: "p-8",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component, adminOnly = false }: { component: any, adminOnly?: boolean }) {
  return (
    <>
      <Show when="signed-in">
        <Layout adminOnly={adminOnly}>
          <Component />
        </Layout>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          
          <Route path="/dashboard">
            {() => <ProtectedRoute component={Dashboard} />}
          </Route>
          <Route path="/borrowers">
            {() => <ProtectedRoute component={Borrowers} />}
          </Route>
          <Route path="/borrowers/:id">
            {() => <ProtectedRoute component={BorrowerDetail} />}
          </Route>
          <Route path="/analytics">
            {() => <ProtectedRoute component={Analytics} />}
          </Route>
          <Route path="/profile">
            {() => <ProtectedRoute component={Profile} />}
          </Route>

          <Route path="/admin/dashboard">
            {() => <ProtectedRoute component={AdminDashboard} adminOnly={true} />}
          </Route>
          <Route path="/admin/users">
            {() => <ProtectedRoute component={AdminUsers} adminOnly={true} />}
          </Route>
          <Route path="/admin/borrowers">
            {() => <ProtectedRoute component={AdminBorrowers} adminOnly={true} />}
          </Route>

          <Route component={NotFound} />
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
