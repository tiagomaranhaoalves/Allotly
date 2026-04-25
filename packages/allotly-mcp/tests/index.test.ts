import { describe, it, expect, vi, beforeAll } from "vitest";
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import {
  readConfig,
  buildMcpRemoteArgs,
  setupSignalForwarding,
  missingKeyMessage,
  makeStderrPrefixer,
  decideParentExit,
  DEFAULT_URL,
  MCP_REMOTE_VERSION,
  type KillableChild,
  type SignalSource,
} from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distEntry = resolve(__dirname, "..", "dist", "index.js");

describe("readConfig", () => {
  it("returns an error when ALLOTLY_KEY is missing entirely", () => {
    const r = readConfig({});
    expect("error" in r).toBe(true);
    if ("error" in r) {
      expect(r.error).toContain("[allotly-mcp]");
      expect(r.error).toContain("ALLOTLY_KEY");
      expect(r.error).toContain("Claude Desktop");
      expect(r.error).toContain("Cursor");
      expect(r.error).toContain("https://allotly.ai/dashboard/keys");
    }
  });

  it("returns an error when ALLOTLY_KEY is the empty string", () => {
    const r = readConfig({ ALLOTLY_KEY: "" });
    expect("error" in r).toBe(true);
  });

  it("returns an error when ALLOTLY_KEY is whitespace only", () => {
    const r = readConfig({ ALLOTLY_KEY: "   \t\n" });
    expect("error" in r).toBe(true);
  });

  it("uses the default URL when ALLOTLY_MCP_URL is not set", () => {
    const r = readConfig({ ALLOTLY_KEY: "allotly_sk_test" });
    expect(r).toEqual({ key: "allotly_sk_test", url: DEFAULT_URL });
    expect(DEFAULT_URL).toBe("https://allotly.ai/mcp");
  });

  it("uses ALLOTLY_MCP_URL when explicitly set", () => {
    const r = readConfig({
      ALLOTLY_KEY: "allotly_sk_test",
      ALLOTLY_MCP_URL: "https://staging.allotly.ai/mcp",
    });
    expect(r).toEqual({
      key: "allotly_sk_test",
      url: "https://staging.allotly.ai/mcp",
    });
  });

  it("falls back to default URL when ALLOTLY_MCP_URL is whitespace only", () => {
    const r = readConfig({ ALLOTLY_KEY: "k", ALLOTLY_MCP_URL: "   " });
    if ("error" in r) throw new Error("expected config");
    expect(r.url).toBe(DEFAULT_URL);
  });

  it("trims surrounding whitespace from ALLOTLY_KEY", () => {
    const r = readConfig({ ALLOTLY_KEY: "  allotly_sk_x  " });
    if ("error" in r) throw new Error("expected config");
    expect(r.key).toBe("allotly_sk_x");
  });
});

describe("missingKeyMessage", () => {
  it("includes config snippets for both Claude Desktop and Cursor", () => {
    const msg = missingKeyMessage();
    expect(msg).toContain('"command": "npx"');
    expect(msg).toContain('"@allotly/mcp"');
    expect(msg).toContain("ALLOTLY_KEY");
    expect(msg).toContain("Claude Desktop");
    expect(msg).toContain("Cursor");
  });
});

describe("buildMcpRemoteArgs", () => {
  it("builds an npx command targeting the pinned mcp-remote version", () => {
    const spec = buildMcpRemoteArgs({ key: "abc", url: "https://x/mcp" });
    expect(spec.command).toBe("npx");
    expect(spec.args[0]).toBe("-y");
    expect(spec.args[1]).toBe(`mcp-remote@${MCP_REMOTE_VERSION}`);
    expect(spec.args).toContain("https://x/mcp");
  });

  it("passes the Authorization header with the bearer key", () => {
    const spec = buildMcpRemoteArgs({ key: "secret-key", url: DEFAULT_URL });
    const headerIdx = spec.args.indexOf("--header");
    expect(headerIdx).toBeGreaterThanOrEqual(0);
    expect(spec.args[headerIdx + 1]).toBe("Authorization: Bearer secret-key");
  });

  it("places the URL before --header so mcp-remote parses it as the positional URL arg", () => {
    const spec = buildMcpRemoteArgs({ key: "k", url: "https://example.com/mcp" });
    const urlIdx = spec.args.indexOf("https://example.com/mcp");
    const headerIdx = spec.args.indexOf("--header");
    expect(urlIdx).toBeGreaterThanOrEqual(0);
    expect(headerIdx).toBeGreaterThan(urlIdx);
  });
});

describe("setupSignalForwarding", () => {
  function makeChild(killed = false): KillableChild & { kill: ReturnType<typeof vi.fn> } {
    return { killed, kill: vi.fn(() => true) };
  }

  function makeSource(): {
    source: SignalSource;
    handlers: Partial<Record<NodeJS.Signals, () => void>>;
  } {
    const handlers: Partial<Record<NodeJS.Signals, () => void>> = {};
    const source: SignalSource = {
      on: (event, listener) => {
        handlers[event] = listener;
        return source;
      },
    };
    return { source, handlers };
  }

  it("forwards SIGINT to the child", () => {
    const child = makeChild();
    const { source, handlers } = makeSource();
    setupSignalForwarding(child, source);
    handlers.SIGINT?.();
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith("SIGINT");
  });

  it("forwards SIGTERM to the child", () => {
    const child = makeChild();
    const { source, handlers } = makeSource();
    setupSignalForwarding(child, source);
    handlers.SIGTERM?.();
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("does not call kill if the child is already killed", () => {
    const child = makeChild(true);
    const { source, handlers } = makeSource();
    setupSignalForwarding(child, source);
    handlers.SIGINT?.();
    handlers.SIGTERM?.();
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("registers a handler for every signal in the optional list", () => {
    const child = makeChild();
    const { source, handlers } = makeSource();
    setupSignalForwarding(child, source, ["SIGINT", "SIGTERM", "SIGHUP"]);
    expect(typeof handlers.SIGINT).toBe("function");
    expect(typeof handlers.SIGTERM).toBe("function");
    expect(typeof handlers.SIGHUP).toBe("function");
  });
});

describe("makeStderrPrefixer", () => {
  it("prefixes complete lines with [allotly-mcp]", () => {
    const lines: string[] = [];
    const p = makeStderrPrefixer((line) => lines.push(line));
    p.onData("first line\nsecond line\n");
    expect(lines).toEqual(["[allotly-mcp] first line\n", "[allotly-mcp] second line\n"]);
  });

  it("buffers partial lines until a newline arrives", () => {
    const lines: string[] = [];
    const p = makeStderrPrefixer((line) => lines.push(line));
    p.onData("partial");
    expect(lines).toEqual([]);
    p.onData(" continued\n");
    expect(lines).toEqual(["[allotly-mcp] partial continued\n"]);
  });

  it("flushes the trailing partial line on end()", () => {
    const lines: string[] = [];
    const p = makeStderrPrefixer((line) => lines.push(line));
    p.onData("no trailing newline");
    p.onEnd();
    expect(lines).toEqual(["[allotly-mcp] no trailing newline\n"]);
  });

  it("handles Buffer input", () => {
    const lines: string[] = [];
    const p = makeStderrPrefixer((line) => lines.push(line));
    p.onData(Buffer.from("hello\nworld\n", "utf8"));
    expect(lines).toEqual(["[allotly-mcp] hello\n", "[allotly-mcp] world\n"]);
  });

  it("never emits an unprefixed line", () => {
    const lines: string[] = [];
    const p = makeStderrPrefixer((line) => lines.push(line));
    p.onData("a\nb\nc\nd\n");
    p.onData("trailing");
    p.onEnd();
    for (const line of lines) {
      expect(line.startsWith("[allotly-mcp] ")).toBe(true);
    }
  });

  it("supports a custom prefix", () => {
    const lines: string[] = [];
    const p = makeStderrPrefixer((line) => lines.push(line), "PFX ");
    p.onData("x\n");
    expect(lines).toEqual(["PFX x\n"]);
  });
});

describe("decideParentExit", () => {
  it("propagates a numeric exit code", () => {
    expect(decideParentExit(0, null)).toEqual({ kind: "exit", code: 0 });
    expect(decideParentExit(1, null)).toEqual({ kind: "exit", code: 1 });
    expect(decideParentExit(42, null)).toEqual({ kind: "exit", code: 42 });
  });

  it("treats null exit code as 0", () => {
    expect(decideParentExit(null, null)).toEqual({ kind: "exit", code: 0 });
  });

  it("returns a signal decision when child died from a signal", () => {
    expect(decideParentExit(null, "SIGTERM")).toEqual({ kind: "signal", signal: "SIGTERM" });
    expect(decideParentExit(null, "SIGINT")).toEqual({ kind: "signal", signal: "SIGINT" });
  });

  it("prefers signal over code when both are set", () => {
    expect(decideParentExit(0, "SIGKILL")).toEqual({ kind: "signal", signal: "SIGKILL" });
  });
});

describe("CLI integration", () => {
  beforeAll(() => {
    if (!existsSync(distEntry)) {
      throw new Error(
        `dist/index.js not found at ${distEntry}. Run "npm run build" before "npm test".`,
      );
    }
  });

  it("exits 1 with the friendly message when ALLOTLY_KEY is empty", async () => {
    const result = await new Promise<{ code: number | null; stderr: string; stdout: string }>(
      (res, rej) => {
        const child = spawn("node", [distEntry], {
          env: { ...process.env, ALLOTLY_KEY: "" },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stderr = "";
        let stdout = "";
        child.stdout?.on("data", (c: Buffer) => {
          stdout += c.toString("utf8");
        });
        child.stderr?.on("data", (c: Buffer) => {
          stderr += c.toString("utf8");
        });
        child.on("error", rej);
        child.on("exit", (code) => res({ code, stderr, stdout }));
      },
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("[allotly-mcp]");
    expect(result.stderr).toContain("ALLOTLY_KEY");
    expect(result.stderr).toContain("Claude Desktop");
  });

  it("exits 1 when ALLOTLY_KEY is unset entirely", async () => {
    const env = { ...process.env };
    delete env.ALLOTLY_KEY;
    const result = await new Promise<{ code: number | null; stderr: string }>((res, rej) => {
      const child = spawn("node", [distEntry], {
        env,
        stdio: ["ignore", "ignore", "pipe"],
      });
      let stderr = "";
      child.stderr?.on("data", (c: Buffer) => {
        stderr += c.toString("utf8");
      });
      child.on("error", rej);
      child.on("exit", (code) => res({ code, stderr }));
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ALLOTLY_KEY");
  });
});
