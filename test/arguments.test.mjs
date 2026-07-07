import assert from "node:assert/strict";
import test from "node:test";

import { parseCommitMeArgs } from "../src/commands/commitme-command.ts";

test("parseCommitMeArgs defaults to commit mode", () => {
  const parsed = parseCommitMeArgs("");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.options.mode, "commit");
  assert.equal(parsed.options.confirm, false);
});

test("parseCommitMeArgs accepts --commit as a commit-mode alias", () => {
  const parsed = parseCommitMeArgs("--commit");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.options.mode, "commit");
  assert.equal(parsed.options.confirm, false);
});

test("parseCommitMeArgs enables confirmation for commit mode", () => {
  const parsed = parseCommitMeArgs("--confirm");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.options.mode, "commit");
  assert.equal(parsed.options.confirm, true);
});

test("parseCommitMeArgs accepts help mode", () => {
  const parsed = parseCommitMeArgs("help");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.options.mode, "help");
  assert.equal(parsed.options.confirm, false);
});

test("parseCommitMeArgs accepts --help mode", () => {
  const parsed = parseCommitMeArgs("--help");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.options.mode, "help");
  assert.equal(parsed.options.confirm, false);
});

test("parseCommitMeArgs treats help flags as help even with other flags", () => {
  const parsed = parseCommitMeArgs("--confirm --help");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.options.mode, "help");
  assert.equal(parsed.options.confirm, false);
});

test("parseCommitMeArgs treats leading help as help with extra flags", () => {
  const parsed = parseCommitMeArgs("help --confirm");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.options.mode, "help");
  assert.equal(parsed.options.confirm, false);
});

test("parseCommitMeArgs accepts legacy commit with confirmation", () => {
  const parsed = parseCommitMeArgs("  --commit   --confirm  ");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.options.mode, "commit");
  assert.equal(parsed.options.confirm, true);
});

test("parseCommitMeArgs rejects unknown flags before steering text", () => {
  const parsed = parseCommitMeArgs("--commit --push");
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /Unknown flag/);
  assert.deepEqual(parsed.unknownFlags, ["--push"]);
});

test("parseCommitMeArgs accepts steering prompt text", () => {
  const parsed = parseCommitMeArgs("please focus on the parser change");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.options.mode, "commit");
  assert.equal(parsed.options.confirm, false);
  assert.equal(parsed.options.steeringPrompt, "please focus on the parser change");
});

test("parseCommitMeArgs accepts steering prompt after flags", () => {
  const parsed = parseCommitMeArgs("--commit --confirm please focus on the parser change");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.options.mode, "commit");
  assert.equal(parsed.options.confirm, true);
  assert.equal(parsed.options.steeringPrompt, "please focus on the parser change");
});

test("parseCommitMeArgs accepts --steering as an explicit steering flag", () => {
  const parsed = parseCommitMeArgs("--confirm --steering please focus on the parser change");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.options.mode, "commit");
  assert.equal(parsed.options.confirm, true);
  assert.equal(parsed.options.steeringPrompt, "please focus on the parser change");
});

test("parseCommitMeArgs accepts --steering=inline values", () => {
  const parsed = parseCommitMeArgs("--steering=please focus on the parser change");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.options.mode, "commit");
  assert.equal(parsed.options.confirm, false);
  assert.equal(parsed.options.steeringPrompt, "please focus on the parser change");
});

test("parseCommitMeArgs treats dash-prefixed text after --steering as steering text", () => {
  const parsed = parseCommitMeArgs("--steering --prefer feat if accurate");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.options.steeringPrompt, "--prefer feat if accurate");
});

test("parseCommitMeArgs treats flags after steering text as steering text", () => {
  const parsed = parseCommitMeArgs("please mention --confirm support");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.options.steeringPrompt, "please mention --confirm support");
});

test("parseCommitMeArgs accepts dash-prefixed steering after separator", () => {
  const parsed = parseCommitMeArgs("--confirm -- --prefer feat if accurate");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.options.mode, "commit");
  assert.equal(parsed.options.confirm, true);
  assert.equal(parsed.options.steeringPrompt, "--prefer feat if accurate");
});
