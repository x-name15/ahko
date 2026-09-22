// Smoke test: verify all expected public exports are present in the built package.
import * as pkg from "../dist/index.js";

const required = [
  "Ahko",
  "VERSION",
  "AhkoError",
  "AhkoCancellationError",
  "AhkoConfigurationError",
  "AhkoQueueError",
  "AhkoTimeoutError",
  "EScheduleStrategy",
  "ETaskState",
];

const missing = required.filter((name) => !(name in pkg));

if (missing.length > 0) {
  throw new Error(`Missing exports from built package: ${missing.join(", ")}`);
}

console.log("Package smoke test passed.");
