import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

async function readProjectFile(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("package declares CommitMe identity and Pi extension entry file", async () => {
  assert.equal(packageJson.name, "@senad-d/commitme");
  assert.equal(packageJson.author, "Senad Dizdarević <112484166+senad-d@users.noreply.github.com>");
  assert.match(packageJson.description, /commit/i);
  assert.deepEqual(packageJson.pi?.extensions, ["./src/extension.ts"]);
  await access(new URL("../src/extension.ts", import.meta.url));
});

test("package metadata is no longer template metadata", () => {
  assert.equal(packageJson._template, undefined);
  assert.ok(packageJson.keywords.includes("pi-package"));
  assert.ok(packageJson.keywords.includes("commit-message"));
  assert.ok(packageJson.keywords.includes("conventional-commits"));
});

test("required preparation specs exist", async () => {
  await access(new URL("../docs/PROJECT_DEFINITION_BRIEF.md", import.meta.url));
  await access(new URL("../specs/spec-architecture.md", import.meta.url));
  await access(new URL("../specs/spec-guidelines.md", import.meta.url));
  await access(new URL("../specs/spec-tasks.md", import.meta.url));
});

test("task spec keeps implementation checkboxes unchecked during preparation", async () => {
  const taskSpec = await readProjectFile("specs/spec-tasks.md");
  assert.match(taskSpec, /- \[ \] /);
  assert.doesNotMatch(taskSpec, /- \[x\] /i);
});

test("prepared extension does not register runtime command or tool behavior", async () => {
  const extension = await readProjectFile("src/extension.ts");
  const command = await readProjectFile("src/commands/commitme-command.ts");
  const tool = await readProjectFile("src/tools/commitme-tool.ts");

  assert.match(extension, /commitMeExtension/);
  assert.doesNotMatch(extension, /registerCommand\s*\(/);
  assert.doesNotMatch(extension, /registerTool\s*\(/);
  assert.doesNotMatch(command, /registerCommand\s*\(/);
  assert.doesNotMatch(tool, /registerTool\s*\(/);
});
