import type { SessionContext } from "eve/context";
import { defineDynamic, defineSkill } from "eve/skills";
import { skillStore } from "../lib/skill-store";

function authenticatedOwner(ctx: SessionContext): string | null {
  const current = ctx.session.auth.current;
  const initiator = ctx.session.auth.initiator;
  if (
    current?.principalType !== "user" ||
    initiator?.principalType !== "user" ||
    current.principalId !== initiator.principalId
  ) {
    return null;
  }
  return current.principalId;
}

function skillFiles(
  files: Record<string, string>,
  openaiYaml: string | null,
): Record<string, string> | undefined {
  const out: Record<string, string> = { ...files };
  if (openaiYaml) out["agents/openai.yaml"] = openaiYaml;
  return Object.keys(out).length > 0 ? out : undefined;
}

export default defineDynamic({
  events: {
    "session.started": async (_event, ctx) => {
      const ownerId = authenticatedOwner(ctx);
      if (!ownerId) return null;
      let skills: Awaited<ReturnType<typeof skillStore.listEnabled>>;
      try {
        skills = await skillStore.listEnabled(ownerId);
      } catch {
        return null;
      }
      if (skills.length === 0) return null;

      const entries: Record<string, ReturnType<typeof defineSkill>> = {};
      for (const skill of skills) {
        // Namespace user skills so they never collide with first-party packs.
        const key = `user-${skill.name}`;
        entries[key] = defineSkill({
          description: skill.description,
          markdown: skill.markdown,
          files: skillFiles(skill.files, skill.openaiYaml),
          metadata: {
            source: "user",
            format: "agentskills",
            originalName: skill.name,
          },
        });
      }
      return entries;
    },
  },
});
