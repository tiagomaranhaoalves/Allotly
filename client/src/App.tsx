import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { ErrorBoundary } from "@/components/error-boundary";

const NotFound = lazy(() => import("@/pages/not-found"));
const LandingPage = lazy(() => import("@/pages/landing"));
const LoginPage = lazy(() => import("@/pages/login"));
const SignupPage = lazy(() => import("@/pages/signup"));
const RedeemPage = lazy(() => import("@/pages/redeem"));
const OauthClaimAccountPage = lazy(() => import("@/pages/oauth-claim-account"));
const ForgotPasswordPage = lazy(() => import("@/pages/forgot-password"));
const ResetPasswordPage = lazy(() => import("@/pages/reset-password"));
const DocsPage = lazy(() => import("@/pages/docs"));
const McpDocsPage = lazy(() => import("@/pages/mcp-docs"));
const AboutPage = lazy(() => import("@/pages/about"));
const CareersPage = lazy(() => import("@/pages/careers"));
const ContactPage = lazy(() => import("@/pages/contact"));
const PrivacyPage = lazy(() => import("@/pages/privacy"));
const DpaPage = lazy(() => import("@/pages/dpa"));
const SubprocessorsPage = lazy(() => import("@/pages/subprocessors"));
const TermsPage = lazy(() => import("@/pages/terms"));
const SecurityPage = lazy(() => import("@/pages/security"));
const ComponentsShowcase = lazy(() => import("@/pages/components-showcase"));
const ArenaPage = lazy(() => import("@/pages/arena"));
const InvitePage = lazy(() => import("@/pages/invite"));
const AdminLoginPage = lazy(() => import("@/pages/admin-login"));
const AdminPage = lazy(() => import("@/pages/admin"));
const DashboardOverview = lazy(() => import("@/pages/dashboard/overview"));
const ProvidersPage = lazy(() => import("@/pages/dashboard/providers"));
const TeamsPage = lazy(() => import("@/pages/dashboard/teams"));
const MembersPage = lazy(() => import("@/pages/dashboard/members"));
const VouchersPage = lazy(() => import("@/pages/dashboard/vouchers"));
const BundlesPage = lazy(() => import("@/pages/dashboard/bundles"));
const AnalyticsPage = lazy(() => import("@/pages/dashboard/analytics"));
const AuditLogPage = lazy(() => import("@/pages/dashboard/audit-log"));
const SettingsPage = lazy(() => import("@/pages/dashboard/settings"));
const KeysPage = lazy(() => import("@/pages/dashboard/keys"));
const UsagePage = lazy(() => import("@/pages/dashboard/usage"));
const ConnectPage = lazy(() => import("@/pages/dashboard/connect"));
const ConnectionsPage = lazy(() => import("@/pages/dashboard/connections"));

function DashboardRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <DashboardShell>
      <ErrorBoundary>
        <div className="animate-in fade-in duration-200">
          <Component />
        </div>
      </ErrorBoundary>
    </DashboardShell>
  );
}

function Router() {
  return (
    <Suspense fallback={null}>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/login" component={LoginPage} />
        <Route path="/signup" component={SignupPage} />
        <Route path="/redeem" component={RedeemPage} />
        <Route path="/oauth/claim-account" component={OauthClaimAccountPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/invite/:token" component={InvitePage} />
        <Route path="/docs" component={DocsPage} />
        <Route path="/mcp/docs" component={McpDocsPage} />
        <Route path="/docs/mcp" component={McpDocsPage} />
        <Route path="/about" component={AboutPage} />
        <Route path="/careers" component={CareersPage} />
        <Route path="/contact" component={ContactPage} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/terms" component={TermsPage} />
        <Route path="/security" component={SecurityPage} />
        <Route path="/dpa" component={DpaPage} />
        <Route path="/subprocessors" component={SubprocessorsPage} />
        <Route path="/components" component={ComponentsShowcase} />
        <Route path="/arena" component={ArenaPage} />
        <Route path="/admin/login" component={AdminLoginPage} />
        <Route path="/admin" component={AdminPage} />
        <Route path="/dashboard">
          {() => <DashboardRoute component={DashboardOverview} />}
        </Route>
        <Route path="/dashboard/providers">
          {() => <DashboardRoute component={ProvidersPage} />}
        </Route>
        <Route path="/dashboard/teams">
          {() => <DashboardRoute component={TeamsPage} />}
        </Route>
        <Route path="/dashboard/members">
          {() => <DashboardRoute component={MembersPage} />}
        </Route>
        <Route path="/dashboard/vouchers">
          {() => <DashboardRoute component={VouchersPage} />}
        </Route>
        <Route path="/dashboard/bundles">
          {() => <DashboardRoute component={BundlesPage} />}
        </Route>
        <Route path="/dashboard/analytics">
          {() => <DashboardRoute component={AnalyticsPage} />}
        </Route>
        <Route path="/dashboard/audit-log">
          {() => <DashboardRoute component={AuditLogPage} />}
        </Route>
        <Route path="/dashboard/settings">
          {() => <DashboardRoute component={SettingsPage} />}
        </Route>
        <Route path="/dashboard/keys">
          {() => <DashboardRoute component={KeysPage} />}
        </Route>
        <Route path="/dashboard/connect">
          {() => <DashboardRoute component={ConnectPage} />}
        </Route>
        <Route path="/dashboard/connections">
          {() => <DashboardRoute component={ConnectionsPage} />}
        </Route>
        <Route path="/dashboard/usage">
          {() => <DashboardRoute component={UsagePage} />}
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
