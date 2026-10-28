#!/usr/bin/env node
// Pi boundary for the byte-preserved TS compiler. The upstream parent owns cancellation.
import { scriptsRoot } from './hook.mjs';

const usage = `Usage: node <package>/adapters/pi/statechart/entry.mjs SPEC.tla [--config FILE] [--view FILE] [--out DIR]
Writes report.md, tlc.out, and chart.mmd when there is a chart. Above 500 states only
counterexamples are drawn; a model with no broken rule may have no chart.
Exit: 0 all rules hold, 1 rule broken, 2 tool error, 130 SIGINT, 143 SIGTERM.
Read report.md: "not checked" is never a formal pass.
Set TLA2TOOLS (or TLA2TOOLS_JAR) and JAVA to already-installed tools.
Pi never installs mise, TLC, or Java automatically.
Render Mermaid separately as SVG with Pele 1.9.0; --png is unavailable.`;

const args = process.argv.slice(2);
if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
  console.log(usage);
} else if (['from-spec', 'from-chart', 'render'].includes(args[0]) ||
    args.some(arg => ['--cover', '--fixed', '--against', '--png'].includes(arg.split('=')[0]))) {
  console.error(`Statechart CLI changed: from-spec/from-chart and --cover/--fixed/--against/--png were removed.
Use SPEC.tla --config FILE --view FILE --out DIR. Replace the old map with a view module.
summary.json is replaced by report.md and tlc.out. Render chart.mmd separately as SVG.
\n${usage}`);
  process.exitCode = 2;
} else {
  // registerHooks is process-local. --import repeats registration in the detached worker.
  process.execArgv.push('--import', new URL('./hook.mjs', import.meta.url).href);
  await import(new URL('statechart.ts', scriptsRoot).href);
}
