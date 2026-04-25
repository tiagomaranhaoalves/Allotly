import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
  SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LogoFull, LogoIcon } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/components/theme-provider";
import { Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  LayoutDashboard, Plug, PlugZap, Users, UserCheck, Ticket, Package, BarChart3, FileText,
  Settings, Sun, Moon, LogOut, ChevronDown, Key, BookOpen, Swords, ExternalLink,
} from "lucide-react";
import { AdminRoleBadge } from "./brand/role-badge";
import { Skeleton } from "./ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "./ui/dropdown-menu";

type NavItem = {
  testId: string;
  i18nKey: string;
  href: string;
  icon: typeof LayoutDashboard;
};

const ROOT_ADMIN_NAV: NavItem[] = [
  { testId: "overview", i18nKey: "dashboard.sidebar.overview", href: "/dashboard", icon: LayoutDashboard },
  { testId: "ai-providers", i18nKey: "dashboard.sidebar.aiProviders", href: "/dashboard/providers", icon: Plug },
  { testId: "teams", i18nKey: "dashboard.sidebar.teams", href: "/dashboard/teams", icon: Users },
  { testId: "members", i18nKey: "dashboard.sidebar.members", href: "/dashboard/members", icon: UserCheck },
  { testId: "vouchers", i18nKey: "dashboard.sidebar.vouchers", href: "/dashboard/vouchers", icon: Ticket },
  { testId: "api-keys", i18nKey: "dashboard.sidebar.apiKeys", href: "/dashboard/keys", icon: Key },
  { testId: "connect-ai-tool", i18nKey: "dashboard.sidebar.connectAiTool", href: "/dashboard/connect", icon: PlugZap },
  { testId: "bundles", i18nKey: "dashboard.sidebar.bundles", href: "/dashboard/bundles", icon: Package },
  { testId: "analytics", i18nKey: "dashboard.sidebar.analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { testId: "audit-log", i18nKey: "dashboard.sidebar.auditLog", href: "/dashboard/audit-log", icon: FileText },
  { testId: "settings", i18nKey: "dashboard.sidebar.settings", href: "/dashboard/settings", icon: Settings },
  { testId: "docs", i18nKey: "dashboard.sidebar.docs", href: "/docs", icon: BookOpen },
];

const TEAM_ADMIN_NAV: NavItem[] = [
  { testId: "overview", i18nKey: "dashboard.sidebar.overview", href: "/dashboard", icon: LayoutDashboard },
  { testId: "members", i18nKey: "dashboard.sidebar.members", href: "/dashboard/members", icon: Users },
  { testId: "vouchers", i18nKey: "dashboard.sidebar.vouchers", href: "/dashboard/vouchers", icon: Ticket },
  { testId: "bundles", i18nKey: "dashboard.sidebar.bundles", href: "/dashboard/bundles", icon: Package },
  { testId: "analytics", i18nKey: "dashboard.sidebar.analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { testId: "connect-ai-tool", i18nKey: "dashboard.sidebar.connectAiTool", href: "/dashboard/connect", icon: PlugZap },
  { testId: "settings", i18nKey: "dashboard.sidebar.settings", href: "/dashboard/settings", icon: Settings },
  { testId: "docs", i18nKey: "dashboard.sidebar.docs", href: "/docs", icon: BookOpen },
];

const MEMBER_NAV: NavItem[] = [
  { testId: "overview", i18nKey: "dashboard.sidebar.overview", href: "/dashboard", icon: LayoutDashboard },
  { testId: "docs", i18nKey: "dashboard.sidebar.docs", href: "/docs", icon: BookOpen },
];

function getNavItems(role: string): NavItem[] {
  switch (role) {
    case "ROOT_ADMIN": return ROOT_ADMIN_NAV;
    case "TEAM_ADMIN": return TEAM_ADMIN_NAV;
    case "MEMBER": return MEMBER_NAV;
    default: return MEMBER_NAV;
  }
}

function AppSidebar() {
  const { t } = useTranslation();
  const { user, organization } = useAuth();
  const [location] = useLocation();
  const navItems = getNavItems(user?.orgRole || "MEMBER");

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b">
        <Link href="/" data-testid="link-sidebar-logo">
          <LogoFull size={24} />
        </Link>
        {organization && (
          <p className="mt-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider truncate">{organization.name}</p>
        )}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] uppercase tracking-wider font-semibold">{t("dashboard.sidebar.navigation")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.testId}>
                  <SidebarMenuButton asChild data-active={location === item.href}>
                    <Link href={item.href} data-testid={`link-nav-${item.testId}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{t(item.i18nKey)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] uppercase tracking-wider font-semibold">{t("dashboard.sidebar.tools")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a
                    href="/arena"
                    target="_blank"
                    rel="noopener"
                    title={t("dashboard.sidebar.testKeyArenaTooltip")}
                    data-testid="link-nav-test-key-arena"
                  >
                    <Swords className="w-4 h-4" />
                    <span>{t("dashboard.sidebar.testKeyArena")}</span>
                    <ExternalLink className="w-3 h-3 ml-auto opacity-60" />
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3 border-t">
        <div className="flex items-center gap-2.5 px-2 py-1">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 dark:from-indigo-900/60 dark:to-indigo-800/60 flex items-center justify-center text-sm font-bold text-indigo-700 dark:text-indigo-300 shrink-0">
            {user?.name?.[0] || user?.email?.[0] || "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{user?.name || user?.email}</p>
            <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function DashboardHeader() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [, setLocation] = useLocation();

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
      queryClient.clear();
      setLocation("/");
    } catch (e) {}
  };

  return (
    <header className="flex items-center justify-between gap-2 px-4 py-3 border-b bg-background/80 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-3">
        <SidebarTrigger data-testid="button-sidebar-toggle" aria-label={t("dashboard.header.toggleSidebar")} />
        {user && <AdminRoleBadge role={user.orgRole} />}
      </div>
      <div className="flex items-center gap-2">
        <LanguageSwitcher variant="dark" />
        <Button size="icon" variant="secondary" onClick={toggleTheme} data-testid="button-theme-toggle-dash" aria-label={t("dashboard.header.toggleTheme")}>
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" className="gap-1.5 pl-2 pr-2.5" data-testid="button-user-menu" aria-label={t("dashboard.header.userMenu")}>
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 dark:from-indigo-900/60 dark:to-indigo-800/60 flex items-center justify-center text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                {user?.name?.[0] || "?"}
              </div>
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-3 py-2">
              <p className="text-sm font-semibold">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} data-testid="button-logout" className="text-destructive focus:text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              {t("dashboard.header.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <LogoIcon size={40} className="mx-auto animate-pulse" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <DashboardHeader />
          <main className="flex-1 overflow-auto p-6 bg-muted/5">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
