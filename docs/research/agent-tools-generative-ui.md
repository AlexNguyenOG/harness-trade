# Agent tools and generative UI plan

Status: research and implementation plan
Scope: the SvelteKit terminal in `apps/portal`; no new Worker, database, payment,
or venue-execution surface.

## Executive recommendation

Give the agent a small set of narrow, typed domain tools, not a general shell or
an unrestricted browser. Reads should return fresh, source-attributed market or
account observations. Money-changing tools should remain server-authoritative,
owner-scoped, policy-gated, durable, and idempotent. Navigation and local paper
actions should cross the existing typed client-host boundary and must never be
presented as live execution.

For generative UI, extend the existing `harness.presentation.v1` contract into
a discriminated, versioned component protocol. The model or tool selects a
known component kind and supplies schema-validated JSON; the client maps that
kind to a developer-owned Svelte component. Do **not** compile or render
model-generated MDX/Svelte. EVE explicitly says not to surface untrusted text as
markup, and its durable tool boundary is JSON-serializable. The AI SDK's
official generative-UI pattern likewise renders typed tool parts with
application-owned components rather than executing model-authored UI code.

The first useful slice is:

1. market quote, market snapshot, candles, market list/screener;
2. portfolio, positions, open orders, and deterministic risk preview;
3. paper execution with exact approval, idempotent client handoff, and receipt;
4. `PriceQuote`, `MarketSnapshot`, `PositionList`, `OrderPreview`,
   `ApprovalCard`, and `ExecutionReceipt` components;
5. local trace/eval coverage for price lookup, approved paper long, denied
   observe-mode write, stale quote, and duplicate-delivery replay.

## Primary-source findings

### EVE contracts to build on

- Tools are application-owned typed actions. They require an `inputSchema`, may
  declare an `outputSchema`, run in the trusted app runtime, and return
  JSON-serializable data. EVE exposes `ctx.session`, `ctx.callId`,
  `ctx.abortSignal`, and the final runtime tool name. See
  `node_modules/eve/docs/tools/overview.mdx`.
- Completed durable steps are replayed rather than rerun, but an interrupted
  step can rerun. EVE therefore requires non-idempotent effects to be
  idempotent or approval-gated. See
  `node_modules/eve/docs/tools/overview.mdx` and
  `node_modules/eve/docs/concepts/execution-model-and-durability.mdx`.
- Approval policies can inspect the authenticated current caller, session
  initiator, tool input, and call ID. Sensitive and financial actions should be
  approval-gated. A parked approval survives restarts and resumes the exact
  durable call. See `node_modules/eve/docs/tools/human-in-the-loop.md`.
- `useEveAgent()` exposes assistant message parts, including typed
  `dynamic-tool` parts and their durable input requests. It also supports a
  custom reducer, event callbacks, saved session state, and per-turn ephemeral
  `clientContext`. See
  `node_modules/eve/docs/guides/frontend/use-eve-agent-svelte.mdx`.
- EVE can separate the rich channel result from the smaller model-facing result
  with `toModelOutput`. This is useful for rendering a complete chart or
  portfolio card while only returning a bounded summary to the model. See
  `node_modules/eve/docs/tools/overview.mdx`.
- Per-turn `outputSchema` makes the server authoritative for a structured final
  result, but the client does not revalidate the streamed payload. Tool outputs
  should therefore carry schemas at the tool boundary and still be validated
  by the UI projector. See
  `node_modules/eve/docs/guides/client/output-schema.mdx`.
- EVE's security checklist says model- or user-controlled strings must be
  escaped for the channel surface and must not be surfaced as markup. Secrets
  remain in the trusted app runtime and only minimized tool results reach the
  model. See `node_modules/eve/docs/concepts/security-model.md`.
- Local EVE development already records bounded OpenTelemetry traces under
  `.eve/traces/v1`; authored telemetry can disable input/output capture for
  sensitive production data. See
  `node_modules/eve/docs/guides/instrumentation.md`.

### External official guidance

- The [AI SDK generative UI guide](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces)
  renders tool states/results by switching over typed message parts and placing
  developer-authored UI components in the transcript.
- The [AI SDK `UIMessage` reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message)
  defines message history as structured parts and supports typed tools and data
  parts.
- The official [Phoenix Rise SDK guide](https://docs.phoenix.trade/sdk/rise)
  exposes public exchange/market snapshots, L2 order books, trader state,
  market-stat and funding history, plus typed live streams. Those are the
  primary source surfaces behind the proposed bounded market and account tools.
- [MDsveX](https://github.com/pngwn/MDsveX) describes itself as a Markdown
  preprocessor for Svelte and turns its AST into a Svelte component. That is a
  build/content authoring facility, not a safe runtime protocol for untrusted
  model output.

The security conclusion is an inference from these primary sources: accepting
arbitrary model MDX would cross the boundary from escaped data into Svelte
component source, while the supported EVE and AI SDK seams already provide
typed JSON parts for application-owned renderers.

## Current codebase inventory

### Server/runtime tools

| Capability | Current implementation | Notes |
| --- | --- | --- |
| Current price | `apps/portal/agent/tools/get_market_price.ts` | Public Phoenix price with source and fetch time. |
| Portfolio | `apps/portal/agent/tools/get_portfolio.ts` | Authenticated EVE wallet, collateral, positions, orders, and recent transactions. |
| Trading mutation | `apps/portal/agent/tools/execute_trade.ts` | One discriminated operation union covering perp/spot place, cancel, close, reverse, TP/SL, and margin. Paper returns a client action; live uses the server trading seam. |
| Routines and alerts | `manage_routine.ts`, `list_alerts.ts` | Owner-scoped, observe-only recurring price checks. Mutations require approval. |
| Explicit memory | `remember.ts`, `list_memories.ts`, `forget_memory.ts` | Owner-scoped durable facts/preferences with basic secret exclusions. |
| General-purpose tools | `agent.ts`, `bash.ts`, `glob.ts`, `grep.ts`, `read_file.ts`, `write_file.ts`, `web_fetch.ts`, `web_search.ts` | Deliberately disabled. Keep disabled for the trading copilot. |

The root instructions in `apps/portal/agent/instructions.md` already define a
good Plan → Run → Verify → Persist discipline, distinguish Observation,
Context Mutation, Execution, Receipt, Artifact, Routine, Memory, and Mandate,
and forbid treating submitted/unknown work as confirmed.

### Client action and presentation seams

- `apps/portal/src/lib/agent/actions.ts` defines a stable registry for terminal
  navigation and writes: market/timeframe/ticket changes; perp/spot placement;
  cancellation; closing; TP/SL; break-even; reversal; margin; watchlist; and
  PAUSE.
- `apps/portal/src/lib/agent/permissions.ts` resolves PAUSE, observe/ask/auto,
  scoped rules, and notional/leverage soft caps.
- `apps/portal/src/lib/agent/host.ts` is the narrow client execution interface.
  `paper-host.ts` implements local paper-ledger behavior, and
  `routes/terminal/+page.svelte` registers the terminal-host behavior.
- `apps/portal/src/lib/agent/workstream.ts` already projects an optional
  `harness.presentation.v1` JSON envelope into one stable `WorkstreamCard`.
  It intentionally prevents navigation/context mutations from being rendered
  as execution.
- `AgentChat.svelte` renders text and EVE `dynamic-tool` parts, projects tool
  output into workstream cards, renders HITL approval buttons, persists the
  EVE session, and bridges completed paper actions to the registered client
  host.

This is a strong base, but `WorkstreamCard` is a single generic card. It loses
domain structure such as a price's change, candle series, position liquidation
distance, or an order's exact before/after state. The paper bridge now persists
consumed call IDs and receipts so restoration does not replay a completed
action, but its action arguments still need the same runtime schema validation
as the server tool input.

## Tool design principles

1. **Observations and mutations are separate tools.** A read cannot return an
   executable action disguised as data. A navigation action cannot claim a
   financial receipt.
2. **Prefer bounded domain tools over generic access.** Keep shell, files,
   unrestricted web fetch/search, and subagents disabled. Add an allowlisted
   first-party news tool only if its sources and prompt-injection handling are
   explicit.
3. **One authoritative source per field.** Price, position, order, and balance
   results include `source`, `observedAt`, and a freshness/expiry value. The
   model never fills market values.
4. **Schemas reject ambiguity.** Use strict objects, bounded arrays, normalized
   symbols, enums, finite ranges, and explicit units (`sizeUsd`, `quantity`,
   `fundingPct8h`, `slippageBps`). Avoid open-ended records on the model-facing
   input boundary.
5. **Separate UI payload from model context.** Return a complete typed
   `presentation` for the transcript and use `toModelOutput` to give the model
   only the facts needed for its next step.
6. **No hidden defaults for money.** Trade tools require all
   transaction-defining fields. Defaults are acceptable only in a draft tool
   and must be shown in the preview before approval.
7. **All writes are replay-safe.** Use a durable operation key derived from
   authenticated owner + session + `ctx.callId` + operation version. Persist
   completed and unknown receipts. Client paper actions persist consumed call
   IDs alongside their result.
8. **Unknown is a terminal state until reconciliation.** Never automatically
   replace a transaction or client action whose outcome is unknown.

## Recommended tool catalog

### Phase A — core observations

| Tool | Proposed strict input | Output and purpose | Approval |
| --- | --- | --- | --- |
| `get_market_quote` | `{ symbol }` | Bid/ask/mark/last, spread, source, `observedAt`, `expiresAt`; supersedes price-only questions while preserving `get_market_price` as compatibility alias. | None; public read. |
| `get_market_snapshot` | `{ symbol }` | Quote, 24h change/volume, funding, open interest if actually available, market status, and source timestamps. Omit unavailable fields rather than fabricate them. | None; public read. |
| `get_market_candles` | `{ symbol, timeframe, limit: 2..200 }` | Bounded OHLCV series for charts and deterministic calculations. | None; public read. |
| `get_order_book` | `{ symbol, depth: 5\|10\|20 }` | Bounded bids/asks, midpoint, spread, and observation time. | None; public read. |
| `list_markets` | `{ sortBy, direction, limit: 1..50, symbols? }` | Phoenix market rows for discovery/comparison. Use existing market/daily-stat sources in `src/lib/phoenix-market-data.ts`. | None; public read. |
| `get_news_context` | `{ symbols: 1..8, limit: 1..20, since? }` | Bounded headline records from the app's configured feed with URL, domain, publication time, and retrieval time. Treat headline/body as untrusted text. | None; allowlisted read only. |

Do not invent a separate tool when fields come from the same atomic source
snapshot. For example, quote, funding, and market status can share
`get_market_snapshot` if freshness semantics are the same.

### Phase B — account and deterministic risk

| Tool | Proposed strict input | Output and purpose | Approval |
| --- | --- | --- | --- |
| `get_portfolio_summary` | `{ accountMode: "paper"\|"live" }` | Equity, free collateral, margin used, aggregate exposure, PnL, freshness, and data completeness. | None, but owner-authenticated for private data. |
| `list_positions` | `{ accountMode, symbols?, limit }` | Exact position IDs/subaccounts, side, size, entry/mark, leverage, margin, uPnL, liquidation, TP/SL. | None; owner-authenticated. |
| `list_open_orders` | `{ accountMode, symbols?, venue?, limit }` | Canonical IDs, side/type/price/remaining/reduce-only/status. | None; owner-authenticated. |
| `get_execution_receipt` | `{ operationId }` | Reconciles confirmed/rejected/unknown state without creating a new execution. | None; owner-authenticated. |
| `preview_trade` | Exact proposed order fields plus account mode | Pure deterministic impact: required margin, estimated quantity, fees/slippage if sourced, resulting exposure, liquidation estimate, warnings, quote ID/expiry, and a plan hash. | None; pure calculation/read. |
| `preview_position_action` | Position ID plus close fraction/TP/SL/margin operation | Exact before/after state and warnings for an existing position. | None; pure calculation/read. |

Split portfolio summary, positions, and orders even if they share a backend
fetch. Smaller model-facing outputs reduce context and make the correct UI
component deterministic. An internal shared snapshot/cache can avoid duplicate
network calls.

### Phase C — controlled mutations

Keep `execute_trade` as the compatibility entry point initially, but require it
to consume a current preview:

```ts
{
  operation: "place_perp",
  previewId: string,
  planHash: string,
  quoteId: string,
  expectedAccountVersion: string
}
```

The server resolves every trade field from the immutable preview and rejects
expired quotes, changed account state, changed policy, or a mismatched owner.
Longer term, split mutation tools by approval/risk semantics:

| Tool | Scope | Approval |
| --- | --- | --- |
| `place_order` | Place a previously previewed paper/live order. | Exact-call approval in Ask; Observe denied; Auto still respects hard limits. Live behavior must not expand beyond the explicitly configured execution scope. |
| `cancel_orders` | One canonical order ID or bounded symbol-side set. | Ask in live; paper follows selected policy. |
| `close_position` | Canonical position ID and exact fraction. | Exact-call approval. |
| `update_position_protection` | TP/SL or break-even for one canonical position. | Exact-call approval. |
| `add_position_margin` | Canonical position ID and exact USD amount. | Exact-call approval. |

There should be no `close_all` or `cancel_all` model shortcut that bypasses a
bounded preview. Expand it into a preview listing every target, then approve one
immutable batch plan.

### Phase D — context, automation, and memory

| Tool | Scope | Approval |
| --- | --- | --- |
| `update_terminal_context` | Typed union for market, timeframe, panel, dock tab, ticket draft, and watchlist. It returns a context receipt, never an execution receipt. | No approval for reversible navigation; confirmation for destructive preference reset. |
| `manage_alert` | Create/update/pause/resume/delete a price/funding/risk alert with explicit timezone and expiry. | Approval for mutations; list/read free. |
| `manage_routine` | Keep existing observe-only routine scope; add last-run/next-run/failure visibility. | Existing mutation approval. Never infer a trading mandate. |
| `add_journal_note` | Append an explicit user-authored note referencing known receipts/positions. | Approval because it persists user data. Do not ship until persistence has a real owner-scoped store. |
| `remember` / `forget_memory` | Keep stable preference/fact memory. Add secret scanning and a visible diff/version receipt. | Require explicit confirmation for delete and any overwrite that changes meaning. |

Do not enable unattended trading through routines in this scope. A future
mandate system would need a separate product/security design with bounded
assets, actions, notional, leverage, expiry, revocation, and audit behavior.

## Permission and execution boundary

Use one shared policy vocabulary on server and client:

| Class | Examples | Baseline |
| --- | --- | --- |
| Public observation | quote, candles, market list | No approval; bounded and rate-limited. |
| Private observation | portfolio, positions, orders, receipts | Authenticated owner and initiator must match; no approval. |
| Context mutation | switch market, open panel, draft ticket | No approval when reversible; schema allowlist only. |
| Durable user-data mutation | memory, journal, alert, routine | User approval for create/update/delete unless a narrowly documented exception exists. |
| Paper financial mutation | place/cancel/close/update | Observe denies; Ask requires exact approval; Auto only within hard limits. Persist client idempotency. |
| Live financial mutation | place/cancel/close/update | PAUSE and policy first; exact immutable preview; owner check; simulation; server receipt; no expanded live venue behavior without a scope change. |

Rules:

- PAUSE is evaluated before every write and cannot be overridden by a model,
  memory, routine, or stale approval.
- Approval binds owner, tool, normalized input/preview hash, account mode,
  policy version, and expiry. Changing any transaction field creates a new
  approval.
- A client action is accepted only when its name exists in
  `AGENT_ACTION_META`, its arguments validate against the same schema used by
  the server tool, and its call ID has not already been consumed.
- Persist client paper results as `{ callId, action, inputHash, status,
  message, completedAt }`. On reload, render the receipt without rerunning the
  action.
- Live receipts include canonical operation ID, signatures, venue, submission
  and confirmation times, and post-execution observation. `unknown` exposes
  only a reconcile action.
- Rate-limit by authenticated owner and tool class. Bound symbol counts, result
  counts, candle counts, and response size.

## Typed generative UI protocol

Call the product vocabulary “chat components” or “generative UI,” not runtime
MDX. Markdown can remain for escaped assistant prose, with a conservative
allowlist of paragraphs, lists, emphasis, inline/code blocks, and safe links.
Raw HTML, Svelte tags, scripts, event handlers, styles, iframes, SVG, and
model-selected module imports remain forbidden.

### Envelope

Replace the all-optional v1 envelope incrementally with a strict versioned
union:

```ts
type ChatPresentation =
  | {
      schema: "harness.presentation.v2";
      id: string;
      component: "price_quote";
      data: PriceQuoteData;
      provenance: Provenance;
      actions?: ChatAction[];
    }
  | {
      schema: "harness.presentation.v2";
      id: string;
      component: "order_preview";
      data: OrderPreviewData;
      provenance: Provenance;
      actions: ChatAction[];
    }
  | {
      schema: "harness.presentation.v2";
      id: string;
      component: "execution_receipt";
      data: ExecutionReceiptData;
      provenance: Provenance;
      actions?: ChatAction[];
    };

type Provenance = {
  source: string;
  observedAt: string;
  expiresAt?: string;
  completeness?: "complete" | "partial";
};

type ChatAction = {
  id: string;
  label: string;
  action: AgentActionName;
  args: Record<string, unknown>;
  risk: "low" | "med" | "high";
  requiresApproval: boolean;
};
```

Implementation requirements:

- Define the complete union with Zod/Standard Schema and use it as tool
  `outputSchema` data. Validate again in the client projector because EVE's
  per-turn structured result documentation says the browser type does not
  revalidate streamed data.
- Keep v1 as a generic fallback while v2 components land. Unknown schema or
  component kinds render a safe `UnsupportedCard`, never raw JSON-as-markup.
- The component registry is a static map in application code. Model output
  cannot supply component paths, Svelte source, CSS, HTML, callbacks, or
  arbitrary URLs.
- Actions reference existing typed action names and pass through policy/HITL.
  A card button never calls a function encoded by the model.
- Presentation values originate from tool results. For a model-composed card,
  accept references to prior tool call IDs/field paths rather than copied
  prices or balances.
- Add `toModelOutput` to large data tools so charts/order books render rich
  bounded data without repeatedly placing every point into model context.

### Component catalog

#### Market

| Component | Required props | Primary interaction |
| --- | --- | --- |
| `PriceQuote` | symbol, last/mark, bid, ask, spread, currency, observed/expiry | Switch market; refresh after stale. |
| `MarketSnapshot` | quote, 24h change/range/volume, funding, market status | Open chart; compare. |
| `PriceSparkline` | symbol, timeframe, bounded timestamp/value points, high/low | Change timeframe; open full chart. |
| `CandlestickMiniChart` | bounded OHLCV points, timeframe, source | Open full chart. Defer until lightweight chart rendering is measured in the narrow dock. |
| `OrderBookDepth` | bounded bid/ask levels, midpoint, spread, depth | Prefill limit price, never submit. |
| `MarketComparison` | 2..8 normalized market rows with consistent fields/time | Switch market or sort locally. |
| `NewsCluster` | bounded headlines, domain, published/retrieved times, safe URL | Open source in a new tab; label stale/duplicate items. |

#### Account and risk

| Component | Required props | Primary interaction |
| --- | --- | --- |
| `PortfolioSummary` | mode, equity, available, margin, exposure, PnL, freshness | Open positions. |
| `PositionList` | canonical positions with symbol/side/size/entry/mark/uPnL | Select one position. |
| `PositionCard` | canonical ID, exposure, margin, leverage, liquidation distance, TP/SL | Preview close, protection, or margin action. |
| `OpenOrders` | canonical order IDs, type, side, price, remaining, status | Preview cancel. |
| `RiskMeter` | deterministic metrics, thresholds, warnings, methodology label | Open details; no direct execution. |
| `PnLBreakdown` | realized/unrealized/fees/funding with period and completeness | Change period locally if all data is present. |

#### Planning and execution

| Component | Required props | Primary interaction |
| --- | --- | --- |
| `TradePlan` | ordered steps and dependencies, exact account mode | Inspect; no “execute all” unless a preview exists. |
| `OrderPreview` | immutable preview ID/hash, quote expiry, exact side/size/leverage/type/protection, impact/warnings | Approve or edit. Edit creates a new preview. |
| `PositionActionPreview` | exact current and proposed state, targets, warnings | Approve or dismiss. |
| `ApprovalCard` | request ID, bound summary, expiry, policy reason, risk, account mode | Approve/deny through EVE `inputResponses`. |
| `ExecutionProgress` | operation ID and durable stages | Wait/cancel only where semantically safe. |
| `ExecutionReceipt` | confirmed/rejected/unknown, signatures/references, venue, times, resulting state | Open explorer; reconcile unknown. |
| `ReconciliationCard` | operation/signature, last checked, current known state | Refresh/reconcile; never retry automatically. |

#### Automation, memory, and system state

| Component | Required props | Primary interaction |
| --- | --- | --- |
| `AlertCard` | condition, symbol, threshold, status, last/next evaluation | Pause/resume/delete with approval. |
| `RoutineCard` | check, cadence/timezone, status, last/next run, last error | Update/pause/resume/delete. |
| `MemoryCard` | key, kind, value, provenance, version, updated time | Forget/replace with explicit confirmation. |
| `ContextReceipt` | reversible UI change and target | Undo when possible; never looks like execution. |
| `SourceList` | source labels/links and observation times | Open safe source links. |
| `StaleDataCard` | affected observation, age, expected freshness | Refresh. |
| `ErrorCard` | stable error code, user-safe message, retryability | Retry only reads; writes route to reconcile. |
| `EmptyStateCard` | queried scope and completeness | Suggest a safe next read/navigation action. |

All components need compact/dock and full-page layouts, keyboard focus states,
screen-reader labels, explicit PAPER/LIVE badges where applicable, and stable
loading/waiting/success/failed/denied/unknown states.

## Rendering flow

```text
User message
  -> EVE typed tool call
  -> tool validates input, auth, freshness, and policy
  -> JSON result + typed presentation + minimized toModelOutput
  -> durable dynamic-tool message part
  -> client validates presentation union
  -> static registry selects developer-owned Svelte component
  -> any action re-enters the typed host or EVE HITL path
  -> durable/idempotent receipt replaces progress state
```

The message/event stream remains authoritative. A custom EVE reducer can project
component state by stable presentation ID so an approval card transitions into
progress and then a receipt instead of appending contradictory cards.

## Phased implementation

### Phase 0 — harden the current bridge

1. **Done in the current PR:** persist consumed paper `toolCallId` records and
   their receipts; restoration no longer executes a completed client action.
2. Validate `paperAction.args` with the same strict schema as the registered
   action. Do not rely only on the action-name allowlist.
3. Add structured output schemas to current tools and preserve v1 fallback.
4. Add regression tests for duplicate restored tool output, account-mode
   mismatch, stale approval, PAUSE, Observe, and unknown receipt.

### Phase 1 — market and portfolio UI

1. Introduce `presentation-v2.ts` with schemas, component types, safe link
   validation, and a v1 adapter.
2. Build the registry and the six first components: `PriceQuote`,
   `MarketSnapshot`, `PositionList`, `OpenOrders`, `StaleDataCard`,
   `ErrorCard`.
3. Add `get_market_snapshot`, `get_market_candles`, `list_markets`,
   `list_positions`, and `list_open_orders`, sharing existing Phoenix fetches.
4. Add `toModelOutput` projections for candles, books, positions, and orders.
5. Render unknown component kinds safely and instrument validation failures.

### Phase 2 — preview, approval, and receipt

1. Add immutable `preview_trade` and `preview_position_action`.
2. Require preview ID/hash/expiry/account version for mutation tools.
3. Build `TradePlan`, `OrderPreview`, `PositionActionPreview`,
   `ApprovalCard`, `ExecutionProgress`, `ExecutionReceipt`, and
   `ReconciliationCard`.
4. Collapse component state by stable ID through a custom EVE reducer.
5. Verify an approved paper order, denied Observe order, PAUSE denial, expired
   preview, account-state change, duplicate delivery, and unknown receipt.

### Phase 3 — richer observations and automation

1. Add order-book, comparison, funding/risk, and allowlisted news tools only
   where the underlying source actually supplies the field.
2. Add chart, depth, comparison, risk, and news components.
3. Add richer alert/routine status and their typed cards.
4. Add owner-scoped journal tools only after a real persistence contract exists.

### Explicitly deferred

- Arbitrary model-generated MDX/Svelte/HTML/CSS.
- Runtime installation or import of components selected by the model.
- General shell, filesystem, unrestricted web search/fetch, or agent
  delegation.
- New live Solana execution behavior, unattended trading, database, Worker,
  x402, or payment infrastructure without an explicit scope change.

## Validation and observability

### Unit/contract tests

- Every tool input/output schema: valid examples plus unknown fields, wrong
  units, non-finite values, oversized arrays, unsupported symbols, and unsafe
  URLs.
- Presentation parser: every component, v1 fallback, unknown version/kind,
  partial/malformed data, and escaped untrusted strings.
- Policy matrix: public/private/context/durable-data/paper/live across
  observe/ask/auto/PAUSE, caps, owner mismatch, and expired approval.
- Idempotency: same call twice, reload restoration, interrupted action,
  confirmed replay, rejected replay, unknown replay.
- Freshness: expired quote, mixed observation times, partial source failure.

### Browser/e2e scenarios

1. “What is SOL?” renders a current `PriceQuote` with Phoenix attribution.
2. “Compare SOL and BTC” renders aligned market rows with one observation time
   per source and no fabricated missing fields.
3. “Long SOL $10 at 1x in PAPER” renders preview → exact approval → progress →
   confirmed paper receipt, and one ledger mutation after reload.
4. The same request in Observe is denied with no host invocation.
5. PAUSE blocks writes while market reads still work.
6. An expired preview offers Refresh/Edit, not Approve.
7. A simulated unknown receipt offers Reconcile and never silently retries.
8. Untrusted news/model strings render as text, not markup or executable UI.

Run the repository-required `bun run typecheck`, `bun run build`, relevant unit
tests, and browser smoke at `http://localhost:3000/terminal` for each visible
slice.

### Operational signals

Use EVE's local traces first. For production, define low-cardinality,
non-sensitive fields such as:

- tool name/class, session/turn/call ID, account mode, policy decision/reason;
- source latency, observation age, output byte/row count, schema version;
- presentation component, validation/fallback result, render latency;
- approval wait duration and outcome;
- operation ID, idempotency hit/miss, receipt state, reconciliation count;
- model/tool token and failure counts from EVE's existing trace/run metadata.

Do not record full prompts, private portfolio payloads, wallet data, or model
outputs in third-party telemetry by default. EVE's instrumentation guide
explicitly supports disabling recorded inputs and outputs.

## Decision summary

The repo does not need an MDX runtime to achieve generative UI. It already has
the right primitives: typed EVE tool parts, durable approvals, a server/client
action boundary, a presentation envelope, and a Svelte renderer. The next
architecture step is to make that presentation envelope a strict component
union, broaden high-value read and preview tools, and make every mutation
replay-safe. This produces richer chat UI while preserving the terminal's
financial trust boundaries.
