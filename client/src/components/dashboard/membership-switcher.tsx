import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useActiveMembership } from "@/hooks/use-active-membership";

// Surfaces every membership the signed-in user holds. Hidden when the user
// only has one — single-team users see no extra UI. On switch we invalidate
// every query that depends on the chosen membership so the rest of the page
// (overview, keys, usage, banner) refetches scoped to the new team.
export function MembershipSwitcher() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { memberships, hasMultiple, activeMembershipId, setActiveMembershipId } =
    useActiveMembership();

  if (!hasMultiple) return null;

  function onChange(id: string) {
    setActiveMembershipId(id);
    // Every per-membership view refetches via the new id appended to the
    // queryKey by its consuming hook. Invalidate the parents we know about.
    qc.invalidateQueries({ queryKey: ["/api/dashboard/member-overview"] });
    qc.invalidateQueries({ queryKey: ["/api/me/keys"] });
    qc.invalidateQueries({ queryKey: ["/api/my-keys"] });
    qc.invalidateQueries({ queryKey: ["/api/members/me/welcome"] });
    qc.invalidateQueries({ queryKey: ["/api/dashboard/overview"] });
  }

  return (
    <Card className="p-4" data-testid="card-membership-switcher">
      <div className="flex items-center gap-3">
        <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="text-sm text-muted-foreground flex-shrink-0">
          {t("dashboard.membershipSwitcher.label", { defaultValue: "Viewing" })}
        </span>
        <Select value={activeMembershipId ?? undefined} onValueChange={onChange}>
          <SelectTrigger
            className="max-w-xs"
            data-testid="select-membership"
          >
            <SelectValue
              placeholder={t("dashboard.membershipSwitcher.placeholder", {
                defaultValue: "Select team",
              })}
            />
          </SelectTrigger>
          <SelectContent>
            {memberships.map((m) => (
              <SelectItem
                key={m.id}
                value={m.id}
                data-testid={`option-membership-${m.id}`}
              >
                <span className="flex items-center gap-2">
                  <span>{m.teamName}</span>
                  {m.accessType === "VOUCHER" && (
                    <Badge variant="secondary" className="text-[10px]">
                      voucher
                    </Badge>
                  )}
                  {m.status !== "ACTIVE" && (
                    <Badge variant="outline" className="text-[10px]">
                      {m.status.toLowerCase()}
                    </Badge>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </Card>
  );
}

export default MembershipSwitcher;
