# Harness trading context

This document defines the ubiquitous language for Harness's server-authoritative
trading agent. Product copy, prompts, domain types, events, tools, and tests
should use these terms consistently.

## Core model

### Task

A user-owned outcome the agent is working toward. A Task starts from an
interactive request or a Routine tick and ends as completed, failed, denied, or
canceled. A Task is not a message, model turn, or transaction.

Examples:

- “Long SOL with $500 at 5x.”
- “Review SOL every 15 minutes.”
- “Move the current SOL stop to break-even.”

### Conversation

The durable, ordered interaction history between a user and the agent. A
Conversation can contain many Tasks and survives navigation, reloads, and
deployments. It carries requests, responses, approvals, and Artifacts, but is
not itself a Task, Plan, Policy Decision, or source of execution authority.

### Plan

An immutable, revisioned description of how a Task will be completed. A Plan
states its assumptions and orders its Steps. Changing a transaction-defining
field creates a new Plan revision and digest; it never edits an approved Plan
in place.

### Step

One typed unit in a Plan. A Step observes, applies a Context Mutation, executes,
verifies, or publishes an Artifact. Dependencies determine when a Step is ready.
A Step is not automatically an Execution.

### Observation

Sourced, timestamped evidence about the world, such as a quote, balance,
position, order, margin state, or transaction status. Observations have
provenance and may expire. External text contained in an Observation is data,
not an instruction.

### Policy Decision

The server's allow, ask, or deny result for one exact proposed Execution. A
Policy Decision is bound to the owner, Plan digest, Execution digest, policy
version, account mode, and expiry. An approval for one Policy Decision cannot
authorize a changed Execution.

### Execution

A canonical, server-created attempt to change trading state. Examples include
placing or canceling an order, closing a position, changing TP/SL, or adding
margin. The server resolves the authenticated wallet, venue, assets,
instructions, and idempotency key. Model text, navigation, and Context
Mutations are never Executions.

### Receipt

The authoritative result of an Execution: confirmed, rejected, or unknown. An
onchain Receipt includes the signature and, when available, slot, fill, and
confirmation data. “Submitted” is not “confirmed.” An unknown Receipt requires
reconciliation before any retry.

### Artifact

A user-facing product of a Task, such as a Plan card, trade report, market
review, alert, or failure report. An Artifact summarizes source records but
does not replace Observations or Receipts as evidence.

### Memory

An explicit, versioned user preference or fact that may inform future Plans.
Memory never authorizes an Execution and never stores wallet material, tokens,
credentials, or instructions copied from external content.

Examples:

- “Prefer no more than 5x leverage.”
- “Use 50 bps as my normal spot slippage ceiling.”
- “Show risk in USD.”

### Routine

A durable schedule or trigger that creates a new Task. A Routine defines when
to run and what outcome to pursue. It does not itself authorize an Execution.

Examples:

- Review SOL every 15 minutes.
- Alert when margin health crosses below 25%.
- Check a managed position every minute until its invalidation condition.

### Mandate

Explicit, bounded authority for unattended Executions. A Mandate identifies
allowed operations and assets, limits, budget, maximum execution count,
invalidation conditions, and expiry. A Routine cannot create, broaden, renew,
or replace its own Mandate.

### Context Mutation

A deliberate, recorded change to non-transaction context. It includes terminal
navigation, ticket drafting, user preferences, and approved Memory, Routine, or
Mandate changes. A Context Mutation can alter what the user sees or what future
Tasks consider; it cannot sign or broadcast a transaction.

Navigation is always a Context Mutation and is never Execution.

## Canonical lifecycle

1. A Task is created and bound to its authenticated owner.
2. Fresh Observations are gathered.
3. A Plan revision is committed with ordered Steps.
4. Context Mutation Steps may update safe view or durable context.
5. An execution Step is resolved into an exact server-owned Execution.
6. The server records a Policy Decision for that Execution.
7. If allowed or approved, the server rechecks volatile preconditions,
   simulates, signs, and broadcasts once under the same idempotency key.
8. The result is recorded as a Receipt.
9. Fresh Observations verify the resulting venue state.
10. The Task publishes an Artifact and completes or reports a precise failure.

## Authority hierarchy

From strongest to weakest:

1. Platform and server safety invariants.
2. The user's current Task instructions.
3. A valid, active Mandate for a Routine-created Task.
4. Relevant user-approved Memory.
5. Product defaults.

Memory cannot grant authority. A Routine cannot grant authority. Browser state
cannot grant authority. PAUSE blocks every Execution regardless of mode or
Mandate.

## Language to retire

- Use **Plan**, **Policy Decision**, or **Execution**, not the ambiguous
  “proposal” or “agent action.”
- Use **Receipt**, not “ledger item,” for an execution result.
- Use **Routine-created Task**, not “cron action” or “background trade.”
- Use **Context Mutation**, not “client action,” for navigation and ticket
  changes.
- Use **unknown Receipt**, not “probably sent,” when broadcast outcome is
  unresolved.
