/**
 * Example 03: Throttled Event Stream with Leading & Trailing Runs
 *
 * Demonstrates how throttle executes the first call immediately (leading edge),
 * while collapsing all intermediate calls into a single trailing run.
 *
 * Run: node examples/03-throttle-events.mjs
 */

import { Ahko } from '../dist/index.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log('=== Example 03: Throttled Event Stream ===\n');

  const ahko = new Ahko();
  const recordedScrolls = [];

  async function updateScrollIndicator(scrollY) {
    console.log(` -> [Render] Recalculating layout for scroll position: ${scrollY}px`);
    recordedScrolls.push(scrollY);
    await sleep(20);
    return scrollY;
  }

  console.log('Simulating continuous scroll events within a 200ms throttle interval...\n');

  // Event 1: runs immediately on leading edge
  console.log('[0ms] User scrolls to 50px');
  const p1 = ahko.throttle('scroll_position', () => updateScrollIndicator(50), 200);

  // Events 2, 3, 4: arrive during throttle interval (coalesce into latest)
  await sleep(40);
  console.log('[40ms] User scrolls to 120px');
  const p2 = ahko.throttle('scroll_position', () => updateScrollIndicator(120), 200);

  await sleep(40);
  console.log('[80ms] User scrolls to 250px');
  const p3 = ahko.throttle('scroll_position', () => updateScrollIndicator(250), 200);

  await sleep(40);
  console.log('[120ms] User scrolls to 400px (final position)');
  const p4 = ahko.throttle('scroll_position', () => updateScrollIndicator(400), 200);

  console.log('\nWaiting for throttle window to expire and trailing run to execute...');
  const [r1, r2, r3, r4] = await Promise.all([p1, p2, p3, p4]);

  console.log('\nResult of leading call:', r1);
  console.log('Result received by intermediate call 2:', r2);
  console.log('Result received by intermediate call 3:', r3);
  console.log('Result received by trailing call 4:', r4);
  console.log('All executed positions:', recordedScrolls);
}

main().catch(console.error);
