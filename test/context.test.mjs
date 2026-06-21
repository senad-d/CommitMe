import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { appendFile, chmod, mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  gatherGitContext,
  getRepositoryRoot,
  GitCommandError,
  parseNameStatusZ,
  parseStatusPorcelainZ,
  runGit,
} from "../src/git/context.ts";

const execFileAsync = promisify(execFile);

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), "commitme-context-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function createExecutor(calls = []) {
  return {
    async exec(command, args, options = {}) {
      calls.push({ command, args, options });
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

async function git(cwd, args) {
  await execFileAsync("git", args, { cwd });
}

async function initRepo(dir) {
  await git(dir, ["init"]);
  await git(dir, ["config", "user.email", "commitme@example.invalid"]);
  await git(dir, ["config", "user.name", "CommitMe Test"]);
  await writeFile(join(dir, "README.md"), "# Fixture\n", "utf8");
  await git(dir, ["add", "README.md"]);
  await git(dir, ["commit", "-m", "chore: initial fixture"]);
}

test("getRepositoryRoot detects the git repository root", async () => {
  await withTempDir(async (dir) => {
    await execFileAsync("git", ["init"], { cwd: dir });
    const calls = [];
    const root = await getRepositoryRoot(createExecutor(calls), { cwd: dir });

    assert.equal(root, await realpath(dir));
    assert.equal(calls[0].command, "git");
    assert.deepEqual(calls[0].args, ["rev-parse", "--show-toplevel"]);
    assert.equal(calls[0].options.timeout, 5000);
  });
});

test("getRepositoryRoot returns a clear non-git error outside repositories", async () => {
  await withTempDir(async (dir) => {
    await assert.rejects(
      () => getRepositoryRoot(createExecutor(), { cwd: dir }),
      (error) => error instanceof GitCommandError && error.code === "not-a-git-repository",
    );
  });
});

test("runGit throws structured errors for failed git commands", async () => {
  await withTempDir(async (dir) => {
    const executor = createExecutor();
    await assert.rejects(
      () => runGit(executor, ["not-a-real-subcommand"], { cwd: dir }),
      (error) => error instanceof GitCommandError && error.code === "git-command-failed",
    );
  });
});

test("parseNameStatusZ handles renamed paths with spaces", () => {
  const files = parseNameStatusZ("R100\0.env\0new name.txt\0", "staged");

  assert.equal(files.length, 1);
  assert.equal(files[0].path, "new name.txt");
  assert.equal(files[0].status, "R100");
  assert.equal(files[0].scope, "staged");
  assert.equal(files[0].sensitive, true);
});

test("parseStatusPorcelainZ handles untracked paths with spaces", () => {
  const files = parseStatusPorcelainZ("?? space file.txt\0");

  assert.equal(files.length, 1);
  assert.equal(files[0].path, "space file.txt");
  assert.equal(files[0].status, "??");
  assert.equal(files[0].scope, "unstaged");
});

test("gatherGitContext captures staged-only changes", async () => {
  await withTempDir(async (dir) => {
    await initRepo(dir);
    await writeFile(join(dir, "src.ts"), "export const value = 1;\n", "utf8");
    await git(dir, ["add", "src.ts"]);

    const context = await gatherGitContext(createExecutor(), { cwd: dir });

    assert.equal(context.hasChanges, true);
    assert.ok(context.statusPorcelain.includes("A  src.ts"));
    assert.ok(context.changedFiles.some((file) => file.scope === "staged" && file.path === "src.ts"));
    assert.match(context.staged.stat, /src\.ts/);
    assert.match(context.staged.excerpt, /export const value/);
  });
});

test("gatherGitContext captures unstaged-only changes", async () => {
  await withTempDir(async (dir) => {
    await initRepo(dir);
    await appendFile(join(dir, "README.md"), "\nMore details.\n", "utf8");

    const context = await gatherGitContext(createExecutor(), { cwd: dir });

    assert.equal(context.hasChanges, true);
    assert.ok(context.changedFiles.some((file) => file.scope === "unstaged" && file.path === "README.md"));
    assert.match(context.unstaged.stat, /README\.md/);
    assert.match(context.unstaged.excerpt, /More details/);
  });
});

test("gatherGitContext captures mixed staged and unstaged changes", async () => {
  await withTempDir(async (dir) => {
    await initRepo(dir);
    await mkdir(join(dir, "src"));
    await writeFile(join(dir, "src", "feature.ts"), "export const feature = true;\n", "utf8");
    await git(dir, ["add", "src/feature.ts"]);
    await appendFile(join(dir, "README.md"), "\nUsage notes.\n", "utf8");

    const context = await gatherGitContext(createExecutor(), { cwd: dir });
    const keys = context.changedFiles.map((file) => `${file.scope}:${file.path}`).sort();

    assert.ok(keys.includes("staged:src/feature.ts"));
    assert.ok(keys.includes("unstaged:README.md"));
    assert.match(context.staged.stat, /feature\.ts/);
    assert.match(context.unstaged.stat, /README\.md/);
  });
});

test("gatherGitContext captures untracked paths with spaces", async () => {
  await withTempDir(async (dir) => {
    await initRepo(dir);
    await writeFile(join(dir, "space file.txt"), "space path content\n", "utf8");

    const context = await gatherGitContext(createExecutor(), { cwd: dir });

    assert.ok(context.changedFiles.some((file) => file.scope === "unstaged" && file.path === "space file.txt"));
    assert.ok(context.project.changedFileSnippets.some((entry) => entry.path === "space file.txt"));
  });
});

test("gatherGitContext expands untracked directories before sensitivity filtering", async () => {
  await withTempDir(async (dir) => {
    await initRepo(dir);
    await mkdir(join(dir, "config"));
    await writeFile(join(dir, "config", ".env"), "TOKEN=nested-secret\n", "utf8");
    await writeFile(join(dir, "config", "public.txt"), "public context\n", "utf8");

    const context = await gatherGitContext(createExecutor(), { cwd: dir });
    const combinedContext = JSON.stringify(context.project) + context.staged.excerpt + context.unstaged.excerpt;

    assert.ok(context.statusPorcelain.includes("config/.env"));
    assert.ok(context.changedFiles.some((file) => file.path === "config/.env" && file.sensitive));
    assert.ok(context.changedFiles.some((file) => file.path === "config/public.txt" && !file.sensitive));
    assert.ok(context.project.skipped.some((entry) => entry.path === "config/.env" && entry.reason === "sensitive"));
    assert.doesNotMatch(combinedContext, /nested-secret/);
  });
});

test("gatherGitContext bounds large diff excerpts", async () => {
  await withTempDir(async (dir) => {
    await initRepo(dir);
    await writeFile(join(dir, "big.txt"), `${Array.from({ length: 40 }, (_, index) => `line ${index}`).join("\n")}\n`, "utf8");
    await git(dir, ["add", "big.txt"]);

    const context = await gatherGitContext(createExecutor(), { cwd: dir, diffMaxLines: 5, diffMaxBytes: 1_000 });

    assert.equal(context.staged.truncation.truncated, true);
    assert.match(context.staged.excerpt, /\[Truncated staged diff:/);
  });
});

test("gatherGitContext includes project metadata deterministically", async () => {
  await withTempDir(async (dir) => {
    await initRepo(dir);
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "fixture", scripts: { test: "node --test" } }, null, 2), "utf8");
    await writeFile(join(dir, "feature.js"), "export const feature = true;\n", "utf8");
    await git(dir, ["add", "feature.js"]);

    const context = await gatherGitContext(createExecutor(), { cwd: dir });
    const metadataPaths = context.project.metadata.map((entry) => entry.path);

    assert.deepEqual(metadataPaths.slice(0, 2), ["package.json", "README.md"]);
    assert.match(context.project.metadata[0].content, /"name": "fixture"/);
  });
});

test("gatherGitContext skips generated changed files for snippets", async () => {
  await withTempDir(async (dir) => {
    await initRepo(dir);
    await mkdir(join(dir, "dist"));
    await writeFile(join(dir, "dist", "bundle.js"), "generated output\n", "utf8");
    await git(dir, ["add", "dist/bundle.js"]);

    const context = await gatherGitContext(createExecutor(), { cwd: dir });

    assert.ok(context.changedFiles.some((file) => file.path === "dist/bundle.js" && file.generated));
    assert.ok(context.project.skipped.some((entry) => entry.path === "dist/bundle.js" && entry.reason === "generated"));
    assert.doesNotMatch(context.staged.excerpt, /generated output/);
  });
});

test("gatherGitContext filters sensitive changed file contents", async () => {
  await withTempDir(async (dir) => {
    await initRepo(dir);
    await writeFile(join(dir, ".env"), "TOKEN=super-secret\n", "utf8");
    await git(dir, ["add", ".env"]);

    const context = await gatherGitContext(createExecutor(), { cwd: dir });
    const combinedContext = JSON.stringify(context.project) + context.staged.excerpt + context.unstaged.excerpt;

    assert.ok(context.changedFiles.some((file) => file.path === ".env" && file.sensitive));
    assert.ok(context.project.skipped.some((entry) => entry.path === ".env" && entry.reason === "sensitive"));
    assert.doesNotMatch(combinedContext, /super-secret/);
  });
});

test("gatherGitContext treats .envrc files as sensitive", async () => {
  await withTempDir(async (dir) => {
    await initRepo(dir);
    await writeFile(join(dir, ".envrc"), "export TOKEN=envrc-secret\n", "utf8");
    await git(dir, ["add", ".envrc"]);

    const context = await gatherGitContext(createExecutor(), { cwd: dir });
    const combinedContext = JSON.stringify(context.project) + context.staged.excerpt + context.unstaged.excerpt;

    assert.ok(context.changedFiles.some((file) => file.path === ".envrc" && file.sensitive));
    assert.ok(context.project.skipped.some((entry) => entry.path === ".envrc" && entry.reason === "sensitive"));
    assert.doesNotMatch(combinedContext, /envrc-secret/);
  });
});

test("gatherGitContext redacts broad token assignments in ordinary source without marking the file sensitive", async () => {
  await withTempDir(async (dir) => {
    await initRepo(dir);
    await writeFile(
      join(dir, "fixture.ts"),
      "export const fixture = \"TOKEN=not-real\";\nexport const stillVisible = true;\n",
      "utf8",
    );
    await git(dir, ["add", "fixture.ts"]);

    const context = await gatherGitContext(createExecutor(), { cwd: dir });
    const file = context.changedFiles.find((entry) => entry.path === "fixture.ts");
    const combinedContext = JSON.stringify(context.project) + context.staged.excerpt + context.unstaged.excerpt;

    assert.equal(file?.sensitive, false);
    assert.match(combinedContext, /\[redacted sensitive line\]/);
    assert.match(combinedContext, /stillVisible/);
    assert.doesNotMatch(combinedContext, /not-real/);
  });
});

test("gatherGitContext marks high-confidence secret content without exposing it", async () => {
  await withTempDir(async (dir) => {
    await initRepo(dir);
    const syntheticKey = `sk-${"AbCdEfGhIjKlMnOpQrStUvWxYz012345"}`;
    await writeFile(join(dir, "leaked-key.ts"), `export const key = "${syntheticKey}";\n`, "utf8");
    await git(dir, ["add", "leaked-key.ts"]);

    const context = await gatherGitContext(createExecutor(), { cwd: dir });
    const file = context.changedFiles.find((entry) => entry.path === "leaked-key.ts");
    const combinedContext = JSON.stringify(context.project) + context.staged.excerpt + context.unstaged.excerpt;

    assert.equal(file?.sensitive, true);
    assert.equal(file?.secretContent, true);
    assert.ok(context.project.skipped.some((entry) => entry.path === "leaked-key.ts" && entry.reason === "sensitive"));
    assert.doesNotMatch(combinedContext, new RegExp(syntheticKey));
  });
});

test("gatherGitContext treats token-bearing npm config as sensitive", async () => {
  await withTempDir(async (dir) => {
    await initRepo(dir);
    await writeFile(join(dir, ".npmrc"), "//registry.npmjs.org/:_authToken=npm-secret\n", "utf8");
    await git(dir, ["add", ".npmrc"]);

    const context = await gatherGitContext(createExecutor(), { cwd: dir });
    const combinedContext = JSON.stringify(context.project) + context.staged.excerpt + context.unstaged.excerpt;

    assert.ok(context.changedFiles.some((file) => file.path === ".npmrc" && file.sensitive));
    assert.ok(context.project.skipped.some((entry) => entry.path === ".npmrc" && entry.reason === "sensitive"));
    assert.doesNotMatch(combinedContext, /npm-secret/);
  });
});

test("gatherGitContext treats kubeconfig files as sensitive", async () => {
  await withTempDir(async (dir) => {
    await initRepo(dir);
    await mkdir(join(dir, ".kube"));
    await writeFile(join(dir, ".kube", "config"), "users:\n- token: kube-secret\n", "utf8");
    await git(dir, ["add", ".kube/config"]);

    const context = await gatherGitContext(createExecutor(), { cwd: dir });
    const combinedContext = JSON.stringify(context.project) + context.staged.excerpt + context.unstaged.excerpt;

    assert.ok(context.changedFiles.some((file) => file.path === ".kube/config" && file.sensitive));
    assert.ok(context.project.skipped.some((entry) => entry.path === ".kube/config" && entry.reason === "sensitive"));
    assert.doesNotMatch(combinedContext, /kube-secret/);
  });
});

test("gatherGitContext redacts renamed token-looking content through new paths", async () => {
  await withTempDir(async (dir) => {
    await initRepo(dir);
    await writeFile(join(dir, ".env"), "TOKEN=old-secret\n", "utf8");
    await git(dir, ["add", ".env"]);
    await git(dir, ["commit", "-m", "chore: add env fixture"]);
    await git(dir, ["mv", ".env", "app-config.txt"]);
    await writeFile(join(dir, "app-config.txt"), "TOKEN=renamed-secret\n", "utf8");
    await git(dir, ["add", "app-config.txt"]);

    const context = await gatherGitContext(createExecutor(), { cwd: dir });
    const combinedContext = JSON.stringify(context.project) + context.staged.excerpt + context.unstaged.excerpt;

    assert.ok(context.changedFiles.some((file) => file.path === "app-config.txt"));
    assert.match(combinedContext, /\[redacted sensitive line\]/);
    assert.doesNotMatch(combinedContext, /renamed-secret/);
  });
});

test("gatherGitContext reports unreadable changed files without failing context gathering", async () => {
  await withTempDir(async (dir) => {
    await initRepo(dir);
    const unreadablePath = join(dir, "unreadable.txt");
    await writeFile(unreadablePath, "ordinary content\n", "utf8");
    await chmod(unreadablePath, 0o000);

    try {
      const context = await gatherGitContext(createExecutor(), { cwd: dir });

      assert.ok(context.changedFiles.some((file) => file.path === "unreadable.txt"));
      assert.ok(context.project.skipped.some((entry) => entry.path === "unreadable.txt" && entry.reason === "unreadable"));
    } finally {
      await chmod(unreadablePath, 0o600).catch(() => {});
    }
  });
});

test("gatherGitContext does not read symlinked changed files outside the repository", async () => {
  await withTempDir(async (dir) => {
    await initRepo(dir);
    const outsideDir = await mkdtemp(join(tmpdir(), "commitme-outside-"));
    try {
      const outsideFile = join(outsideDir, "secret.txt");
      await writeFile(outsideFile, "TOP_SECRET_VALUE\n", "utf8");
      try {
        await symlink(outsideFile, join(dir, "linked-file.txt"));
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && ["EINVAL", "EPERM"].includes(error.code)) {
          return;
        }
        throw error;
      }
      await git(dir, ["add", "linked-file.txt"]);

      const context = await gatherGitContext(createExecutor(), { cwd: dir });
      const combinedContext = JSON.stringify(context.project) + context.staged.excerpt + context.unstaged.excerpt;

      assert.ok(context.changedFiles.some((file) => file.path === "linked-file.txt"));
      assert.ok(
        context.project.skipped.some((entry) => entry.path === "linked-file.txt" && entry.reason === "outside-repository"),
      );
      assert.doesNotMatch(combinedContext, /TOP_SECRET_VALUE/);
    } finally {
      await rm(outsideDir, { recursive: true, force: true });
    }
  });
});
