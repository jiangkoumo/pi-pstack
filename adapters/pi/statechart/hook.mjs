// A narrow, fail-closed substitution for cursor/plugins@519d36aa's internal resolver.
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sourceRoot = process.env.PSTACK_STATECHART_SOURCE_ROOT;
if (sourceRoot && !isAbsolute(sourceRoot)) throw new Error('PSTACK_STATECHART_SOURCE_ROOT must be absolute');
export const scriptsRoot = sourceRoot
  ? pathToFileURL(realpathSync(resolve(sourceRoot, 'scripts')) + '/')
  : new URL('../../../skills/statechart/scripts/', import.meta.url);
const runURL = new URL('run.ts', scriptsRoot).href;
const toolsURL = new URL('./tlc-tools.mjs', import.meta.url).href;

const resolver = [
  'async function findTlc(cwd: string) {',
  '  const { TLA2TOOLS, JAVA } = process.env;',
  '  if (TLA2TOOLS) return { jar: TLA2TOOLS, java: JAVA || "java" };',
  '  const mise = (...args: string[]) =>',
  '    runChild("mise", args, { cwd, env: { ...process.env, MISE_CEILING_PATHS: cwd } });',
  '  const where = () =>',
  '    Promise.all([mise("where", TLC_TOOL), mise("which", "java", "--tool", JAVA_TOOL)]);',
  '  let found = await where();',
  '  if (found.some((r) => r.status !== 0)) {',
  '    const r = await mise("install", JAVA_TOOL, TLC_TOOL);',
  '    if (r.status !== 0)',
  '      throw new Error(',
  '        `Cannot find TLC: mise install failed: ${r.error?.message ?? r.stderr.trim()}\\nOr set TLA2TOOLS to the path of tla2tools.jar, and JAVA to a java binary (Java 11 or later).`,',
  '      );',
  '    found = await where();',
  '  }',
  '  return {',
  '    jar: path.join(found[0].stdout.trim(), "tla2tools.jar"),',
  '    java: JAVA || found[1].stdout.trim(),',
  '  };',
  '}',
].join('\n');

registerHooks({
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (url !== runURL) return loaded;
    const source = typeof loaded.source === 'string' ? loaded.source : Buffer.from(loaded.source).toString('utf8');
    assert.equal(source.split(resolver).length, 2,
      'Statechart adapter no longer matches the pinned run.ts; refusing to execute. Review the adapter before updating the snapshot.');
    return { ...loaded, source: source.replace(resolver,
      `async function findTlc(cwd: string) { return (await import(${JSON.stringify(toolsURL)})).findTlc(); }`) };
  },
});
