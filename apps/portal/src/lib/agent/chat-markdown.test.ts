import { describe, expect, test } from "bun:test";
import { parseChatMarkdown } from "./chat-markdown";

describe("parseChatMarkdown", () => {
  test("parses assistant emphasis without HTML", () => {
    expect(
      parseChatMarkdown(
        "**SOL (Solana): $74.71** — *flat* with `Phoenix` data.",
      ),
    ).toEqual([
      {
        kind: "paragraph",
        inlines: [
          { kind: "strong", text: "SOL (Solana): $74.71" },
          { kind: "text", text: " — " },
          { kind: "emphasis", text: "flat" },
          { kind: "text", text: " with " },
          { kind: "code", text: "Phoenix" },
          { kind: "text", text: " data." },
        ],
      },
    ]);
  });

  test("parses lists, headings, quotes, and fenced code", () => {
    const blocks = parseChatMarkdown(
      [
        "### Plan",
        "",
        "- Fetch price",
        "- Check risk",
        "",
        "> Paper only",
        "",
        "```json",
        '{"symbol":"SOL"}',
        "```",
      ].join("\n"),
    );

    expect(blocks.map((block) => block.kind)).toEqual([
      "heading",
      "unordered-list",
      "quote",
      "code",
    ]);
  });

  test("allows web links and leaves unsafe links as text", () => {
    const [block] = parseChatMarkdown(
      "[Explorer](https://solscan.io/tx/abc) [bad](javascript:alert(1))",
    );
    expect(block.kind).toBe("paragraph");
    if (block.kind !== "paragraph") return;
    expect(block.inlines[0]).toMatchObject({
      kind: "link",
      href: "https://solscan.io/tx/abc",
    });
    expect(block.inlines.some((token) => token.kind === "link")).toBe(true);
    expect(
      block.inlines.some((token) => token.text.includes("javascript")),
    ).toBe(true);
  });
});
