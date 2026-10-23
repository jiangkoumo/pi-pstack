/** Shared parsing for formal verification execution and completion checks. */
export function extractRunItCommands(skillText) {
  const lines = String(skillText ?? '').split(/\r?\n/);
  const commands = [];
  let inSection = false;
  let sectionLevel = 0;
  let fence = null;
  let shell = false;
  let pending = '';
  for (const line of lines) {
    if (!fence) {
      const heading = line.match(/^(#{2,6})\s+(.+)$/);
      if (heading) {
        if (inSection && heading[1].length <= sectionLevel) break;
        if (/^Run\s+it\b/i.test(heading[2])) {
          inSection = true;
          sectionLevel = heading[1].length;
        }
        continue;
      }
    }
    if (!inSection) continue;
    const marker = line.match(/^\s*(`{3,}|~{3,})\s*([^\s]*)\s*$/);
    if (marker) {
      if (!fence) {
        fence = marker[1];
        shell = /^(sh|bash)$/i.test(marker[2]);
      } else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2]) {
        fence = null;
        shell = false;
        pending = '';
      }
      continue;
    }
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    // Only an explicit invocation line is a tool call; prose mentions are ignored.
    if (shell || /^verification_exec\s+(?:\{|--)/.test(text)) {
      pending += text.replace(/\\$/, '').trimEnd();
      if (text.endsWith('\\')) { pending += ' '; continue; }
      commands.push(pending);
      pending = '';
    }
  }
  return [...new Set(commands)];
}

/** Latest gate state for the current user request, reconstructed on each branch. */
export const FORMAL_VERIFICATION_ENTRY = 'pstack.formal_verification_gate.v1';
export function formalGateState(entries = []) {
  let state = null;
  for (const entry of entries) {
    if (entry?.role === 'user' || entry?.message?.role === 'user' || entry?.type === 'user_message') state = null;
    if (entry?.type === 'custom' && entry.customType === FORMAL_VERIFICATION_ENTRY) state = entry.data;
  }
  return state;
}
