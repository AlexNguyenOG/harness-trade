import { defineAgent } from "eve";

export default defineAgent({
  description:
    "A persistent, authenticated trading copilot for the Harness terminal.",
  model: "openai/gpt-5.4",
  reasoning: "medium",
  compaction: { thresholdPercent: 0.78 },
});
