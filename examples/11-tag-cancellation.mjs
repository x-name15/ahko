/**
 * Example 11: Task Classification & Selective Cancellation via Tags
 *
 * Demonstrates tagging tasks, querying active/pending stats by tag,
 * and selectively cancelling specific task groups without interrupting others.
 *
 * Run: node examples/11-tag-cancellation.mjs
 */

import { Ahko, AhkoCancellationError } from "../dist/index.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log("=== Example 11: Task Tags & Selective Cancellation ===\n");

  const ahko = new Ahko({ concurrency: 1 });

  console.log("Scheduling background jobs with tags [report-gen] and [user-export]...");

  const task1 = ahko.schedule(
    async () => {
      console.log("  [report-gen] Generating annual financial report...");
      await sleep(150);
      return "Financial report ready";
    },
    { tags: ["report-gen", "finance"] }
  );

  const task2 = ahko.schedule(
    async () => {
      console.log("  [user-export] Exporting user data archive...");
      await sleep(150);
      return "User data exported";
    },
    { tags: ["user-export"] }
  );

  const task3 = ahko.schedule(
    async () => {
      console.log("  [report-gen] Generating monthly summary report...");
      await sleep(100);
      return "Monthly summary ready";
    },
    { tags: ["report-gen", "analytics"] }
  );

  console.log("\nTag telemetry snapshot:");
  console.log("  report-gen stats:", ahko.statsByTag("report-gen"));
  console.log("  user-export stats:", ahko.statsByTag("user-export"));

  console.log("\nCancelling all [report-gen] tasks (e.g. user cancelled dashboard request)...");
  const cancelledCount = ahko.cancelByTag("report-gen", "User aborted dashboard generation");
  console.log(`Cancelled ${cancelledCount} task(s) tagged with "report-gen".`);

  try {
    await task1;
  } catch (err) {
    if (err instanceof AhkoCancellationError) {
      console.log("  Task 1 successfully caught cancellation:", err.message);
    }
  }

  try {
    await task3;
  } catch (err) {
    if (err instanceof AhkoCancellationError) {
      console.log("  Task 3 successfully caught cancellation:", err.message);
    }
  }

  const exportResult = await task2;
  console.log("\nTask 2 finished untouched:", exportResult);
  console.log("Final scheduler stats:", ahko.stats());
}

main().catch(console.error);
