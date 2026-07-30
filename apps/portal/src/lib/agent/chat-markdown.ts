export type ChatInline =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "emphasis"; text: string }
  | { kind: "strikethrough"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

export type ChatTableAlignment = "left" | "center" | "right" | null;

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
      level: 1 | 2 | 3 | 4 | 5 | 6;
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
    }
  | {
      kind: "task-list";
      items: Array<{ checked: boolean; inlines: ChatInline[] }>;
    }
  | {
      kind: "table";
      headers: ChatInline[][];
      alignments: ChatTableAlignment[];
      rows: ChatInline[][][];
    }
  | {
      kind: "thematic-break";
    };

const FENCE = /^```([\w-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.+)$/;
const TASK_ITEM = /^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/;
const UNORDERED_ITEM = /^\s*[-*+]\s+(.+)$/;
const ORDERED_ITEM = /^\s*\d+[.)]\s+(.+)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const THEMATIC_BREAK = /^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/;
const TABLE_DELIMITER = /^:?-{3,}:?$/;

/**
 * Parse the common GitHub-flavored Markdown shapes used in chat without ever
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

    const table = tableAt(lines, index);
    if (table) {
      blocks.push(table.block);
      index = table.end;
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
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        inlines: parseChatInline(heading[2]),
      });
      index += 1;
      continue;
    }

    if (THEMATIC_BREAK.test(line)) {
      blocks.push({ kind: "thematic-break" });
      index += 1;
      continue;
    }

    if (TASK_ITEM.test(line)) {
      const items: Array<{ checked: boolean; inlines: ChatInline[] }> = [];
      while (index < lines.length) {
        const item = (lines[index] ?? "").match(TASK_ITEM);
        if (!item) break;
        items.push({
          checked: item[1].toLowerCase() === "x",
          inlines: parseChatInline(item[2]),
        });
        index += 1;
      }
      blocks.push({ kind: "task-list", items });
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
      !startsBlock(lines, index)
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

    const strikethrough = delimitedAt(source, cursor, "~~", "~~");
    if (strikethrough) {
      flush();
      tokens.push({ kind: "strikethrough", text: strikethrough.text });
      cursor = strikethrough.end;
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

function startsBlock(lines: string[], index: number): boolean {
  const line = lines[index] ?? "";
  return (
    Boolean(tableAt(lines, index)) ||
    FENCE.test(line) ||
    HEADING.test(line) ||
    THEMATIC_BREAK.test(line) ||
    TASK_ITEM.test(line) ||
    UNORDERED_ITEM.test(line) ||
    ORDERED_ITEM.test(line) ||
    QUOTE.test(line)
  );
}

function tableAt(
  lines: string[],
  index: number,
): {
  block: Extract<ChatMarkdownBlock, { kind: "table" }>;
  end: number;
} | null {
  const headerLine = lines[index] ?? "";
  const delimiterLine = lines[index + 1] ?? "";
  if (!hasTablePipe(headerLine) || !hasTablePipe(delimiterLine)) return null;

  const headerCells = splitTableRow(headerLine);
  const delimiterCells = splitTableRow(delimiterLine);
  if (
    headerCells.length < 2 ||
    delimiterCells.length !== headerCells.length ||
    delimiterCells.some((cell) => !TABLE_DELIMITER.test(cell.trim()))
  ) {
    return null;
  }

  const alignments = delimiterCells.map(tableAlignment);
  const rows: ChatInline[][][] = [];
  let cursor = index + 2;

  while (cursor < lines.length) {
    const rowLine = lines[cursor] ?? "";
    if (!rowLine.trim() || !hasTablePipe(rowLine)) break;
    const cells = splitTableRow(rowLine);
    rows.push(
      headerCells.map((_, cellIndex) =>
        parseChatInline((cells[cellIndex] ?? "").trim()),
      ),
    );
    cursor += 1;
  }

  return {
    block: {
      kind: "table",
      headers: headerCells.map((cell) => parseChatInline(cell.trim())),
      alignments,
      rows,
    },
    end: cursor,
  };
}

function hasTablePipe(line: string): boolean {
  let escaped = false;
  let inCode = false;

  for (const character of line) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "`") {
      inCode = !inCode;
      continue;
    }
    if (character === "|" && !inCode) return true;
  }

  return false;
}

function splitTableRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let escaped = false;
  let inCode = false;

  for (const character of line.trim()) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "`") {
      inCode = !inCode;
      current += character;
      continue;
    }
    if (character === "|" && !inCode) {
      cells.push(current);
      current = "";
      continue;
    }
    current += character;
  }

  if (escaped) current += "\\";
  cells.push(current);
  if (!cells[0]?.trim()) cells.shift();
  if (!cells.at(-1)?.trim()) cells.pop();
  return cells;
}

function tableAlignment(cell: string): ChatTableAlignment {
  const value = cell.trim();
  if (value.startsWith(":") && value.endsWith(":")) return "center";
  if (value.endsWith(":")) return "right";
  if (value.startsWith(":")) return "left";
  return null;
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
