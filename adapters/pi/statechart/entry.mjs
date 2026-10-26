#!/usr/bin/env node
// Pi execution boundary for the byte-preserved statechart snapshot.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const upstream = new URL('../../../skills/statechart/scripts/statechart.mjs', import.meta.url).href;
const tools = new URL('./tlc-tools.mjs', import.meta.url).href;

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, 'Statechart adapter no longer matches the pinned upstream; review the adapter before updating the snapshot');
  return source.replace(before, after);
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === upstream && specifier === './tlc-tools.mjs') {
      return { url: tools, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (url !== upstream) return loaded;
    let source = typeof loaded.source === 'string' ? loaded.source : Buffer.from(loaded.source).toString('utf8');
    source = replaceOnce(source,
      '  } catch (e) {\n    throw new CannotFinish(e.message);\n  }\n}\n\nconst rel',
      '  } catch (e) {\n    if (command === "render") throw new CannotFinish(`${e.message}\\nThe input .mmd file is still available.`);\n    console.error(`PNG unavailable: ${e.message}\\nContinuing with .mmd output.`);\n    return null;\n  }\n}\n\nconst rel');
    source = replaceOnce(source,
      '  if (renderer && pngs.length < charts.length) return 2;',
      '  if (renderer && pngs.length < charts.length) console.error("PNG unavailable for some charts; the .mmd files still contain the full charts.");');
    return { ...loaded, source };
  },
});

await import(upstream);
