import { Badge } from "@/components/ui/badge";

const ROLE_CONFIG: Record<string, { label: string; className: string }> = {
  ROOT_ADMIN: { label: "Root Admin", className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
  TEAM_ADMIN: { label: "Team Admin", className: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300" },
  MEMBER: { label: "Member", className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
};

export function AdminRoleBadge({ role }: { role: string }) {
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.MEMBER;
  return (
    <Badge variant="secondary" className={`${config.className} no-default-hover-elevate no-default-active-elevate`} data-testid={`badge-role-${role.toLowerCase()}`}>
      {config.label}
    </Badge>
  );
}
