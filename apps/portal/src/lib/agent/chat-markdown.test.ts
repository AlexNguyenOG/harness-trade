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

  test("parses aligned tables without treating ordinary pipes as tables", () => {
    const blocks = parseChatMarkdown(
      [
        "| Asset | Side | PnL |",
        "| :--- | :---: | ---: |",
        "| **SOL** | *Long* | +$12.40 |",
        "| ETH | `Flat \\| waiting` | -- |",
        "",
        "Use BTC | SOL to compare markets.",
      ].join("\n"),
    );

    expect(blocks[0]).toMatchObject({
      kind: "table",
      alignments: ["left", "center", "right"],
    });
    if (blocks[0]?.kind !== "table") return;
    expect(blocks[0].headers).toHaveLength(3);
    expect(blocks[0].rows).toHaveLength(2);
    expect(blocks[0].rows[0]?.[0]?.[0]).toEqual({
      kind: "strong",
      text: "SOL",
    });
    expect(blocks[0].rows[1]?.[1]?.[0]).toEqual({
      kind: "code",
      text: "Flat | waiting",
    });
    expect(blocks[1]?.kind).toBe("paragraph");
  });

  test("parses task lists, strikethrough, horizontal rules, and small headings", () => {
    const blocks = parseChatMarkdown(
      [
        "###### Checklist",
        "- [x] Quote fetched",
        "- [ ] Order reviewed",
        "---",
        "Risk is ~~unbounded~~ capped.",
      ].join("\n"),
    );

    expect(blocks.map((block) => block.kind)).toEqual([
      "heading",
      "task-list",
      "thematic-break",
      "paragraph",
    ]);
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 6 });
    expect(blocks[1]).toMatchObject({
      kind: "task-list",
      items: [{ checked: true }, { checked: false }],
    });
    expect(blocks[3]).toMatchObject({
      kind: "paragraph",
      inlines: [
        { kind: "text", text: "Risk is " },
        { kind: "strikethrough", text: "unbounded" },
        { kind: "text", text: " capped." },
      ],
    });
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
