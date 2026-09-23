/**
 * Example 04: Resilient Retries with Exponential Backoff & Jitter
 *
 * Demonstrates automatic retry policies with slot recovery during backoff,
 * exponential delay scaling, and jitter randomization.
 *
 * Run: node examples/04-retry-backoff-jitter.mjs
 */

import { Ahko } from '../dist/index.js';

async function main() {
  console.log('=== Example 04: Retries with Exponential Backoff & Jitter ===\n');

  const ahko = new Ahko({ concurrency: 2 });
  let attempts = 0;
  const start = Date.now();

  console.log('Scheduling task against a flaky endpoint (fails twice before succeeding)...\n');

  const result = await ahko.schedule(
    async () => {
      attempts++;
      const elapsed = Date.now() - start;

      if (attempts < 3) {
        console.log(`[+${elapsed}ms] Attempt #${attempts}: Connection refused! Retrying...`);
        throw new Error(`503 Service Unavailable (attempt ${attempts})`);
      }

      console.log(`[+${elapsed}ms] Attempt #${attempts}: Succeeded! Response 200 OK.`);
      return { status: 200, data: 'Protected resource payload' };
    },
    {
      retry: {
        attempts: 4,
        backoff: 'exponential',
        baseDelay: 100,
        maxDelay: 2000,
        jitter: true, // Full jitter prevents synchronized thundering herd retries
        shouldRetry: (error, attempt) => {
          console.log(`   -> Evaluated shouldRetry for attempt #${attempt}`);
          return true;
        },
      },
    }
  );

  console.log('\nTask finished with result:', result);
  console.log('Telemetry metrics:', ahko.stats());
}

main().catch(console.error);
