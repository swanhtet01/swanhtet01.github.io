# Internal engineering workflow pilot

This is a task procedure for SuperMega engineers and agents, not a customer Agent
Company feature. `AGENTS.md`, the active user instruction, the current tool
contract, and the named release owner govern if an upstream skill differs.

## Sources and selected practices

- [Superpowers 7.0.2](https://github.com/obra/superpowers/tree/22f0b463e7a5e579904dd6211a520321035526f7/skills): planning, systematic debugging, meaningful behavior tests, independent code review, and verification before completion.
- [Cursor pstack 0.15.42](https://github.com/cursor/plugins/tree/bf0c7cd80abdbf7fe47b634978a7d1b4071f71a7/pstack/skills): blast-radius analysis, a concise decision trail, and a checklist before claiming a measured performance gain.

Read only the selected pinned skill source needed for a task. Apply the practices
through the existing `SKILLS.md` capability map. Do not invoke automatic
bootstrap, `poteto-mode`, global model setup, model fan-out, autonomous shipping,
branch-finishing, or recursive delegation. Do not install either plugin into
the product, Agent Company runtime, or a global agent profile for this pilot.

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

For this task and the next two eligible bounded engineering tasks, record
elapsed working time, first-pass review findings, reruns caused by fixture
errors, escaped defects, and actual tool cost where available. Compare each
with similar retained work. Keep this pilot only if at least one measure
improves without a weaker check, a new escaped defect, or a boundary violation;
otherwise remove the pilot link and retain the original evidence.
