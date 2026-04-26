import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { ErrorBoundary } from "@/components/error-boundary";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import LoginPage from "@/pages/login";
import SignupPage from "@/pages/signup";
import RedeemPage from "@/pages/redeem";
import OauthClaimAccountPage from "@/pages/oauth-claim-account";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import DocsPage from "@/pages/docs";
import AboutPage from "@/pages/about";
import CareersPage from "@/pages/careers";
import ContactPage from "@/pages/contact";
import PrivacyPage from "@/pages/privacy";
import TermsPage from "@/pages/terms";
import SecurityPage from "@/pages/security";
import ComponentsShowcase from "@/pages/components-showcase";
import ArenaPage from "@/pages/arena";
import InvitePage from "@/pages/invite";
import AdminLoginPage from "@/pages/admin-login";
import AdminPage from "@/pages/admin";
import DashboardOverview from "@/pages/dashboard/overview";
import ProvidersPage from "@/pages/dashboard/providers";
import TeamsPage from "@/pages/dashboard/teams";
import MembersPage from "@/pages/dashboard/members";
import VouchersPage from "@/pages/dashboard/vouchers";
import BundlesPage from "@/pages/dashboard/bundles";
import AnalyticsPage from "@/pages/dashboard/analytics";
import AuditLogPage from "@/pages/dashboard/audit-log";
import SettingsPage from "@/pages/dashboard/settings";
import KeysPage from "@/pages/dashboard/keys";
import UsagePage from "@/pages/dashboard/usage";
import ConnectPage from "@/pages/dashboard/connect";

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
      <Route path="/about" component={AboutPage} />
      <Route path="/careers" component={CareersPage} />
      <Route path="/contact" component={ContactPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/security" component={SecurityPage} />
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
      <Route path="/dashboard/usage">
        {() => <DashboardRoute component={UsagePage} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
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
