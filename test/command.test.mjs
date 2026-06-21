import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { buildCommitMeHelpText, registerCommitMeCommand } from "../src/commands/commitme-command.ts";

const execFileAsync = promisify(execFile);

function createPi(calls, messages, registered) {
  return {
    async exec(command, args, options = {}) {
      calls.push({ command, args });
      try {
        const { stdout, stderr } = await execFileAsync(command, args, {
          cwd: options.cwd,
          timeout: options.timeout,
        });
        return { stdout, stderr, code: 0, killed: false };
      } catch (error) {
        return {
          stdout: error.stdout ?? "",
          stderr: error.stderr ?? error.message,
          code: typeof error.code === "number" ? error.code : 1,
          killed: Boolean(error.killed),
        };
      }
    },
    sendMessage(message, options) {
      messages.push({ ...message, options });
    },
    registerCommand(name, command) {
      registered.set(name, command);
    },
  };
}

async function withTempRepo(fn) {
  const dir = await mkdtemp(join(tmpdir(), "commitme-command-"));
  try {
    await execFileAsync("git", ["init"], { cwd: dir });
    await execFileAsync("git", ["config", "user.email", "commitme@example.invalid"], { cwd: dir });
    await execFileAsync("git", ["config", "user.name", "CommitMe Test"], { cwd: dir });
    await writeFile(join(dir, "README.md"), "# Fixture\n", "utf8");
    await execFileAsync("git", ["add", "README.md"], { cwd: dir });
    await execFileAsync("git", ["commit", "-m", "chore: initial fixture"], { cwd: dir });
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function createCtx(dir, notifications, confirm = async () => true, hasUI = true) {
  return {
    cwd: dir,
    signal: undefined,
    hasUI,
    ui: {
      notify(message, type) {
        notifications.push({ message, type });
      },
      confirm,
    },
    isIdle: () => true,
    waitForIdle: async () => {},
  };
}

test("registerCommitMeCommand registers /commitme with a useful description", () => {
  const registered = new Map();
  registerCommitMeCommand(createPi([], [], registered), { draftCommitMessage: async () => "feat: add feature" });

  assert.equal(registered.has("commitme"), true);
  assert.match(registered.get("commitme").description, /Conventional Commit/);
});

test("buildCommitMeHelpText explains commands and safety", () => {
  const help = buildCommitMeHelpText();

  assert.match(help, /\/commitme --confirm/);
  assert.match(help, /\/commitme help/);
  assert.doesNotMatch(help, /--commit/);
  assert.match(help, /never runs `git push`/);
  assert.match(help, /Lightweight Conventional Commit/);
});

test("/commitme help displays help without running git or model drafting", async () => {
  const calls = [];
  const messages = [];
  const notifications = [];
  const registered = new Map();
  const pi = createPi(calls, messages, registered);
  registerCommitMeCommand(pi, {
    draftCommitMessage: async () => {
      throw new Error("drafting should not run for help");
    },
  });

  await registered.get("commitme").handler("help", createCtx("/tmp", notifications));

  assert.equal(calls.length, 0);
  assert.equal(messages.length, 1);
  assert.match(messages[0].content, /CommitMe help/);
  assert.deepEqual(messages[0].options, { triggerTurn: false });
  assert.equal(notifications.length, 0);
});

test("/commitme creates a commit without prompting by default", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(join(dir, "feature.ts"), "export const feature = true;\n", "utf8");

    const calls = [];
    const messages = [];
    const notifications = [];
    const registered = new Map();
    const pi = createPi(calls, messages, registered);
    registerCommitMeCommand(pi, {
      draftCommitMessage: async (prompt) => {
        assert.match(prompt, /feature\.ts/);
        return "feat: add feature module";
      },
    });

    await registered.get("commitme").handler("", createCtx(dir, notifications, async () => {
      throw new Error("confirm should not be called");
    }));
    const { stdout } = await execFileAsync("git", ["log", "-1", "--pretty=%s"], { cwd: dir });

    assert.equal(stdout.trim(), "feat: add feature module");
    assert.equal(messages.length, 1);
    assert.match(messages[0].content, /Committed/);
    assert.equal(messages[0].details.action, "commit");
    assert.equal(notifications.some((notice) => /committed/.test(notice.message)), false);
    assert.ok(calls.some((call) => call.args.join(" ") === "add -A"));
  });
});

test("/commitme bounds oversized prompts before model drafting", async () => {
  await withTempRepo(async (dir) => {
    const stagedLines = Array.from({ length: 2500 }, (_, index) => `staged ${index} ${"x".repeat(36)}`).join("\n");
    const readmeLines = Array.from({ length: 2500 }, (_, index) => `readme ${index} ${"y".repeat(36)}`).join("\n");
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "large-fixture", description: "z".repeat(20_000) }), "utf8");
    await writeFile(join(dir, "staged-big.txt"), `${stagedLines}\n`, "utf8");
    await execFileAsync("git", ["add", "staged-big.txt"], { cwd: dir });
    await writeFile(join(dir, "README.md"), `${readmeLines}\n`, "utf8");

    const messages = [];
    const registered = new Map();
    const pi = createPi([], messages, registered);
    registerCommitMeCommand(pi, {
      draftCommitMessage: async (prompt) => {
        assert.ok(Buffer.byteLength(prompt, "utf8") < 49_200);
        assert.match(prompt, /\[Truncated commitme prompt:/);
        assert.match(prompt, /Return only the commit message now\.$/);
        return "feat: handle large commit context";
      },
    });

    await registered.get("commitme").handler("", createCtx(dir, []));

    assert.equal(messages[0].details.action, "commit");
    assert.ok(messages[0].details.truncation.some((entry) => entry.label === "commitme prompt" && entry.truncated));
  });
});

test("/commitme --commit remains a non-confirming commit alias", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(join(dir, "feature.ts"), "export const feature = true;\n", "utf8");

    const calls = [];
    const messages = [];
    const notifications = [];
    const registered = new Map();
    const pi = createPi(calls, messages, registered);
    registerCommitMeCommand(pi, { draftCommitMessage: async () => "feat: add feature module" });

    await registered.get("commitme").handler("--commit", createCtx(dir, notifications, async () => {
      throw new Error("confirm should not be called");
    }));
    const { stdout } = await execFileAsync("git", ["log", "-1", "--pretty=%s"], { cwd: dir });

    assert.equal(stdout.trim(), "feat: add feature module");
    assert.equal(messages[0].details.action, "commit");
    assert.ok(calls.some((call) => call.args.join(" ") === "add -A"));
  });
});

test("/commitme refuses sensitive changed files before drafting or staging", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(join(dir, ".env"), "TOKEN=do-not-commit\n", "utf8");

    const calls = [];
    const messages = [];
    const notifications = [];
    const registered = new Map();
    const pi = createPi(calls, messages, registered);
    registerCommitMeCommand(pi, {
      draftCommitMessage: async () => {
        throw new Error("drafting should not run for sensitive files");
      },
    });

    await assert.rejects(
      () => registered.get("commitme").handler("", createCtx(dir, notifications)),
      /known secret files or high-confidence secret tokens/,
    );
    const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1"], { cwd: dir });

    assert.equal(messages.length, 0);
    assert.match(stdout, /\?\? \.env/);
    assert.equal(calls.some((call) => call.args.join(" ") === "add -A" || call.args[0] === "commit"), false);
  });
});

test("/commitme aborts before staging when git status changes after drafting", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(join(dir, "feature.ts"), "export const feature = true;\n", "utf8");

    const calls = [];
    const messages = [];
    const notifications = [];
    const registered = new Map();
    const pi = createPi(calls, messages, registered);
    registerCommitMeCommand(pi, {
      draftCommitMessage: async () => {
        await writeFile(join(dir, "late.ts"), "export const late = true;\n", "utf8");
        return "feat: add feature module";
      },
    });

    await assert.rejects(
      () => registered.get("commitme").handler("", createCtx(dir, notifications)),
      /Git status changed since CommitMe gathered context/,
    );
    const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1"], { cwd: dir });

    assert.equal(messages.length, 0);
    assert.match(stdout, /\?\? feature\.ts/);
    assert.match(stdout, /\?\? late\.ts/);
    assert.equal(calls.some((call) => call.args.join(" ") === "add -A" || call.args[0] === "commit"), false);
  });
});

test("/commitme --confirm cancels before mutation", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(join(dir, "feature.ts"), "export const feature = true;\n", "utf8");

    const calls = [];
    const messages = [];
    const notifications = [];
    const registered = new Map();
    const pi = createPi(calls, messages, registered);
    registerCommitMeCommand(pi, { draftCommitMessage: async () => "feat: add feature module" });

    await registered.get("commitme").handler("--confirm", createCtx(dir, notifications, async () => false));
    const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1"], { cwd: dir });

    assert.equal(messages.length, 0);
    assert.match(stdout, /\?\? feature\.ts/);
    assert.equal(calls.some((call) => call.args.join(" ") === "add -A" || call.args[0] === "commit"), false);
    assert.ok(notifications.some((notice) => /commit cancelled/.test(notice.message)));
  });
});

test("/commitme --confirm fails safely without UI", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(join(dir, "feature.ts"), "export const feature = true;\n", "utf8");

    const calls = [];
    const messages = [];
    const notifications = [];
    const registered = new Map();
    const pi = createPi(calls, messages, registered);
    registerCommitMeCommand(pi, { draftCommitMessage: async () => "feat: add feature module" });

    await assert.rejects(
      () => registered.get("commitme").handler("--confirm", createCtx(dir, notifications, async () => true, false)),
      /--confirm requires a UI-capable Pi mode/,
    );
    assert.equal(messages.length, 0);
    assert.equal(calls.some((call) => call.args.join(" ") === "add -A" || call.args[0] === "commit"), false);
  });
});
