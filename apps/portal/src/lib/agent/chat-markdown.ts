export type ChatInline =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "emphasis"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

export type ChatMarkdownBlock =
  | {
      kind: "paragraph";
      inlines: ChatInline[];
    }
  | {
      kind: "quote";
      inlines: ChatInline[];
    }
  | {
      kind: "heading";
      level: 1 | 2 | 3;
      inlines: ChatInline[];
    }
  | {
      kind: "unordered-list";
      items: ChatInline[][];
    }
  | {
      kind: "ordered-list";
      items: ChatInline[][];
    }
  | {
      kind: "code";
      language: string;
      text: string;
    };

const FENCE = /^```([\w-]*)\s*$/;
const HEADING = /^(#{1,3})\s+(.+)$/;
const UNORDERED_ITEM = /^\s*[-*]\s+(.+)$/;
const ORDERED_ITEM = /^\s*\d+[.)]\s+(.+)$/;
const QUOTE = /^\s*>\s?(.*)$/;

/**
 * Parse the small, useful Markdown subset expected in chat without ever
 * passing model output through `{@html}`.
 */
export function parseChatMarkdown(source: string): ChatMarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ChatMarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index] ?? "")) {
        body.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({
        kind: "code",
        language: fence[1] ?? "",
        text: body.join("\n"),
      });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3,
        inlines: parseChatInline(heading[2]),
      });
      index += 1;
      continue;
    }

    if (UNORDERED_ITEM.test(line)) {
      const items: ChatInline[][] = [];
      while (index < lines.length) {
        const item = (lines[index] ?? "").match(UNORDERED_ITEM);
        if (!item) break;
        items.push(parseChatInline(item[1]));
        index += 1;
      }
      blocks.push({ kind: "unordered-list", items });
      continue;
    }

    if (ORDERED_ITEM.test(line)) {
      const items: ChatInline[][] = [];
      while (index < lines.length) {
        const item = (lines[index] ?? "").match(ORDERED_ITEM);
        if (!item) break;
        items.push(parseChatInline(item[1]));
        index += 1;
      }
      blocks.push({ kind: "ordered-list", items });
      continue;
    }

    if (QUOTE.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const quote = (lines[index] ?? "").match(QUOTE);
        if (!quote) break;
        quoteLines.push(quote[1]);
        index += 1;
      }
      blocks.push({
        kind: "quote",
        inlines: parseChatInline(quoteLines.join("\n")),
      });
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (
      index < lines.length &&
      (lines[index] ?? "").trim() &&
      !startsBlock(lines[index] ?? "")
    ) {
      paragraph.push(lines[index] ?? "");
      index += 1;
    }
    blocks.push({
      kind: "paragraph",
      inlines: parseChatInline(paragraph.join("\n")),
    });
  }

  return blocks;
}

export function parseChatInline(source: string): ChatInline[] {
  const tokens: ChatInline[] = [];
  let cursor = 0;
  let plain = "";

  const flush = () => {
    if (!plain) return;
    tokens.push({ kind: "text", text: plain });
    plain = "";
  };

  while (cursor < source.length) {
    if (source[cursor] === "\\" && cursor + 1 < source.length) {
      plain += source[cursor + 1];
      cursor += 2;
      continue;
    }

    const code = delimitedAt(source, cursor, "`", "`");
    if (code) {
      flush();
      tokens.push({ kind: "code", text: code.text });
      cursor = code.end;
      continue;
    }

    const strong =
      delimitedAt(source, cursor, "**", "**") ??
      delimitedAt(source, cursor, "__", "__");
    if (strong) {
      flush();
      tokens.push({ kind: "strong", text: strong.text });
      cursor = strong.end;
      continue;
    }

    const link = linkAt(source, cursor);
    if (link) {
      flush();
      tokens.push(link);
      cursor = link.end;
      continue;
    }

    const emphasis =
      delimitedAt(source, cursor, "*", "*") ??
      delimitedAt(source, cursor, "_", "_");
    if (emphasis) {
      flush();
      tokens.push({ kind: "emphasis", text: emphasis.text });
      cursor = emphasis.end;
      continue;
    }

    plain += source[cursor];
    cursor += 1;
  }

  flush();
  return tokens;
}

function startsBlock(line: string): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    UNORDERED_ITEM.test(line) ||
    ORDERED_ITEM.test(line) ||
    QUOTE.test(line)
  );
}

function delimitedAt(
  source: string,
  cursor: number,
  open: string,
  close: string,
): { text: string; end: number } | null {
  if (!source.startsWith(open, cursor)) return null;
  const contentStart = cursor + open.length;
  const contentEnd = source.indexOf(close, contentStart);
  if (contentEnd <= contentStart) return null;
  return {
    text: source.slice(contentStart, contentEnd),
    end: contentEnd + close.length,
  };
}

function linkAt(
  source: string,
  cursor: number,
): (Extract<ChatInline, { kind: "link" }> & { end: number }) | null {
  if (source[cursor] !== "[") return null;
  const labelEnd = source.indexOf("](", cursor + 1);
  if (labelEnd < 0) return null;
  const hrefEnd = source.indexOf(")", labelEnd + 2);
  if (hrefEnd < 0) return null;

  const text = source.slice(cursor + 1, labelEnd);
  const href = safeHref(source.slice(labelEnd + 2, hrefEnd));
  if (!text || !href) return null;
  return { kind: "link", text, href, end: hrefEnd + 1 };
}

function safeHref(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
