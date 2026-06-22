import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
    assert.equal(calls.some((call) => call.args.join(" ") === "add -A" || call.args[0] === "commit"), false);
  });
});

test("commitme tool commit action creates a commit with an explicit message", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(join(dir, "feature.ts"), "export const feature = true;\n", "utf8");

    const tool = createCommitMeTool(createExecutor());
    const result = await tool.execute(
      "tool-call",
      { action: "commit", message: "feat: add feature module" },
      undefined,
      undefined,
      { cwd: dir, hasUI: false },
    );
    const { stdout } = await execFileAsync("git", ["log", "-1", "--pretty=%s"], { cwd: dir });

    assert.match(result.content[0].text, /Committed/);
    assert.equal(result.details.action, "commit");
    assert.equal(result.details.committed.subject, "feat: add feature module");
    assert.equal(stdout.trim(), "feat: add feature module");
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

test("commitme tool commit action requires an explicit message before reading git", async () => {
  const calls = [];
  const tool = createCommitMeTool({
    async exec(command, args) {
      calls.push({ command, args });
      throw new Error("git should not run without a commit subject");
    },
  });

  await assert.rejects(
    () => tool.execute("tool-call", { action: "commit" }, undefined, undefined, { cwd: "/tmp", hasUI: false }),
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
