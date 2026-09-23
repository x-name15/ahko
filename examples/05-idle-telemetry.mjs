/**
 * Example 05: Idle Execution & Lifecycle Telemetry Events
 *
 * Demonstrates non-blocking idle tasks combined with typed event listeners
 * for task starts, completions, durations, and scheduler idle transitions.
 *
 * Run: node examples/05-idle-telemetry.mjs
 */

import { Ahko } from '../dist/index.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log('=== Example 05: Idle Tasks & Lifecycle Telemetry Events ===\n');

  const ahko = new Ahko({ concurrency: 2 });

  // 1. Subscribe to lifecycle events
  ahko.on('task:start', ({ taskId, attempt }) => {
    console.log(`[Event: task:start]    Task ${taskId} started attempt #${attempt}`);
  });

  ahko.on('task:complete', ({ taskId, durationMs, result }) => {
    console.log(`[Event: task:complete] Task ${taskId} finished in ${durationMs}ms with outcome: "${result}"`);
  });

  ahko.on('idle', ({ timestamp }) => {
    console.log(`[Event: idle]          Scheduler reached complete idle state at ${new Date(timestamp).toISOString()}`);
  });

  console.log('1. Scheduling primary foreground tasks...');
  const foreground = ahko.schedule(async () => {
    await sleep(60);
    return 'critical_foreground_data';
  });

  console.log('2. Scheduling opportunistic idle task (runs when capacity is free)...');
  const background = ahko.idle(async () => {
    await sleep(40);
    return 'cached_analytics_synced';
  });

  const [res1, res2] = await Promise.all([foreground, background]);

  console.log('\nResults:', { res1, res2 });
  console.log('Final scheduler stats:', ahko.stats());
}

main().catch(console.error);
