// Use only the operator's configured tools, without invoking mise or downloading anything.
import { statSync, realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';

const INSTALL_HINT = 'Install Java and tla2tools.jar yourself, then set TLA2TOOLS (or TLA2TOOLS_JAR) to the absolute jar path and JAVA to the Java binary. Pi never installs mise, TLC, or Java automatically.';
const existing = (file, name) => {
  if (!isAbsolute(file)) throw new Error(`${name} must be an absolute path. ${INSTALL_HINT}`);
  try {
    if (statSync(file).isFile()) return realpathSync(file);
  } catch { /* Report missing */ }
  throw new Error(`${name} is ${file}, which is not an existing file. ${INSTALL_HINT}`);
};

export function findTlc() {
  const declared = [process.env.TLA2TOOLS, process.env.TLA2TOOLS_JAR].filter(v => v?.trim()).map(v => v.trim());
  if (new Set(declared).size > 1) throw new Error(`Conflicting TLA2TOOLS and TLA2TOOLS_JAR paths. Use the same jar for statechart and verification_exec. ${INSTALL_HINT}`);
  if (!declared.length) throw new Error(`Cannot find a configured TLC jar. ${INSTALL_HINT}`);
  return { jar: existing(declared[0], 'TLA2TOOLS'), java: process.env.JAVA ? existing(process.env.JAVA, 'JAVA') : 'java' };
}
