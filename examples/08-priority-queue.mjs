/**
 * Example 08: Priority-Aware Task Scheduling & Pause/Resume
 *
 * Demonstrates priority ordering (high, normal, low, or numeric weights)
 * and flow control using pause() and resume().
 *
 * Run: node examples/08-priority-queue.mjs
 */

import { Ahko } from '../dist/index.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log('=== Example 08: Priority-Aware Scheduling & Pause/Resume ===\n');

  // Concurrency 1 ensures tasks wait in queue to show priority sorting
  const ahko = new Ahko({ concurrency: 1 });

  // Pause the queue before filling it
  console.log('Pausing scheduler to accumulate tasks of varying priorities...');
  ahko.pause();
  console.log('Is paused?', ahko.isPaused());

  const completed = [];

  // Enqueue tasks in mixed order
  ahko.schedule(async () => {
    completed.push('Task 1 (low priority)');
    console.log('Executed: Task 1 (low priority)');
  }, { priority: 'low' });

  ahko.schedule(async () => {
    completed.push('Task 2 (normal priority)');
    console.log('Executed: Task 2 (normal priority)');
  }, { priority: 'normal' });

  ahko.schedule(async () => {
    completed.push('Task 3 (high priority)');
    console.log('Executed: Task 3 (high priority)');
  }, { priority: 'high' });

  ahko.schedule(async () => {
    completed.push('Task 4 (critical numerical weight 50)');
    console.log('Executed: Task 4 (critical weight 50)');
  }, { priority: 50 });

  console.log(`\nAccumulated ${ahko.stats().pendingTasks} pending tasks in queue while paused.`);
  console.log('Resuming scheduler...\n');

  ahko.resume();
  await ahko.chill();

  console.log('\nFinal execution order:');
  completed.forEach((task, index) => {
    console.log(`  ${index + 1}. ${task}`);
  });

  console.log('\nFinal scheduler stats:', ahko.stats());
}

main().catch(console.error);
