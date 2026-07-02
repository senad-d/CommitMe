#!/usr/bin/env node
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";

await mkdir("coverage", { recursive: true });

const testArgs = [
  "--test",
  "--experimental-test-coverage",
  "--test-reporter=spec",
  "--test-reporter-destination=stdout",
  "--test-reporter=lcov",
  "--test-reporter-destination=coverage/lcov.info",
  "test/*.test.mjs",
];

const testProcess = spawn(process.execPath, testArgs, { stdio: "inherit" });
const [code, signal] = await once(testProcess, "exit");

if (signal) {
  console.error(`Coverage test run exited from signal ${signal}.`);
  process.exitCode = 1;
} else {
  process.exitCode = code ?? 1;
}
