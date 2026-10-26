// Unlike upstream, Pi only uses an operator-provided or already-installed TLC.
import { spawnSync } from 'node:child_process';
import { statSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';

const INSTALL_HINT = 'Install Java 11+ and tla2tools.jar yourself, then set TLA2TOOLS (or TLA2TOOLS_JAR) to the absolute jar path and JAVA to the Java binary. If using mise, install TLC and Java explicitly first. Pi never installs mise, TLC, or Java automatically.';
const run = (...args) => spawnSync('mise', args, {
  cwd: tmpdir(),
  env: { ...process.env, MISE_CEILING_PATHS: tmpdir() },
  encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024,
});
const existing = (file, name) => {
  if (!isAbsolute(file)) throw new Error(`${name} must be an absolute path. ${INSTALL_HINT}`);
  try {
    if (statSync(file).isFile()) return realpathSync(file);
  } catch { /* Report a missing/non-file path consistently. */ }
  throw new Error(`${name} is ${file}, which is not an existing file. ${INSTALL_HINT}`);
};

export function findTlc() {
  const declared = [process.env.TLA2TOOLS, process.env.TLA2TOOLS_JAR].filter(v => v?.trim()).map(v => v.trim());
  if (new Set(declared).size > 1) throw new Error(`Conflicting TLA2TOOLS and TLA2TOOLS_JAR paths. Use the same jar for statechart and verification_exec. ${INSTALL_HINT}`);
  const java = process.env.JAVA ? existing(process.env.JAVA, 'JAVA') : null;
  if (declared.length) return { jar: existing(declared[0], 'TLA2TOOLS'), java: java ?? 'java' };

  // `where` and `which` query installed tools; never invoke mise install/exec.
  // Explicit pins match the snapshot without silently selecting a new release.
  const { TLC_TOOL, JAVA_TOOL } = installedToolPins;
  const home = run('where', TLC_TOOL);
  if (home.error || home.status !== 0 || !home.stdout.trim()) {
    throw new Error(`Cannot find TLC${home.error?.code === 'ENOENT' ? ' (mise is not installed)' : ' in the installed mise tools'}. ${INSTALL_HINT}`);
  }
  const jar = existing(join(home.stdout.trim(), 'tla2tools.jar'), 'mise TLC jar');
  if (java) return { jar, java };
  const found = run('which', 'java', '--tool', JAVA_TOOL);
  if (found.error || found.status !== 0 || !found.stdout.trim()) throw new Error(`Cannot find an installed Java for TLC. ${INSTALL_HINT}`);
  return { jar, java: existing(found.stdout.trim(), 'mise Java') };
}

// Importing the upstream resolver defines constants only; it never calls findTlc.
import * as installedToolPins from '../../../skills/statechart/scripts/tlc-tools.mjs';
export { cannotRunTlc } from '../../../skills/statechart/scripts/tlc-tools.mjs';
