import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import { buildCommitMeHelpText, parseCommitMeArgs, registerCommitMeCommand } from "../src/commands/commitme-command.ts";
import { assertNoUnsafeCommitFiles } from "../src/git/commit.ts";
import { buildUnsafeCommitFileApprovalMessage } from "../src/workflows/unsafe-commit-approval.ts";

const execFileAsync = promisify(execFile);
const OUTPUT_PATH = fileURLToPath(new URL("./fixtures/commitme-user-visible-ui.md", import.meta.url));
const SUBJECT = "feat(commitme): add user-visible UI fixture";
const SAFE_FEATURE_SOURCE = "export const userVisibleFixture = true;\n";
const UNSAFE_FIXTURE_SOURCE = "TOKEN=do-not-commit\n";

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
  const dir = await mkdtemp(join(tmpdir(), "commitme-user-visible-ui-"));
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

function createCtx(options) {
  const confirmResponses = [...(options.confirmResponses ?? [])];
  return {
    cwd: options.cwd,
    signal: undefined,
    hasUI: options.hasUI ?? true,
    ui: {
      notify(message, type) {
        options.notifications.push({ message, type });
      },
      confirm(title, body) {
        options.confirmations.push({ title, body });
        return confirmResponses.shift() ?? true;
      },
    },
    isIdle: () => options.idle ?? true,
    waitForIdle: async () => {},
  };
}

function createCommandHarness(draftCommitMessage = async () => SUBJECT) {
  const calls = [];
  const messages = [];
  const registered = new Map();
  const pi = createPi(calls, messages, registered);
  registerCommitMeCommand(pi, { draftCommitMessage });
  return { calls, messages, registered };
}

function normalizeCommitOutput(text) {
  return text.replace(/Committed [0-9a-f]{7,}: /u, "Committed <commit-hash>: ");
}

function normalizeTableValue(value) {
  return value.replaceAll("|", "\\|");
}

function markdownFence(language, content) {
  return ["```" + language, content.trimEnd(), "```"].join("\n");
}

function parseFeatureMatrix() {
  const cases = [
    { input: "/commitme", rawArgs: "", mode: "commit", confirm: false, steering: "" },
    { input: "/commitme --confirm", rawArgs: "--confirm", mode: "commit", confirm: true, steering: "" },
    {
      input: "/commitme --confirm focus on parser support",
      rawArgs: "--confirm focus on parser support",
      mode: "commit",
      confirm: true,
      steering: "focus on parser support",
    },
    {
      input: "/commitme --steering focus on parser support",
      rawArgs: "--steering focus on parser support",
      mode: "commit",
      confirm: false,
      steering: "focus on parser support",
    },
    {
      input: "/commitme --steering=focus on parser support",
      rawArgs: "--steering=focus on parser support",
      mode: "commit",
      confirm: false,
      steering: "focus on parser support",
    },
    {
      input: "/commitme -- --prefer feat if accurate",
      rawArgs: "-- --prefer feat if accurate",
      mode: "commit",
      confirm: false,
      steering: "--prefer feat if accurate",
    },
    { input: "/commitme help", rawArgs: "help", mode: "help", confirm: false, steering: "" },
  ];

  const rows = [];
  for (const entry of cases) {
    const parsed = parseCommitMeArgs(entry.rawArgs);
    assert.equal(parsed.ok, true, entry.input);
    assert.equal(parsed.options.mode, entry.mode, entry.input);
    assert.equal(parsed.options.confirm, entry.confirm, entry.input);
    assert.equal(parsed.options.steeringPrompt ?? "", entry.steering, entry.input);
    rows.push(
      `| \`${normalizeTableValue(entry.input)}\` | ${entry.mode} | ${entry.confirm ? "yes" : "no"} | ${entry.steering || "—"} |`,
    );
  }

  return ["| User input | Mode | Confirmation | Steering prompt |", "| --- | --- | --- | --- |", ...rows].join("\n");
}

function unsafeExampleFiles() {
  return [
    {
      path: "src/privacy/secret-patterns.ts",
      status: "M",
      scope: "unstaged",
      sensitive: true,
      generated: false,
      binary: false,
      secretContent: true,
    },
    {
      path: "test/privacy-patterns.test.mjs",
      status: "M",
      scope: "unstaged",
      sensitive: true,
      generated: false,
      binary: false,
      secretContent: true,
    },
  ];
}

function unsafeRefusalMessage() {
  try {
    assertNoUnsafeCommitFiles(unsafeExampleFiles());
  } catch (error) {
    assert.equal(error.code, "unsafe-sensitive-files");
    return error.message;
  }
  throw new Error("unsafe fixture should be refused");
}

async function collectHelpPanel() {
  const notifications = [];
  const confirmations = [];
  const harness = createCommandHarness(async () => {
    throw new Error("drafting should not run for help");
  });

  await harness.registered.get("commitme").handler(
    "help",
    createCtx({ cwd: "/tmp", notifications, confirmations }),
  );

  assert.deepEqual(notifications, []);
  assert.equal(harness.messages[0].content, buildCommitMeHelpText());
  return harness.messages[0].content;
}

async function collectUnknownFlagWarning() {
  const notifications = [];
  const confirmations = [];
  const harness = createCommandHarness(async () => {
    throw new Error("drafting should not run for parse errors");
  });

  await harness.registered.get("commitme").handler(
    "--push",
    createCtx({ cwd: "/tmp", notifications, confirmations }),
  );

  assert.deepEqual(notifications, [{ message: "CommitMe: Unknown flag: --push", type: "warning" }]);
  assert.equal(harness.calls.length, 0);
  return notifications[0];
}

async function collectNoChangesNotifications() {
  return withTempRepo(async (dir) => {
    const notifications = [];
    const confirmations = [];
    const harness = createCommandHarness(async () => {
      throw new Error("drafting should not run when there are no changes");
    });

    await harness.registered.get("commitme").handler(
      "",
      createCtx({ cwd: dir, notifications, confirmations, idle: false }),
    );

    assert.deepEqual(notifications, [
      { message: "CommitMe: waiting for the current agent turn to finish...", type: "info" },
      { message: "CommitMe: no staged or unstaged git changes found.", type: "warning" },
    ]);
    return notifications;
  });
}

async function collectConfirmationDialog() {
  return withTempRepo(async (dir) => {
    await writeFile(join(dir, "feature.ts"), SAFE_FEATURE_SOURCE, "utf8");

    const notifications = [];
    const confirmations = [];
    const harness = createCommandHarness();
    await harness.registered.get("commitme").handler(
      "--confirm --steering focus on UI copy",
      createCtx({ cwd: dir, notifications, confirmations, confirmResponses: [false] }),
    );

    assert.equal(confirmations.length, 1);
    assert.deepEqual(notifications, [{ message: "CommitMe: commit cancelled.", type: "info" }]);
    return { confirmation: confirmations[0], notification: notifications[0] };
  });
}

async function collectUnsafeBlockDialog() {
  return withTempRepo(async (dir) => {
    await writeFile(join(dir, ".env"), UNSAFE_FIXTURE_SOURCE, "utf8");

    const notifications = [];
    const confirmations = [];
    const harness = createCommandHarness(async () => "test: add env fixture");
    await harness.registered.get("commitme").handler(
      "--steering add reviewed env fixture",
      createCtx({ cwd: dir, notifications, confirmations, confirmResponses: [false] }),
    );

    assert.equal(confirmations.length, 1);
    assert.match(confirmations[0].body, /CommitMe found changed files that look unsafe to stage:/u);
    assert.match(confirmations[0].body, /- \.env \(known secret path\)/u);
    assert.deepEqual(notifications, [
      { message: "CommitMe: commit blocked because potentially unsafe files were not approved.", type: "warning" },
    ]);
    return { confirmation: confirmations[0], notification: notifications[0] };
  });
}

async function collectSuccessMessage() {
  return withTempRepo(async (dir) => {
    await writeFile(join(dir, "feature.ts"), SAFE_FEATURE_SOURCE, "utf8");

    const notifications = [];
    const confirmations = [];
    const harness = createCommandHarness();
    await harness.registered.get("commitme").handler(
      "--steering focus on UI copy",
      createCtx({ cwd: dir, notifications, confirmations }),
    );

    assert.deepEqual(notifications, []);
    assert.equal(confirmations.length, 0);
    assert.equal(harness.messages.length, 1);
    assert.match(harness.messages[0].content, /^Committed [0-9a-f]{7,}: feat\(commitme\): add user-visible UI fixture$/u);
    return normalizeCommitOutput(harness.messages[0].content);
  });
}

function notificationBlock(notifications) {
  return notifications.map((notification) => `${notification.type.toUpperCase()}: ${notification.message}`).join("\n");
}

function dialogBlock(dialog) {
  return [`Title: ${dialog.title}`, "", "Body:", dialog.body].join("\n");
}

async function buildUserVisibleOutput() {
  const parseMatrix = parseFeatureMatrix();
  const helpPanel = await collectHelpPanel();
  const unknownFlag = await collectUnknownFlagWarning();
  const noChanges = await collectNoChangesNotifications();
  const confirmation = await collectConfirmationDialog();
  const unsafeBlock = await collectUnsafeBlockDialog();
  const successMessage = await collectSuccessMessage();
  const staticUnsafePrompt = buildUnsafeCommitFileApprovalMessage(unsafeExampleFiles());
  const staticUnsafeRefusal = unsafeRefusalMessage();

  return [
    "# CommitMe user-visible UI output",
    "",
    "Generated by `test/user-visible-ui.test.mjs`. This fixture captures the command text, dialogs, notifications, and safety copy a user sees when running CommitMe. Commit hashes and temporary paths are normalized.",
    "",
    "## Command feature matrix",
    "",
    parseMatrix,
    "",
    "## Help panel",
    "",
    "Message card: `customType=commitme`, `display=true`.",
    "",
    markdownFence("md", helpPanel),
    "",
    "## Successful commit message",
    "",
    markdownFence("text", successMessage),
    "",
    "## Unknown flag warning",
    "",
    markdownFence("text", notificationBlock([unknownFlag])),
    "",
    "## Waiting and no-change notifications",
    "",
    markdownFence("text", notificationBlock(noChanges)),
    "",
    "## Commit confirmation dialog",
    "",
    markdownFence("text", dialogBlock(confirmation.confirmation)),
    "",
    "Cancellation notification:",
    "",
    markdownFence("text", notificationBlock([confirmation.notification])),
    "",
    "## Unsafe-file approval dialog",
    "",
    markdownFence("text", dialogBlock(unsafeBlock.confirmation)),
    "",
    "Blocked notification:",
    "",
    markdownFence("text", notificationBlock([unsafeBlock.notification])),
    "",
    "## Representative unsafe-file approval copy for privacy-pattern fixtures",
    "",
    markdownFence("text", staticUnsafePrompt),
    "",
    "## Non-UI unsafe-file refusal error",
    "",
    markdownFence("text", staticUnsafeRefusal),
    "",
  ].join("\n");
}

test("captures user-visible CommitMe UI output in a fixture file", async () => {
  const output = await buildUserVisibleOutput();

  assert.match(output, /\/commitme --steering <prompt>/u);
  assert.match(output, /`--steering=<prompt>` also works/u);
  assert.match(output, /CommitMe: commit potentially unsafe files\?/u);
  assert.match(output, /src\/privacy\/secret-patterns\.ts/u);
  assert.match(output, /test\/privacy-patterns\.test\.mjs/u);
  assert.match(output, /Committed <commit-hash>: feat\(commitme\): add user-visible UI fixture/u);
  assert.match(output, /CommitMe: Unknown flag: --push/u);
  assert.match(output, /CommitMe: commit blocked because potentially unsafe files were not approved\./u);

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, output, "utf8");
  assert.equal(await readFile(OUTPUT_PATH, "utf8"), output);
});
