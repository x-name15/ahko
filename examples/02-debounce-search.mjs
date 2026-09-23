/**
 * Example 02: Debounced Search & Promise Coalescing
 *
 * Demonstrates debounced operations where rapid calls with the same key
 * extend the quiet window and share the eventual Promise resolution.
 *
 * Run: node examples/02-debounce-search.mjs
 */

import { Ahko } from '../dist/index.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log('=== Example 02: Debounced Search & Promise Coalescing ===\n');

  const ahko = new Ahko();
  let serverRequestsDispatched = 0;

  async function searchBackend(query) {
    serverRequestsDispatched++;
    console.log(` -> [Network] Dispatched actual search query: "${query}"`);
    await sleep(50);
    return [`result_1_for_${query}`, `result_2_for_${query}`];
  }

  console.log('Simulating a user typing rapidly into a search bar: "c", "ca", "cat"...');

  // Keystroke 1: "c"
  const p1 = ahko.debounce('search_input', () => searchBackend('c'), 150);
  await sleep(30);

  // Keystroke 2: "ca" (extends quiet window)
  const p2 = ahko.debounce('search_input', () => searchBackend('ca'), 150);
  await sleep(40);

  // Keystroke 3: "cat" (extends quiet window)
  const p3 = ahko.debounce('search_input', () => searchBackend('cat'), 150);

  console.log('User stopped typing. Waiting for 150ms quiet window to expire...\n');

  const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

  console.log('Total actual backend requests made:', serverRequestsDispatched);
  console.log('Result received by caller 1:', r1);
  console.log('Result received by caller 2:', r2);
  console.log('Result received by caller 3:', r3);
  console.log('Do all callers share the exact same returned data?', r1 === r2 && r2 === r3);
}

main().catch(console.error);
