import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { createCommitMeTool, registerCommitMeTool } from "../src/tools/commitme-tool.ts";

const execFileAsync = promisify(execFile);

function createExecutor(calls = []) {
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
  };
}

async function withTempRepo(fn) {
  const dir = await mkdtemp(join(tmpdir(), "commitme-tool-"));
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

test("registerCommitMeTool registers the commitme tool", () => {
  const registered = [];
  registerCommitMeTool({ ...createExecutor(), registerTool: (tool) => registered.push(tool) });

  assert.equal(registered.length, 1);
  assert.equal(registered[0].name, "commitme");
  assert.equal(registered[0].label, "CommitMe");
  assert.equal(registered[0].executionMode, "sequential");
  assert.match(registered[0].description, /\/commitme commits/);
  assert.match(registered[0].description, /\/commitme --confirm asks first/);
  assert.doesNotMatch(registered[0].description, /--commit/);
  assert.ok(registered[0].promptSnippet.includes("Lightweight Conventional Commit"));
  assert.ok(registered[0].promptGuidelines.every((guideline) => guideline.includes("commitme")));
  assert.match(JSON.stringify(registered[0].parameters), /gather/);
  assert.match(JSON.stringify(registered[0].parameters), /commit/);
  assert.match(JSON.stringify(registered[0].parameters), /steeringPrompt/);
});

test("commitme tool gathers compact context with structured details", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(join(dir, "feature.ts"), "export const feature = true;\n", "utf8");
    await execFileAsync("git", ["add", "feature.ts"], { cwd: dir });

    const tool = createCommitMeTool(createExecutor());
    const result = await tool.execute("tool-call", { action: "gather" }, undefined, undefined, { cwd: dir });
    const text = result.content[0].text;

    assert.match(text, /CommitMe gathered local git context/);
    assert.match(text, /Return only one Lightweight Conventional Commit subject line/);
    assert.match(text, /feature\.ts/);
    assert.equal(result.details.action, "gather");
    assert.match(result.details.statusPorcelain, /feature\.ts/);
    assert.equal(result.details.hasChanges, true);
    assert.ok(result.details.changedFiles.some((file) => file.path === "feature.ts"));
    assert.ok(Array.isArray(result.details.truncation));
  });
});

test("commitme tool includes steering prompt in gathered context", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(join(dir, "feature.ts"), "export const feature = true;\n", "utf8");

    const tool = createCommitMeTool(createExecutor());
    const result = await tool.execute(
      "tool-call",
      { action: "gather", steeringPrompt: "focus on tool steering support" },
      undefined,
      undefined,
      { cwd: dir },
    );

    assert.match(result.content[0].text, /User steering prompt:/);
    assert.match(result.content[0].text, /focus on tool steering support/);
    assert.equal(result.details.steeringPrompt, "focus on tool steering support");
  });
});

test("commitme tool sizes gather prompts for the active model", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(join(dir, "feature.ts"), "export const feature = true;\n", "utf8");

    const tool = createCommitMeTool(createExecutor());
    const result = await tool.execute(
      "tool-call",
      { action: "gather" },
      undefined,
      undefined,
      { cwd: dir, model: { contextWindow: 6_000, maxTokens: 1_024 } },
    );

    assert.equal(result.details.prompt.budgetProfile, "compact");
  });
});

test("commitme tool defaults to gather when action is omitted", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(join(dir, "feature.ts"), "export const feature = true;\n", "utf8");

    const tool = createCommitMeTool(createExecutor());
    const result = await tool.execute("tool-call", {}, undefined, undefined, { cwd: dir });

    assert.equal(result.details.action, "gather");
    assert.match(result.content[0].text, /feature\.ts/);
  });
});

test("commitme tool commit action cancels before mutation when confirmation is denied", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(join(dir, "feature.ts"), "export const feature = true;\n", "utf8");

    const calls = [];
    const tool = createCommitMeTool(createExecutor(calls));
    const result = await tool.execute(
      "tool-call",
      { action: "commit", message: "feat: add feature module", confirm: true },
      undefined,
      undefined,
      { cwd: dir, hasUI: true, ui: { confirm: async () => false } },
    );
    const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1"], { cwd: dir });

    assert.match(result.content[0].text, /cancelled/);
    assert.equal(result.details.action, "commit");
    assert.match(stdout, /\?\? feature\.ts/);
    assert.equal(calls.some((call) => call.args[0] === "add" || call.args[0] === "commit"), false);
  });
});

test("commitme tool commit action creates a commit with an explicit message", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(join(dir, "feature.ts"), "export const feature = true;\n", "utf8");

    const tool = createCommitMeTool(createExecutor());
    const result = await tool.execute(
      "tool-call",
      { action: "commit", message: "feat: add feature module", steeringPrompt: "ignored because message is final" },
      undefined,
      undefined,
      { cwd: dir, hasUI: false },
    );
    const { stdout } = await execFileAsync("git", ["log", "-1", "--pretty=%s"], { cwd: dir });

    assert.match(result.content[0].text, /Committed/);
    assert.equal(result.terminate, undefined);
    assert.equal(result.details.action, "commit");
    assert.equal(result.details.steeringPrompt, undefined);
    assert.equal(result.details.committed.subject, "feat: add feature module");
    assert.equal(stdout.trim(), "feat: add feature module");
  });
});

test("commitme tool message-less commit drafts and creates a commit", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(join(dir, "feature.ts"), "export const feature = true;\n", "utf8");

    const calls = [];
    const tool = createCommitMeTool(createExecutor(calls), {
      draftCommitMessage: async (prompt) => {
        assert.match(prompt, /feature\.ts/);
        return "feat: add feature module";
      },
    });
    const result = await tool.execute("tool-call", { action: "commit" }, undefined, undefined, { cwd: dir, hasUI: false });
    const { stdout } = await execFileAsync("git", ["log", "-1", "--pretty=%s"], { cwd: dir });

    assert.equal(result.content[0].text, `Committed ${result.details.committed.commitHash}: feat: add feature module`);
    assert.doesNotMatch(result.content[0].text, /REPOSITORY CONTEXT|Return only one Lightweight/);
    assert.equal(result.terminate, true);
    assert.equal(result.details.action, "commit");
    assert.equal(result.details.committed.subject, "feat: add feature module");
    assert.deepEqual(result.details.draft, []);
    assert.equal(stdout.trim(), "feat: add feature module");
    assert.ok(calls.some((call) => call.args[0] === "add"));
  });
});

test("commitme tool message-less commit includes steering and draft diagnostics in details", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(join(dir, "feature.ts"), "export const feature = true;\n", "utf8");

    const attempts = [
      {
        attempt: 1,
        purpose: "draft",
        maxTokens: 64,
        response: {
          stopReason: "stop",
          contentTypeCounts: { text: 1 },
          contentTypes: ["text"],
          textCharacterCount: 24,
          usableTextCharacterCount: 24,
          empty: false,
          thinkingOnly: false,
          lengthStopped: false,
        },
      },
    ];
    const tool = createCommitMeTool(createExecutor(), {
      draftCommitMessage: async (prompt) => {
        assert.match(prompt, /User steering prompt:/);
        assert.match(prompt, /prefer command parity wording/);
        return { message: "feat: add commit tool parity", attempts };
      },
    });
    const result = await tool.execute(
      "tool-call",
      { action: "commit", steeringPrompt: "prefer command parity wording" },
      undefined,
      undefined,
      { cwd: dir, hasUI: false },
    );

    assert.match(result.content[0].text, /Committed/);
    assert.equal(result.terminate, true);
    assert.equal(result.details.steeringPrompt, "prefer command parity wording");
    assert.equal(result.details.prompt.truncationCount >= 0, true);
    assert.deepEqual(result.details.draft, attempts);
  });
});

test("commitme tool message-less commit returns no-changes without drafting or staging", async () => {
  await withTempRepo(async (dir) => {
    const calls = [];
    const tool = createCommitMeTool(createExecutor(calls), {
      draftCommitMessage: async () => {
        throw new Error("drafting should not run when there are no changes");
      },
    });
    const result = await tool.execute("tool-call", { action: "commit" }, undefined, undefined, { cwd: dir, hasUI: false });

    assert.equal(result.content[0].text, "No staged or unstaged git changes found; no commit was created.");
    assert.equal(result.terminate, true);
    assert.equal(result.details.action, "commit");
    assert.equal(result.details.hasChanges, false);
    assert.equal(calls.some((call) => call.args[0] === "add" || call.args[0] === "commit"), false);
  });
});

test("commitme tool message-less commit asks confirmation after drafting the exact subject", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(join(dir, "feature.ts"), "export const feature = true;\n", "utf8");

    const calls = [];
    const confirmations = [];
    const tool = createCommitMeTool(createExecutor(calls), {
      draftCommitMessage: async () => "feat: add feature module",
    });
    const result = await tool.execute(
      "tool-call",
      { action: "commit", confirm: true },
      undefined,
      undefined,
      {
        cwd: dir,
        hasUI: true,
        ui: {
          confirm: async (title, body) => {
            confirmations.push({ title, body });
            return false;
          },
        },
      },
    );
    const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1"], { cwd: dir });

    assert.equal(result.content[0].text, "CommitMe commit cancelled; no git mutation was performed.");
    assert.equal(result.terminate, true);
    assert.equal(confirmations.length, 1);
    assert.match(confirmations[0].body, /feat: add feature module/);
    assert.match(stdout, /\?\? feature\.ts/);
    assert.equal(calls.some((call) => call.args[0] === "add" || call.args[0] === "commit"), false);
  });
});

test("commitme tool message-less commit rejects invalid drafts before staging", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(join(dir, "feature.ts"), "export const feature = true;\n", "utf8");

    const calls = [];
    const tool = createCommitMeTool(createExecutor(calls), { draftCommitMessage: async () => "update feature module" });
    await assert.rejects(
      () => tool.execute("tool-call", { action: "commit" }, undefined, undefined, { cwd: dir, hasUI: false }),
      /invalid commit message draft.*did not stage or commit/i,
    );
    const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1"], { cwd: dir });

    assert.match(stdout, /\?\? feature\.ts/);
    assert.equal(calls.some((call) => call.args[0] === "add" || call.args[0] === "commit"), false);
  });
});

test("commitme tool message-less commit fails without an active model before staging", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(join(dir, "feature.ts"), "export const feature = true;\n", "utf8");

    const calls = [];
    const tool = createCommitMeTool(createExecutor(calls));
    await assert.rejects(
      () => tool.execute("tool-call", { action: "commit" }, undefined, undefined, { cwd: dir, hasUI: false, model: undefined }),
      /No active Pi model/,
    );

    assert.equal(calls.some((call) => call.args[0] === "add" || call.args[0] === "commit"), false);
  });
});

test("commitme tool message-less commit fails fast when confirmation is unavailable", async () => {
  const calls = [];
  const tool = createCommitMeTool({
    async exec(command, args) {
      calls.push({ command, args });
      throw new Error("git should not run when message-less confirmation is unavailable");
    },
  });

  await assert.rejects(
    () => tool.execute("tool-call", { action: "commit", confirm: true }, undefined, undefined, { cwd: "/tmp", hasUI: false }),
    /confirm=true requires a UI-capable Pi mode/,
  );
  assert.equal(calls.length, 0);
});

test("commitme tool message-less commit aborts before staging when status changes after drafting", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(join(dir, "feature.ts"), "export const feature = true;\n", "utf8");

    const calls = [];
    const tool = createCommitMeTool(createExecutor(calls), {
      draftCommitMessage: async () => {
        await writeFile(join(dir, "late.ts"), "export const late = true;\n", "utf8");
        return "feat: add feature module";
      },
    });
    await assert.rejects(
      () => tool.execute("tool-call", { action: "commit" }, undefined, undefined, { cwd: dir, hasUI: false }),
      /Git status changed since CommitMe gathered context/,
    );
    const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1"], { cwd: dir });

    assert.match(stdout, /\?\? feature\.ts/);
    assert.match(stdout, /\?\? late\.ts/);
    assert.equal(calls.some((call) => call.args[0] === "add" || call.args[0] === "commit"), false);
  });
});

test("commitme tool commit action refuses sensitive changed files", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(join(dir, ".env"), "TOKEN=do-not-commit\n", "utf8");

    const tool = createCommitMeTool(createExecutor());
    await assert.rejects(
      () =>
        tool.execute(
          "tool-call",
          { action: "commit", message: "feat: add feature module" },
          undefined,
          undefined,
          { cwd: dir, hasUI: false },
        ),
      /known secret files or high-confidence secret tokens/,
    );
    const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1"], { cwd: dir });

    assert.match(stdout, /\?\? \.env/);
  });
});

test("commitme tool message-less commit refuses sensitive files before drafting", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(join(dir, ".env"), "TOKEN=do-not-commit\n", "utf8");

    const calls = [];
    const tool = createCommitMeTool(createExecutor(calls), {
      draftCommitMessage: async () => {
        throw new Error("drafting should not run for sensitive files");
      },
    });
    await assert.rejects(
      () => tool.execute("tool-call", { action: "commit" }, undefined, undefined, { cwd: dir, hasUI: false }),
      /known secret files or high-confidence secret tokens/,
    );
    const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1"], { cwd: dir });

    assert.match(stdout, /\?\? \.env/);
    assert.equal(calls.some((call) => call.args[0] === "add" || call.args[0] === "commit"), false);
  });
});

test("commitme tool commit action refuses unreadable changed files", { skip: process.platform === "win32" }, async () => {
  await withTempRepo(async (dir) => {
    const unreadablePath = join(dir, "unreadable.txt");
    await writeFile(unreadablePath, "content that cannot be scanned\n", "utf8");
    await chmod(unreadablePath, 0o000);

    try {
      const calls = [];
      const tool = createCommitMeTool(createExecutor(calls));
      await assert.rejects(
        () =>
          tool.execute(
            "tool-call",
            { action: "commit", message: "feat: add unreadable fixture" },
            undefined,
            undefined,
            { cwd: dir, hasUI: false },
          ),
        /unreadable changed files/,
      );
      const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1"], { cwd: dir });

      assert.match(stdout, /\?\? unreadable\.txt/);
      assert.equal(calls.some((call) => call.args[0] === "add" || call.args[0] === "commit"), false);
    } finally {
      await chmod(unreadablePath, 0o600).catch(() => {});
    }
  });
});

test("commitme tool commit action treats whitespace messages as invalid explicit input before reading git", async () => {
  const calls = [];
  const tool = createCommitMeTool(
    {
      async exec(command, args) {
        calls.push({ command, args });
        throw new Error("git should not run with an empty explicit commit subject");
      },
    },
    {
      draftCommitMessage: async () => {
        throw new Error("drafting should not run for whitespace explicit messages");
      },
    },
  );

  await assert.rejects(
    () => tool.execute("tool-call", { action: "commit", message: "   " }, undefined, undefined, { cwd: "/tmp", hasUI: false }),
    /requires a final one-line Lightweight Conventional Commit subject/,
  );
  assert.equal(calls.length, 0);
});

test("commitme tool commit action rejects invalid messages before reading git", async () => {
  const calls = [];
  const tool = createCommitMeTool({
    async exec(command, args) {
      calls.push({ command, args });
      throw new Error("git should not run with an invalid commit subject");
    },
  });

  await assert.rejects(
    () =>
      tool.execute(
        "tool-call",
        { action: "commit", message: "update the docs" },
        undefined,
        undefined,
        { cwd: "/tmp", hasUI: false },
      ),
    /invalid Lightweight Conventional Commit subject/,
  );
  assert.equal(calls.length, 0);
});

test("commitme tool commit action fails fast when confirmation is unavailable", async () => {
  const calls = [];
  const tool = createCommitMeTool({
    async exec(command, args) {
      calls.push({ command, args });
      throw new Error("git should not run when confirmation is unavailable");
    },
  });

  await assert.rejects(
    () =>
      tool.execute(
        "tool-call",
        { action: "commit", message: "feat: add feature module", confirm: true },
        undefined,
        undefined,
        { cwd: "/tmp", hasUI: false },
      ),
    /confirm=true requires a UI-capable Pi mode/,
  );
  assert.equal(calls.length, 0);
});
