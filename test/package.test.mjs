import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

async function readProjectFile(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

async function readSourceTree(dir = "src") {
  const base = new URL(`../${dir}/`, import.meta.url);
  const entries = await readdir(base, { withFileTypes: true });
  const chunks = [];
  for (const entry of entries) {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      chunks.push(await readSourceTree(relative));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      chunks.push(await readProjectFile(relative));
    }
  }
  return chunks.join("\n");
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

test("package gallery metadata points at CommitMe assets", () => {
  assert.match(packageJson.pi?.image, /^https:\/\/raw\.githubusercontent\.com\/senad-d\/commitme\//);
});

test("development shim metadata uses CommitMe naming", async () => {
  const devShimPackage = JSON.parse(await readProjectFile("dev-shims/pi-coding-agent/package.json"));

  assert.match(devShimPackage.name, /commitme/);
  assert.doesNotMatch(devShimPackage.name, /micme/);
});

test("required preparation specs exist", async () => {
  await access(new URL("../docs/PROJECT_DEFINITION_BRIEF.md", import.meta.url));
  await access(new URL("../specs/spec-architecture.md", import.meta.url));
  await access(new URL("../specs/spec-guidelines.md", import.meta.url));
  await access(new URL("../specs/spec-tasks.md", import.meta.url));
});

test("task spec tracks implementation progress", async () => {
  const taskSpec = await readProjectFile("specs/spec-tasks.md");
  assert.match(taskSpec, /- \[[ x]\] /i);
  assert.doesNotMatch(taskSpec, /preparation session is complete/i);
});

test("packaged documentation avoids machine-local preparation paths", async () => {
  const brief = await readProjectFile("docs/PROJECT_DEFINITION_BRIEF.md");

  assert.doesNotMatch(brief, /\/Users\/|Documents\/Code|Moj_git|pi-tmp/);
});

test("extension entry point delegates to command and tool registration modules", async () => {
  const extension = await readProjectFile("src/extension.ts");

  assert.match(extension, /commitMeExtension/);
  assert.match(extension, /registerCommitMeCommand\(pi\)/);
  assert.match(extension, /registerCommitMeTool\(pi\)/);
});

test("implementation avoids background resources and custom widgets", async () => {
  const source = await readSourceTree();

  assert.doesNotMatch(source, /setInterval|setTimeout|watch\(|createServer|listen\(/);
  assert.doesNotMatch(source, /setWidget\(|ui\.custom\(/);
});
