import { Badge } from "@/components/ui/badge";
import { Shield, Users, User } from "lucide-react";
import { useTranslation } from "react-i18next";

const ROLE_CONFIG: Record<string, { labelKey: string; className: string; icon: React.ReactNode }> = {
  ROOT_ADMIN: { labelKey: "dashboard.components.roleBadge.rootAdmin", className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-200/50 dark:border-indigo-800/50", icon: <Shield className="w-3 h-3" /> },
  TEAM_ADMIN: { labelKey: "dashboard.components.roleBadge.teamAdmin", className: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300 border-cyan-200/50 dark:border-cyan-800/50", icon: <Users className="w-3 h-3" /> },
  MEMBER: { labelKey: "dashboard.components.roleBadge.member", className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200/50 dark:border-gray-700/50", icon: <User className="w-3 h-3" /> },
};

export function AdminRoleBadge({ role }: { role: string }) {
  const { t } = useTranslation();
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.MEMBER;
  return (
    <Badge variant="secondary" className={`${config.className} no-default-hover-elevate no-default-active-elevate gap-1 font-semibold text-[11px] border`} data-testid={`badge-role-${role.toLowerCase()}`}>
      {config.icon}
      {t(config.labelKey)}
    </Badge>
  );
}
