<script lang="ts">
  import {
    parseChatMarkdown,
    type ChatInline,
  } from "$lib/agent/chat-markdown";

  let { source }: { source: string } = $props();
  const blocks = $derived(parseChatMarkdown(source));
</script>

{#snippet inline(tokens: ChatInline[])}
  {#each tokens as token}
    {#if token.kind === "strong"}
      <strong>{token.text}</strong>
    {:else if token.kind === "emphasis"}
      <em>{token.text}</em>
    {:else if token.kind === "strikethrough"}
      <s>{token.text}</s>
    {:else if token.kind === "code"}
      <code>{token.text}</code>
    {:else if token.kind === "link"}
      <a href={token.href} target="_blank" rel="noreferrer">{token.text}</a>
    {:else}
      {token.text}
    {/if}
  {/each}
{/snippet}

<div class="markdown">
  {#each blocks as block}
    {#if block.kind === "paragraph"}
      <p>{@render inline(block.inlines)}</p>
    {:else if block.kind === "heading"}
      {#if block.level === 1}
        <h1>{@render inline(block.inlines)}</h1>
      {:else if block.level === 2}
        <h2>{@render inline(block.inlines)}</h2>
      {:else if block.level === 3}
        <h3>{@render inline(block.inlines)}</h3>
      {:else if block.level === 4}
        <h4>{@render inline(block.inlines)}</h4>
      {:else if block.level === 5}
        <h5>{@render inline(block.inlines)}</h5>
      {:else}
        <h6>{@render inline(block.inlines)}</h6>
      {/if}
    {:else if block.kind === "quote"}
      <blockquote>{@render inline(block.inlines)}</blockquote>
    {:else if block.kind === "unordered-list"}
      <ul>
        {#each block.items as item}
          <li>{@render inline(item)}</li>
        {/each}
      </ul>
    {:else if block.kind === "ordered-list"}
      <ol>
        {#each block.items as item}
          <li>{@render inline(item)}</li>
        {/each}
      </ol>
    {:else if block.kind === "task-list"}
      <ul class="task-list">
        {#each block.items as item}
          <li>
            <input
              type="checkbox"
              checked={item.checked}
              disabled
              aria-label={item.checked ? "Complete" : "Incomplete"}
            />
            <span>{@render inline(item.inlines)}</span>
          </li>
        {/each}
      </ul>
    {:else if block.kind === "table"}
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              {#each block.headers as header, index}
                <th
                  class:align-center={block.alignments[index] === "center"}
                  class:align-right={block.alignments[index] === "right"}
                >
                  {@render inline(header)}
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each block.rows as row}
              <tr>
                {#each row as cell, index}
                  <td
                    class:align-center={block.alignments[index] === "center"}
                    class:align-right={block.alignments[index] === "right"}
                  >
                    {@render inline(cell)}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else if block.kind === "thematic-break"}
      <hr />
    {:else if block.kind === "code"}
      <div class="code-block">
        {#if block.language}
          <span class="code-language">{block.language}</span>
        {/if}
        <pre><code>{block.text}</code></pre>
      </div>
    {/if}
  {/each}
</div>

<style>
  .markdown {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
    white-space: normal;
  }

  p,
  blockquote,
  ul,
  ol,
  pre,
  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    margin: 0;
  }

  p,
  blockquote,
  li {
    white-space: pre-wrap;
  }

  strong {
    color: var(--ink);
    font-weight: 750;
  }

  em {
    color: var(--muted);
  }

  s {
    color: var(--muted);
    text-decoration-thickness: 1px;
  }

  a {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 0.16em;
  }

  code {
    padding: 0.08rem 0.24rem;
    border: 1px solid var(--line-soft);
    color: var(--ink);
    background: var(--surface-2);
    font: inherit;
    font-family: var(--font-mono);
    font-size: 0.86em;
  }

  .code-block {
    position: relative;
    min-width: 0;
  }

  pre {
    overflow-x: auto;
    padding: 0.65rem;
    border: 1px solid var(--line-soft);
    background: var(--surface-2);
    white-space: pre;
  }

  pre code {
    padding: 0;
    border: 0;
    background: transparent;
  }

  .code-language {
    display: block;
    padding: 0.24rem 0.65rem;
    border: 1px solid var(--line-soft);
    border-bottom: 0;
    color: var(--muted);
    background: var(--surface);
    font-family: var(--font-mono);
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .code-language + pre {
    border-top-color: var(--line);
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    color: var(--ink);
    font-weight: 750;
    line-height: 1.3;
  }

  h1 {
    font-size: 1.12em;
  }

  h2 {
    font-size: 1.06em;
  }

  h3 {
    font-size: 1em;
  }

  h4,
  h5,
  h6 {
    font-size: 0.94em;
  }

  blockquote {
    padding-left: 0.65rem;
    border-left: 1px solid var(--line);
    color: var(--muted);
  }

  ul,
  ol {
    display: grid;
    gap: 0.22rem;
    padding-left: 1.25rem;
  }

  .task-list {
    padding-left: 0;
    list-style: none;
  }

  .task-list li {
    display: grid;
    grid-template-columns: 0.9rem minmax(0, 1fr);
    gap: 0.42rem;
    align-items: start;
  }

  .task-list input {
    width: 0.78rem;
    height: 0.78rem;
    margin: 0.18rem 0 0;
    accent-color: var(--accent);
  }

  .table-scroll {
    max-width: 100%;
    overflow-x: auto;
    border: 1px solid var(--line-soft);
  }

  table {
    width: max-content;
    min-width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  th,
  td {
    padding: 0.38rem 0.5rem;
    border-right: 1px solid var(--line-soft);
    border-bottom: 1px solid var(--line-soft);
    text-align: left;
    white-space: nowrap;
  }

  th:last-child,
  td:last-child {
    border-right: 0;
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }

  th {
    color: var(--muted);
    background: var(--surface-2);
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  td {
    color: var(--ink);
  }

  .align-center {
    text-align: center;
  }

  .align-right {
    text-align: right;
  }

  hr {
    width: 100%;
    margin: 0.1rem 0;
    border: 0;
    border-top: 1px solid var(--line);
  }
</style>
