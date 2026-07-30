import { defineSchedule } from "eve/schedules";
import { sweepObserveRoutines } from "../lib/routine-sweeper";

export default defineSchedule({
  cron: "* * * * *",
  run({ appAuth, waitUntil }) {
    if (
      appAuth.principalType !== "runtime" ||
      appAuth.principalId !== "eve:app"
    ) {
      throw new Error("routine-sweep-app-principal-required");
    }
    // The scheduler performs public reads and private Blob writes directly.
    // It never starts a user session, assumes a user principal, resolves a
    // wallet, or imports any transaction/signing module.
    waitUntil(sweepObserveRoutines());
  },
});
