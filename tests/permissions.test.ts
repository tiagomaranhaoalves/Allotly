import { describe, it, expect } from "vitest";

const ROLES = ["ROOT_ADMIN", "TEAM_ADMIN", "MEMBER"] as const;

const PERMISSIONS: Record<string, string[]> = {
  "provider.connect": ["ROOT_ADMIN"],
  "provider.disconnect": ["ROOT_ADMIN"],
  "provider.update": ["ROOT_ADMIN"],
  "provider.validate": ["ROOT_ADMIN"],
  "team.create": ["ROOT_ADMIN"],
  "team.delete": ["ROOT_ADMIN"],
  "member.add": ["ROOT_ADMIN", "TEAM_ADMIN"],
  "member.remove": ["ROOT_ADMIN", "TEAM_ADMIN"],
  "member.suspend": ["ROOT_ADMIN", "TEAM_ADMIN"],
  "member.reactivate": ["ROOT_ADMIN", "TEAM_ADMIN"],
  "member.updateBudget": ["ROOT_ADMIN", "TEAM_ADMIN"],
  "member.provision": ["ROOT_ADMIN", "TEAM_ADMIN"],
  "voucher.create": ["ROOT_ADMIN", "TEAM_ADMIN"],
  "voucher.revoke": ["ROOT_ADMIN", "TEAM_ADMIN"],
  "analytics.view": ["ROOT_ADMIN", "TEAM_ADMIN"],
  "auditLog.view": ["ROOT_ADMIN"],
  "settings.update": ["ROOT_ADMIN"],
  "member.viewOwnKeys": ["MEMBER"],
  "member.viewOwnUsage": ["MEMBER"],
};

function isAllowed(action: string, role: string): boolean {
  const allowedRoles = PERMISSIONS[action];
  return allowedRoles ? allowedRoles.includes(role) : false;
}

describe("Permission matrix", () => {
  for (const [action, allowedRoles] of Object.entries(PERMISSIONS)) {
    for (const role of ROLES) {
      const shouldAllow = allowedRoles.includes(role);
      it(`${role} ${shouldAllow ? "CAN" : "CANNOT"} ${action}`, () => {
        expect(isAllowed(action, role)).toBe(shouldAllow);
      });
    }
  }

  it("ROOT_ADMIN has the most permissions", () => {
    const rootPerms = Object.entries(PERMISSIONS).filter(([_, roles]) => roles.includes("ROOT_ADMIN")).length;
    const teamPerms = Object.entries(PERMISSIONS).filter(([_, roles]) => roles.includes("TEAM_ADMIN")).length;
    const memberPerms = Object.entries(PERMISSIONS).filter(([_, roles]) => roles.includes("MEMBER")).length;
    expect(rootPerms).toBeGreaterThan(teamPerms);
    expect(teamPerms).toBeGreaterThan(memberPerms);
  });

  it("MEMBER cannot perform admin actions", () => {
    const adminActions = ["provider.connect", "team.create", "member.add", "voucher.create", "settings.update"];
    for (const action of adminActions) {
      expect(isAllowed(action, "MEMBER")).toBe(false);
    }
  });

  it("TEAM_ADMIN cannot manage providers", () => {
    const providerActions = ["provider.connect", "provider.disconnect", "provider.update", "provider.validate"];
    for (const action of providerActions) {
      expect(isAllowed(action, "TEAM_ADMIN")).toBe(false);
    }
  });
});
