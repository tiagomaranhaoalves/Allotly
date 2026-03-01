import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
  SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { LogoFull, LogoIcon } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/components/theme-provider";
import { Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  LayoutDashboard, Plug, Users, Ticket, Package, BarChart3, FileText,
  Settings, Key, Activity, Sun, Moon, LogOut, ChevronDown,
} from "lucide-react";
import { AdminRoleBadge } from "./brand/role-badge";
import { Skeleton } from "./ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "./ui/dropdown-menu";

const ROOT_ADMIN_NAV = [
  { title: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { title: "Providers", href: "/dashboard/providers", icon: Plug },
  { title: "Teams", href: "/dashboard/teams", icon: Users },
  { title: "Vouchers", href: "/dashboard/vouchers", icon: Ticket },
  { title: "Bundles", href: "/dashboard/bundles", icon: Package },
  { title: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { title: "Audit Log", href: "/dashboard/audit-log", icon: FileText },
  { title: "Settings", href: "/dashboard/settings", icon: Settings },
];

const TEAM_ADMIN_NAV = [
  { title: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { title: "Members", href: "/dashboard/members", icon: Users },
  { title: "Vouchers", href: "/dashboard/vouchers", icon: Ticket },
  { title: "Bundles", href: "/dashboard/bundles", icon: Package },
  { title: "Settings", href: "/dashboard/settings", icon: Settings },
];

const MEMBER_NAV = [
  { title: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { title: "API Keys", href: "/dashboard/keys", icon: Key },
  { title: "Usage", href: "/dashboard/usage", icon: Activity },
];

function getNavItems(role: string) {
  switch (role) {
    case "ROOT_ADMIN": return ROOT_ADMIN_NAV;
    case "TEAM_ADMIN": return TEAM_ADMIN_NAV;
    case "MEMBER": return MEMBER_NAV;
    default: return MEMBER_NAV;
  }
}

function AppSidebar() {
  const { user, organization } = useAuth();
  const [location] = useLocation();
  const navItems = getNavItems(user?.orgRole || "MEMBER");

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b">
        <Link href="/" data-testid="link-sidebar-logo">
          <LogoFull size={24} />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild data-active={location === item.href}>
                    <Link href={item.href} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3 border-t">
        <div className="flex items-center gap-2 px-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
            {user?.name?.[0] || user?.email?.[0] || "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name || user?.email}</p>
            <p className="text-xs text-muted-foreground truncate">{organization?.name}</p>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function DashboardHeader() {
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
    <header className="flex items-center justify-between gap-2 p-3 border-b bg-background shrink-0">
      <div className="flex items-center gap-2">
        <SidebarTrigger data-testid="button-sidebar-toggle" />
        {user && <AdminRoleBadge role={user.orgRole} />}
      </div>
      <div className="flex items-center gap-2">
        <Button size="icon" variant="secondary" onClick={toggleTheme} data-testid="button-theme-toggle-dash">
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" className="gap-1" data-testid="button-user-menu">
              {user?.name?.[0] || "?"}
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} data-testid="button-logout">
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
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
    setLocation("/login");
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
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
