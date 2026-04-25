#!/usr/bin/env node
import { spawn, type ChildProcess } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const DEFAULT_URL = "https://allotly.ai/mcp";

export const MCP_REMOTE_VERSION = "0.1.38";

export interface Config {
  key: string;
  url: string;
}

export type ConfigResult = Config | { error: string };

export function readConfig(env: NodeJS.ProcessEnv): ConfigResult {
  const rawKey = env.ALLOTLY_KEY ?? "";
  const key = rawKey.trim();
  if (!key) {
    return { error: missingKeyMessage() };
  }
  const rawUrl = env.ALLOTLY_MCP_URL ?? "";
  const url = rawUrl.trim() || DEFAULT_URL;
  return { key, url };
}

export function missingKeyMessage(): string {
  return [
    "[allotly-mcp] ALLOTLY_KEY is not set.",
    "",
    "Allotly MCP requires an Allotly API key to authenticate. Set it",
    "in your MCP host's config under the env block.",
    "",
    "Claude Desktop:",
    "  Edit ~/Library/Application Support/Claude/claude_desktop_config.json",
    "  (macOS) or %APPDATA%\\Claude\\claude_desktop_config.json (Windows):",
    "",
    '    {',
    '      "mcpServers": {',
    '        "allotly": {',
    '          "command": "npx",',
    '          "args": ["-y", "@allotly/mcp"],',
    '          "env": { "ALLOTLY_KEY": "allotly_sk_..." }',
    '        }',
    '      }',
    '    }',
    "",
    "Cursor:",
    "  Edit .cursor/mcp.json in your project root:",
    "",
    '    {',
    '      "mcpServers": {',
    '        "allotly": {',
    '          "command": "npx",',
    '          "args": ["-y", "@allotly/mcp"],',
    '          "env": { "ALLOTLY_KEY": "allotly_sk_..." }',
    '        }',
    '      }',
    '    }',
    "",
    "Get a key at https://allotly.ai/dashboard/keys",
  ].join("\n");
}

export interface SpawnSpec {
  command: string;
  args: string[];
}

export function buildMcpRemoteArgs(config: Config): SpawnSpec {
  return {
    command: "npx",
    args: [
      "-y",
      `mcp-remote@${MCP_REMOTE_VERSION}`,
      config.url,
      "--header",
      `Authorization: Bearer ${config.key}`,
    ],
  };
}

export interface KillableChild {
  killed: boolean;
  kill: (signal?: NodeJS.Signals | number) => boolean;
}

export interface SignalSource {
  on: (event: NodeJS.Signals, listener: () => void) => unknown;
}

export function setupSignalForwarding(
  child: KillableChild,
  source: SignalSource,
  signals: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM"],
): void {
  for (const sig of signals) {
    source.on(sig, () => {
      if (!child.killed) {
        child.kill(sig);
      }
    });
  }
}

export interface StderrPrefixer {
  onData: (chunk: Buffer | string) => void;
  onEnd: () => void;
}

export function makeStderrPrefixer(
  write: (line: string) => void,
  prefix: string = "[allotly-mcp] ",
): StderrPrefixer {
  let buf = "";
  return {
    onData: (chunk: Buffer | string) => {
      buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        write(`${prefix}${line}\n`);
      }
    },
    onEnd: () => {
      if (buf.length > 0) {
        write(`${prefix}${buf}\n`);
        buf = "";
      }
    },
  };
}

function pipeStderrWithPrefix(child: ChildProcess): void {
  const prefixer = makeStderrPrefixer((line) => process.stderr.write(line));
  child.stderr?.on("data", prefixer.onData);
  child.stderr?.on("end", prefixer.onEnd);
}

export interface ExitDecision {
  kind: "exit" | "signal";
  code?: number;
  signal?: NodeJS.Signals;
}

export function decideParentExit(
  childCode: number | null,
  childSignal: NodeJS.Signals | null,
): ExitDecision {
  if (childSignal) {
    return { kind: "signal", signal: childSignal };
  }
  return { kind: "exit", code: childCode ?? 0 };
}

export function main(): void {
  const cfg = readConfig(process.env);
  if ("error" in cfg) {
    process.stderr.write(cfg.error + "\n");
    process.exit(1);
  }

  const { command, args } = buildMcpRemoteArgs(cfg);
  const child = spawn(command, args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  });

  if (child.stdin) {
    process.stdin.pipe(child.stdin);
  }
  if (child.stdout) {
    child.stdout.pipe(process.stdout);
  }
  pipeStderrWithPrefix(child);

  setupSignalForwarding(child, process);

  child.on("error", (err: Error) => {
    process.stderr.write(
      `[allotly-mcp] failed to spawn mcp-remote: ${err.message}\n`,
    );
    process.exit(1);
  });

  child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
    const decision = decideParentExit(code, signal);
    if (decision.kind === "signal" && decision.signal) {
      process.kill(process.pid, decision.signal);
    } else {
      process.exit(decision.code ?? 0);
    }
  });
}

function invokedAsCli(): boolean {
  const argv1 = process.argv[1];
  if (typeof argv1 !== "string" || argv1.length === 0) {
    return false;
  }
  // Resolve symlinks so npm-installed bins (which create a shim symlink in
  // node_modules/.bin pointing at this file) compare equal to import.meta.url.
  let resolved: string;
  try {
    resolved = realpathSync(argv1);
  } catch {
    resolved = argv1;
  }
  return import.meta.url === pathToFileURL(resolved).href;
}

if (invokedAsCli()) {
  main();
}
