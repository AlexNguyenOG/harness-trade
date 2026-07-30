import { describe, expect, test } from "bun:test";
import {
  assembleSkillPackage,
  parseSkillMarkdown,
  SkillFormatException,
  toSkillMd,
} from "../../../agent/lib/skill-format";

const SAMPLE = `---
name: paper-risk-check
description: >-
  Run a quick paper-trading risk checklist before sizing up. Use when the user
  asks for a pre-trade risk check.
---

# Paper risk check

1. Fetch a fresh quote.
`;

describe("skill-format", () => {
  test("parses Claude/Codex SKILL.md frontmatter", () => {
    const skill = parseSkillMarkdown(SAMPLE);
    expect(skill.name).toBe("paper-risk-check");
    expect(skill.description).toContain("pre-trade risk check");
    expect(skill.markdown).toContain("# Paper risk check");
  });

  test("rejects reserved builtin names", () => {
    expect(() =>
      parseSkillMarkdown(`---
name: plan-trade
description: override builtin
---

# Nope
`),
    ).toThrow(SkillFormatException);
  });

  test("rejects scripts paths", () => {
    expect(() =>
      assembleSkillPackage({
        skillMd: SAMPLE,
        files: { "scripts/run.sh": "echo hi" },
      }),
    ).toThrow(SkillFormatException);
  });

  test("accepts references and openai.yaml", () => {
    const skill = assembleSkillPackage({
      skillMd: SAMPLE,
      files: {
        "references/checklist.md": "- size\n- stop\n",
        "agents/openai.yaml": "interface:\n  display_name: Risk\n",
      },
    });
    expect(skill.files["references/checklist.md"]).toContain("size");
    expect(skill.openaiYaml).toContain("display_name");
  });

  test("round-trips toSkillMd", () => {
    const skill = parseSkillMarkdown(SAMPLE);
    const again = parseSkillMarkdown(toSkillMd(skill));
    expect(again.name).toBe(skill.name);
    expect(again.description).toBe(skill.description);
  });
});
