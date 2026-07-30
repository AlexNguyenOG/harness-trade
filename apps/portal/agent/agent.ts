import { deepseek } from "@ai-sdk/deepseek";
import { defineAgent } from "eve";

export default defineAgent({
  description:
    "A persistent, authenticated trading copilot for the Harness terminal.",
  model: deepseek("deepseek-chat"),
  reasoning: "provider-default",
  compaction: { thresholdPercent: 0.78 },
  build: {
    externalDependencies: ["@ellipsis-labs/rise", "@solana/web3.js", "buffer"],
  },
});
