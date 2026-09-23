import { spawnSync } from "node:child_process";
import * as path from "node:path";

const examples = [
  "01-concurrency-and-pacing.mjs",
  "02-debounce-search.mjs",
  "03-throttle-events.mjs",
  "04-retry-backoff-jitter.mjs",
  "05-idle-telemetry.mjs",
  "06-graceful-shutdown.mjs",
];

console.log("Running all ahko examples...\n");

for (const file of examples) {
  const filePath = path.resolve("examples", file);
  console.log(`> node examples/${file}`);
  const result = spawnSync(process.execPath, [filePath], { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`\n❌ Example failed: examples/${file} (exit code ${result.status})`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nAll examples executed successfully!");
