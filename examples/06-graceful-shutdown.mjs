/**
 * Example 06: Graceful Shutdown with Settlement
 *
 * Demonstrates how to terminate long-running processes cleanly:
 * clearing pending backlog while waiting for in-flight tasks to finish peacefully.
 *
 * Run: node examples/06-graceful-shutdown.mjs
 */

import { Ahko } from '../dist/index.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log('=== Example 06: Graceful Shutdown with Settlement ===\n');

  const ahko = new Ahko({ concurrency: 2 });
  const completedJobs = [];

  // Active in-flight jobs
  const job1 = ahko.schedule(async () => {
    console.log('[In-Flight] Job 1 saving transaction batch to database...');
    await sleep(80);
    completedJobs.push('job_1');
    console.log('[In-Flight] Job 1 transaction safely committed!');
    return 'done_1';
  });

  const job2 = ahko.schedule(async () => {
    console.log('[In-Flight] Job 2 writing audit log file...');
    await sleep(80);
    completedJobs.push('job_2');
    console.log('[In-Flight] Job 2 audit log safely written!');
    return 'done_2';
  });

  // Queued pending jobs (not yet started)
  const job3 = ahko.schedule(async () => {
    completedJobs.push('job_3');
    return 'done_3';
  }).catch((err) => {
    console.log(`[Pending] Job 3 cancelled safely on shutdown: ${err.message}`);
  });

  const job4 = ahko.schedule(async () => {
    completedJobs.push('job_4');
    return 'done_4';
  }).catch((err) => {
    console.log(`[Pending] Job 4 cancelled safely on shutdown: ${err.message}`);
  });

  await sleep(10);
  console.log('\n>>> Shutdown signal received (SIGTERM simulation)! Starting graceful exit sequence...\n');

  // 1. Clear unstarted work so no new work begins
  ahko.clear();
  console.log('Cleared pending queue backlog. Active tasks remaining:', ahko.stats().activeTasks);

  // 2. Wait for in-flight active tasks to settle completely
  console.log('Awaiting in-flight work with ahko.chill()...');
  await ahko.chill();

  await Promise.all([job1, job2, job3, job4]);

  console.log('\nAll in-flight tasks settled gracefully without data corruption.');
  console.log('Successfully completed jobs:', completedJobs);
  console.log('Scheduler is completely chill and idle:', ahko.isIdle());
  console.log('Ahko mascot status:', ahko.battery());
}

main().catch(console.error);
