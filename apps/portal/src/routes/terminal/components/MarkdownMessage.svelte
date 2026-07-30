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
      <p class="heading heading-{block.level}">
        {@render inline(block.inlines)}
      </p>
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
    {:else if block.kind === "code"}
      <pre><code>{block.text}</code></pre>
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
  pre {
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

  .heading {
    color: var(--ink);
    font-weight: 750;
    line-height: 1.3;
  }

  .heading-1 {
    font-size: 1.12em;
  }

  .heading-2 {
    font-size: 1.06em;
  }

  .heading-3 {
    font-size: 1em;
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
</style>
