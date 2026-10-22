# Claude Code repository entrypoint

This compatibility file intentionally contains no separate roadmap. Claude
Code must follow the same repository contract as every other implementation
agent:

1. Read [`supergoal.md`](supergoal.md) for the active Shop-only objective.
2. Read [`CURRENT.md`](CURRENT.md) for the dated candidate and open gates.
3. Follow [`AGENTS.md`](AGENTS.md) and the nearest nested `AGENTS.md`.
4. Use [`SKILLS.md`](SKILLS.md) only as a capability router, not as permission.

Older versions of this file described a broad four-product queue, autonomous
merging, machine-specific constraints, and past release state. Those versions
remain in Git history and are not current direction.

Hard boundaries remain: implementation agents never mutate production
Supabase, dispatch the production release workflow, or automate billing and
entitlement transitions. The founder performs those actions personally through
the gated procedures. Other live database/IAM changes, secret movement,
spending, customer contact, pricing commitments, destructive customer-data
actions, and acceptance claims require the named human decision and actor.

Never commit credentials, DSN-shaped values, private customer data, actual
commercial prices, or owner payment details to this public repository. Clearly
synthetic product prices may remain in tests and examples.

For changes under `mobile/shop_pos/`, the nested working contract is mandatory.
Keep money, inventory, wallet, backup, and restore behavior retry-safe; keep
evidence levels distinct; and bind release claims to the exact candidate.

Do not suppress build output, treat stale artifacts as proof, or point review
at a different checkout than the commit being evaluated.
