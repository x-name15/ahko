/**
 * Example 10: Adaptive Concurrency (AIMD Auto-Chill Mode)
 *
 * Demonstrates how @mrjacket/ahko dynamically adjusts concurrency in real-time
 * using Additive Increase / Multiplicative Decrease (AIMD) based on task execution latency.
 *
 * Run: node examples/10-adaptive-concurrency.mjs
 */

import { Ahko } from "../dist/index.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log("=== Example 10: Adaptive Concurrency (AIMD Auto-Chill) ===\n");

  const ahko = new Ahko({
    concurrency: 4,
    adaptive: {
      targetLatencyMs: 60, // Target latency threshold
      sampleWindowSize: 3, // Samples per adjustment window
      minConcurrency: 1,
      maxConcurrency: 8,
      backoffFactor: 0.5, // Cut concurrency in half when congested
    },
  });

  ahko.on("concurrency:change", ({ previousConcurrency, currentConcurrency, reason }) => {
    console.log(
      `⚡ [CONCURRENCY CHANGE] ${previousConcurrency} -> ${currentConcurrency} (${reason})`
    );
  });

  console.log(`Initial concurrency: ${ahko.concurrency}\n`);

  console.log("Simulating congested upstream API (tasks taking 100ms > 60ms target)...");
  await Promise.all([
    ahko.schedule(() => sleep(100)),
    ahko.schedule(() => sleep(100)),
    ahko.schedule(() => sleep(100)),
  ]);

  console.log(`Current concurrency after congestion: ${ahko.concurrency}\n`);

  console.log("Simulating recovered fast API (tasks taking 15ms < 60ms target)...");
  await Promise.all([
    ahko.schedule(() => sleep(15)),
    ahko.schedule(() => sleep(15)),
    ahko.schedule(() => sleep(15)),
  ]);

  console.log(`Current concurrency after recovery: ${ahko.concurrency}`);
  console.log("\nAdaptive telemetry stats:", ahko.stats().adaptive);
}

main().catch(console.error);
