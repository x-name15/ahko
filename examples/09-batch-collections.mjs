/**
 * Example 09: Batch Collections API (ahko.map & ahko.each)
 *
 * Demonstrates processing collections concurrently with localized concurrency caps,
 * guaranteed index ordering, and optional stopOnError behavior.
 *
 * Run: node examples/09-batch-collections.mjs
 */

import { Ahko } from "../dist/index.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log("=== Example 09: Batch Collections API ===\n");

  const ahko = new Ahko({ concurrency: 4 });

  const endpoints = [
    { id: "alpha", latency: 80 },
    { id: "beta", latency: 20 },
    { id: "gamma", latency: 50 },
    { id: "delta", latency: 10 },
  ];

  console.log("Mapping endpoints with localized concurrency: 2 (strict index ordering)...");
  const start = Date.now();

  const results = await ahko.map(
    endpoints,
    async (item, index, { taskId }) => {
      const elapsed = Date.now() - start;
      console.log(`  [+${elapsed}ms] Fetching #${index} (${item.id}) via ${taskId}...`);
      await sleep(item.latency);
      return { id: item.id, status: 200, processedAt: Date.now() - start };
    },
    { concurrency: 2 }
  );

  console.log("\nResults preserved strict input order despite finishing at different times:");
  console.log(results);

  console.log("\nIterating over items with ahko.each():");
  await ahko.each(
    ["user:1", "user:2", "user:3"],
    async (user) => {
      console.log(`  Sending welcome notification to ${user}...`);
      await sleep(20);
    },
    { concurrency: 2 }
  );

  console.log("\nBatch operations finished completely chill!");
}

main().catch(console.error);
