/**
 * Example 01: Concurrency Control & Paced Dispatching
 *
 * Demonstrates how @mrjacket/ahko limits simultaneously running tasks
 * to prevent CPU bursts, while pacing task dispatches with minIntervalMs.
 *
 * Run: node examples/01-concurrency-and-pacing.mjs
 */

import { Ahko } from '../dist/index.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log('=== Example 01: Concurrency Control & Paced Dispatching ===\n');

  // Allow at most 2 concurrent tasks, paced at least 50ms apart
  const ahko = new Ahko({ concurrency: 2, minIntervalMs: 50 });

  console.log('Scheduling 6 tasks with concurrency: 2, minIntervalMs: 50ms...\n');

  const start = Date.now();

  const tasks = Array.from({ length: 6 }, (_, i) => {
    return ahko.schedule(async ({ taskId }) => {
      const elapsed = Date.now() - start;
      console.log(`[+${elapsed.toString().padStart(4, ' ')}ms] Task #${i + 1} started (id: ${taskId})`);
      await sleep(100);
      console.log(`[+${(Date.now() - start).toString().padStart(4, ' ')}ms] Task #${i + 1} completed`);
      return `result_${i + 1}`;
    });
  });

  const results = await Promise.all(tasks);

  console.log('\nAll tasks completed:', results);
  console.log('Final scheduler stats:', ahko.stats());
}

main().catch(console.error);
