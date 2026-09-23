/**
 * Example 07: Circuit Breaker Protection & Fast-Failing
 *
 * Demonstrates how @mrjacket/ahko protects downstream resources by fast-failing
 * tasks when a failure threshold is reached, automatically testing recovery
 * in HALF_OPEN state after a cool-down window.
 *
 * Run: node examples/07-circuit-breaker.mjs
 */

import { Ahko, AhkoCircuitBreakerOpenError } from '../dist/index.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log('=== Example 07: Circuit Breaker Protection & Fast-Failing ===\n');

  // Configure circuit breaker: trip after 2 failures, cool down for 200ms
  const ahko = new Ahko({
    concurrency: 1,
    circuitBreaker: {
      failureThreshold: 2,
      resetTimeoutMs: 200,
    },
  });

  console.log('Circuit breaker state initially:', ahko.circuitState);

  // Simulate 2 consecutive failures
  for (let i = 1; i <= 2; i++) {
    try {
      await ahko.schedule(async () => {
        console.log(`Executing fragile call #${i}... [Fails]`);
        throw new Error(`Upstream API 500 error #${i}`);
      });
    } catch (err) {
      console.log(`-> Caught error: ${err.message}`);
    }
  }

  console.log('\nCircuit breaker state after 2 failures:', ahko.circuitState);

  // Fast-fail attempt while OPEN
  try {
    console.log('Attempting new call while circuit is OPEN...');
    await ahko.schedule(async () => {
      console.log('This code should NEVER run because circuit is OPEN!');
      return 'unreachable';
    });
  } catch (err) {
    if (err instanceof AhkoCircuitBreakerOpenError) {
      console.log(`-> Fast-failed immediately with AhkoCircuitBreakerOpenError! (${err.message})`);
    }
  }

  // Wait for resetTimeoutMs cool-down window
  console.log('\nWaiting 250ms for cool-down timer to expire...');
  await sleep(250);

  console.log('Circuit breaker state after cool-down:', ahko.circuitState);

  // Probe task executes in HALF_OPEN state
  console.log('Sending probe task to test service recovery...');
  const recovery = await ahko.schedule(async () => {
    console.log('Probe task executing successfully!');
    return 'healthy';
  });

  console.log('Probe result:', recovery);
  console.log('Circuit breaker state after probe success:', ahko.circuitState);
  console.log('\nFinal scheduler stats:', ahko.stats());
}

main().catch(console.error);
