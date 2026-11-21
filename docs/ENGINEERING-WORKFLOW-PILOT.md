# Internal engineering workflow pilot

This is a task procedure for SuperMega engineers and agents, not a customer Agent
Company feature. `AGENTS.md`, the active user instruction, the current tool
contract, and the named release owner govern if an upstream skill differs.

## Sources and selected practices

- [Superpowers 7.0.2](https://github.com/obra/superpowers/tree/22f0b463e7a5e579904dd6211a520321035526f7/skills): planning, systematic debugging, meaningful behavior tests, independent code review, and verification before completion.
- [Cursor pstack 0.15.42](https://github.com/cursor/plugins/tree/bf0c7cd80abdbf7fe47b634978a7d1b4071f71a7/pstack/skills): blast-radius analysis, a concise decision trail, and a checklist before claiming a measured performance gain.
- [Matt Pocock skills at 5863806](https://github.com/mattpocock/skills/tree/5863806dd4e15c63174bee4e7515a4256792ecfa): dependency-frontier task selection, short source-linked handoffs, and separate [standards and specification review](https://github.com/mattpocock/skills/blob/5863806dd4e15c63174bee4e7515a4256792ecfa/skills/engineering/code-review/SKILL.md). Its software-factory guidance keeps triggers and retries bounded; it does not grant automatic PR or release authority here.

Read only the selected pinned skill source needed for a task. Apply the practices
through the existing `SKILLS.md` capability map. Do not invoke automatic
bootstrap, `poteto-mode`, global model setup, model fan-out, autonomous shipping,
branch-finishing, or recursive delegation. Do not install any upstream package
or plugin into the product, Agent Company runtime, or a global agent profile for
this pilot.

## One-task sequence

1. **Bind.** Name the operator outcome, sole integration writer, exact source
   ref and file identities, allowed write/effect set, accepted evidence level,
   and stop conditions. Read the relevant current implementation and prior
   receipts before proposing a change. Prove that the claimed behavior reaches
   the target runtime through a mounted route or caller. Label dev-only,
   dormant, or unmounted code as groundwork, without an operator-impact claim.
2. **Trace.** Map route/mount and build or feature gates, changed callers,
   readers, persisted formats, generated output, and held operations. Record
   one concrete safety claim and the source or
   behavior that could disprove it. Parallel agents may investigate or review;
   they do not create a competing integration writer.
3. **Prove and change.** Choose the smallest meaningful regression. Observe a
   preimage failure when it is safe and the real code can be exercised. Review
   test imports, commands, and effects before execution. Make one coherent
   source change in an isolated successor; retain every failed artifact.
4. **Verify.** Run the source-matched focused checks and every mandatory
   broader affected gate when its effects are safe and admitted. Record a
   blocked gate as NOT RUN and stop promotion; do not replace it with a narrow
   pass. An independent reviewer inspects the complete diff, negative cases,
   output and preservation. A local synthetic pass cannot stand in for a
   mounted app, installed device, provider, merchant, or release result. A
   passing source test or build for an unreachable path is code evidence, not
   target-runtime operator acceptance.
5. **Close.** Record Keep, Merge, Pause, Archive, or Client-specific; exact
   patch and result identities; first failure and later NOT RUN stages;
   unresolved gates; and the next owner. Never repeat an uncertain external
   action to seek a passing result.

## Task packet

```text
Outcome and operator:
Target runtime and mounted route/caller, or dev-only/dormant/unmounted status:
Source ref, manifest, parent, excluded candidates:
Sole writer and independent reviewers:
Changed paths and allowed effects:
Safety claim, blast radius, and counterexample:
Regression and exact command effects:
Observed result by evidence level:
Decision trail (only consequential choices):
Closeout, unresolved gates, next owner:
```

Keep each pilot task's PR head, source manifest, target route, dependencies,
and review decision in its evidence packet, not in this procedure. No merge
or push follows from a successful local test.

## Same-thread continuation and delegation

An active Codex goal coordinates bounded tasks; it is not an always-on service or
permission to run an external operation. Start, replace, or reactivate a stopped
goal only on user direction; an active goal may continue under the host's
lifecycle without new approval. Each continuation checks the objective, the
live PR and source head, the current writer, running jobs, and the last
attributable outcome. Reconcile an interrupted or uncertain operation before
repeating it.

1. Choose one highest-value eligible task at the current dependency frontier.
   State its operator outcome, observable done predicate, exact source and
   allowed effects. If a release gate is held, select a genuinely independent
   task; do not manufacture a test or status update to keep agents busy.
2. Give parallel agents independent research or review by default. Each leaf
   brief names the source/ref, question, allowed reads and writes, expected
   artifact, stop condition, and handoff owner. Briefed agents are leaves: they
   return newly discovered work to the integrator without spawning or enlarging
   their task. Disjoint implementation needs an explicitly named integrator
   and non-overlapping paths before it starts.
3. Keep one integration writer and one candidate tree. The integrator checks
   returned bytes, source binding, and complete diff before accepting a child
   result. Independent review checks both repository rules and the requested
   behavior, including adverse cases. A review of a summary is not a review of
   unavailable source or test output.
4. Observe asynchronous jobs at a bounded cadence and record the exact run and
   first failing step. Do not issue a duplicate run, checkout, payment, upload,
   or provider action because a watcher or tool went quiet. Mark later stages
   NOT RUN until their own evidence exists.
5. Close each task with its exact artifact, evidence level, decision, next owner,
   and released write scope. Follow the host's goal lifecycle when a human or
   external gate blocks progress. The goal never auto-merges, deploys, accepts
   legal terms, contacts a customer, or promotes a product claim.

This adapts ideas from the pinned MIT-licensed sources without installing their
plugins, copying their automation, or activating an Agent Company runtime.

For this task and the next two eligible bounded engineering tasks, record
elapsed working time, first-pass review findings, reruns caused by fixture
errors, escaped defects, and actual tool cost where available. Compare each
with similar retained work. Keep this pilot only if at least one measure
improves without a weaker check, a new escaped defect, or a boundary violation;
otherwise remove the pilot link and retain the original evidence.
