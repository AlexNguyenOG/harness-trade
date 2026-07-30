---
description: Plan, execute, and verify a trade or position-management request without inventing transaction parameters.
---

# Plan a trade

Use this only for an explicit account-changing request.

1. Fetch the fresh quote and relevant portfolio or order state.
2. Resolve the exact asset, side, size, leverage, order type, protection, and
   account mode. The model may choose conservative values the user explicitly
   delegated. Ask one short question only for a material choice that was not
   stated or delegated.
3. Call `execute_trade` once with the exact action. Let server policy handle
   approval, identity, signing, simulation, and idempotency.
4. Treat the result as confirmed, rejected, or unknown. Never imply success
   before confirmation, and never replace an unknown action with a new one.
5. When available, refresh the portfolio and report the result plus remaining
   risk in a few lines.

Navigation and ticket drafting are not execution. Never accept keys, wallet
ids, signer material, or raw transactions.
