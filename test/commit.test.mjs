import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  assertNoUnsafeCommitFiles,
  CommitMeCommitError,
  createCommit,
  extractCommitMessage,
  findUnsafeCommitFiles,
  validateCommitMessage,
} from "../src/git/commit.ts";

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
  const dir = await mkdtemp(join(tmpdir(), "commitme-commit-"));
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


test("extractCommitMessage strips simple model wrappers", () => {
  assert.equal(extractCommitMessage("Commit message: feat: add commit helper"), "feat: add commit helper");
  assert.equal(extractCommitMessage("```\nfix: handle errors\n```"), "fix: handle errors");
  assert.equal(extractCommitMessage('"docs: update README"'), "docs: update README");
});

test("extractCommitMessage does not strip mismatched quotes", () => {
  assert.equal(extractCommitMessage('"docs: update README\''), '"docs: update README\'');
});

test("validateCommitMessage rejects empty messages", () => {
  const result = validateCommitMessage("   ");

  assert.equal(result.ok, false);
  assert.match(result.error, /empty/);
});

test("validateCommitMessage accepts valid subject-only Conventional Commits", () => {
  const result = validateCommitMessage("feat(cli): add commit drafting");

  assert.equal(result.ok, true);
  assert.equal(result.subject, "feat(cli): add commit drafting");
  assert.equal(result.body, "");
});

test("validateCommitMessage accepts subject plus body", () => {
  const result = validateCommitMessage("fix: handle git failures\n\nReport hook errors clearly.");

  assert.equal(result.ok, true);
  assert.equal(result.subject, "fix: handle git failures");
  assert.equal(result.body, "Report hook errors clearly.");
  assert.equal(result.message, "fix: handle git failures\n\nReport hook errors clearly.");
});

test("validateCommitMessage rejects malformed subjects", () => {
  const result = validateCommitMessage("update the docs");

  assert.equal(result.ok, false);
  assert.match(result.error, /Lightweight Conventional Commit/);
});

test("validateCommitMessage rejects summaries ending with a period", () => {
  const result = validateCommitMessage("fix(api): handle expired tokens.");

  assert.equal(result.ok, false);
  assert.match(result.error, /must not end with a period/);
});

test("validateCommitMessage accepts breaking change footers", () => {
  const result = validateCommitMessage("feat(api)!: change token contract\n\nBREAKING CHANGE: refresh tokens are now opaque.");

  assert.equal(result.ok, true);
  assert.equal(result.subject, "feat(api)!: change token contract");
  assert.match(result.body, /BREAKING CHANGE/);
});

test("findUnsafeCommitFiles blocks known secret paths and high-confidence secret content", () => {
  const unsafe = findUnsafeCommitFiles([
    { path: ".env", status: "??", scope: "unstaged", sensitive: true, generated: false, binary: false },
    { path: ".aws/credentials", status: "D", scope: "unstaged", sensitive: true, generated: false, binary: false },
    { path: "src/index.ts", status: "M", scope: "unstaged", sensitive: false, generated: false, binary: false },
    { path: "src/example.ts", status: "M", scope: "unstaged", sensitive: true, generated: false, binary: false },
    {
      path: "src/leaked-key.ts",
      status: "M",
      scope: "unstaged",
      sensitive: true,
      generated: false,
      binary: false,
      secretContent: true,
    },
  ]);

  assert.deepEqual(unsafe.map((file) => file.path), [".env", "src/leaked-key.ts"]);
  assert.throws(
    () => assertNoUnsafeCommitFiles(unsafe),
    (error) => error instanceof CommitMeCommitError && error.code === "unsafe-sensitive-files",
  );
});

test("createCommit stages all changes and creates a commit", async () => {
  await withTempRepo(async (dir) => {
    const calls = [];
    await writeFile(join(dir, "feature.ts"), "export const feature = true;\n", "utf8");

    const result = await createCommit(createExecutor(calls), { cwd: dir, message: "feat: add feature module" });
    const { stdout } = await execFileAsync("git", ["log", "-1", "--pretty=%s"], { cwd: dir });

    assert.match(result.commitHash, /^[0-9a-f]{7,}$/);
    assert.equal(result.subject, "feat: add feature module");
    assert.equal(stdout.trim(), "feat: add feature module");
    assert.deepEqual(calls.slice(0, 2).map((call) => call.args.join(" ")), ["add -A", "status --porcelain=v1"]);
  });
});

test("createCommit reports no-change failures clearly", async () => {
  await withTempRepo(async (dir) => {
    await assert.rejects(
      () => createCommit(createExecutor(), { cwd: dir, message: "chore: try empty commit" }),
      (error) => error instanceof CommitMeCommitError && error.code === "no-changes",
    );
  });
});

test("createCommit aborts before staging when git status changed after context gathering", async () => {
  await withTempRepo(async (dir) => {
    const calls = [];
    const { stdout: expectedStatus } = await execFileAsync("git", ["status", "--porcelain=v1", "--branch", "-uall"], {
      cwd: dir,
    });
    await writeFile(join(dir, "feature.ts"), "export const feature = true;\n", "utf8");

    await assert.rejects(
      () =>
        createCommit(createExecutor(calls), {
          cwd: dir,
          message: "feat: add feature module",
          expectedStatusPorcelain: expectedStatus.trim(),
        }),
      (error) => error instanceof CommitMeCommitError && error.code === "working-tree-changed",
    );

    assert.equal(calls.some((call) => call.args.join(" ") === "add -A"), false);
    const { stdout: status } = await execFileAsync("git", ["status", "--porcelain=v1"], { cwd: dir });
    assert.match(status, /\?\? feature\.ts/);
  });
});

test("createCommit reports git hook failures clearly", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(join(dir, ".git", "hooks", "pre-commit"), "#!/bin/sh\necho hook failed >&2\nexit 1\n", "utf8");
    await chmod(join(dir, ".git", "hooks", "pre-commit"), 0o755);
    await writeFile(join(dir, "feature.ts"), "export const feature = true;\n", "utf8");

    await assert.rejects(
      () => createCommit(createExecutor(), { cwd: dir, message: "feat: add feature module" }),
      (error) => error instanceof CommitMeCommitError && error.code === "git-commit-failed" && /hook failed/.test(error.stderr),
    );
  });
});

test("source does not contain git push", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/git/commit.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /git push|\["push"\]/);
});
