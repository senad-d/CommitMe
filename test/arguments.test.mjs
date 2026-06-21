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

test("parseCommitMeArgs rejects unknown flags", () => {
  const parsed = parseCommitMeArgs("--commit --push");
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /Unknown flag/);
  assert.deepEqual(parsed.unknownFlags, ["--push"]);
});

test("parseCommitMeArgs rejects positional arguments", () => {
  const parsed = parseCommitMeArgs("please commit");
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /Unexpected arguments/);
});
