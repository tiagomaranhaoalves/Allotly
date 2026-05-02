import { describe, it, expect, vi, beforeEach } from "vitest";

type MockUser = { id: string; orgRole: "ROOT_ADMIN" | "TEAM_ADMIN" | "MEMBER" };
const userStore: Record<string, MockUser> = {};

vi.mock("../server/storage", () => ({
  storage: {
    getUser: async (id: string) => userStore[id] ?? null,
  },
}));

function makeRes() {
  let statusCode = 200;
  let body: any = null;
  const res: any = {
    status(code: number) { statusCode = code; return res; },
    json(payload: any) { body = payload; return res; },
    get statusCode() { return statusCode; },
    get body() { return body; },
  };
  return res;
}

beforeEach(() => {
  for (const k of Object.keys(userStore)) delete userStore[k];
});

describe("requireRole('ROOT_ADMIN') — actual middleware behavior", () => {
  it("calls next() when the session belongs to a ROOT_ADMIN", async () => {
    userStore["u-root"] = { id: "u-root", orgRole: "ROOT_ADMIN" };
    const { requireRole } = await import("../server/auth");
    const mw = requireRole("ROOT_ADMIN");
    const req: any = { session: { userId: "u-root" } };
    const res = makeRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBe(200); // untouched
  });

  it("returns 403 Forbidden when the session is TEAM_ADMIN", async () => {
    userStore["u-ta"] = { id: "u-ta", orgRole: "TEAM_ADMIN" };
    const { requireRole } = await import("../server/auth");
    const mw = requireRole("ROOT_ADMIN");
    const req: any = { session: { userId: "u-ta" } };
    const res = makeRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it("returns 403 Forbidden when the session is a plain MEMBER", async () => {
    userStore["u-m"] = { id: "u-m", orgRole: "MEMBER" };
    const { requireRole } = await import("../server/auth");
    const mw = requireRole("ROOT_ADMIN");
    const req: any = { session: { userId: "u-m" } };
    const res = makeRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it("returns 401 Unauthorized when there is no session", async () => {
    const { requireRole } = await import("../server/auth");
    const mw = requireRole("ROOT_ADMIN");
    const req: any = { session: {} };
    const res = makeRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 when the userId resolves to no user (stale session)", async () => {
    const { requireRole } = await import("../server/auth");
    const mw = requireRole("ROOT_ADMIN");
    const req: any = { session: { userId: "u-missing" } };
    const res = makeRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
  });
});

describe("requireRole multi-role behavior", () => {
  it("allows any of the listed roles through", async () => {
    userStore["u-ta2"] = { id: "u-ta2", orgRole: "TEAM_ADMIN" };
    const { requireRole } = await import("../server/auth");
    const mw = requireRole("ROOT_ADMIN", "TEAM_ADMIN");
    const req: any = { session: { userId: "u-ta2" } };
    const res = makeRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it("still rejects roles outside the allowlist", async () => {
    userStore["u-m2"] = { id: "u-m2", orgRole: "MEMBER" };
    const { requireRole } = await import("../server/auth");
    const mw = requireRole("ROOT_ADMIN", "TEAM_ADMIN");
    const req: any = { session: { userId: "u-m2" } };
    const res = makeRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
  });
});
