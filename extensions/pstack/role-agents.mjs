import { readFile } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import { parseFrontmatter } from '@earendil-works/pi-coding-agent';
import { parseConfig, validateChoices } from './runtime.mjs';

export const ROLE_AGENTS = Object.freeze({
  code: 'pstack.poteto-agent',
  'bug-fix': 'pstack.bug-fix-agent',
  perf: 'pstack.perf-agent',
  hillclimb: 'pstack.hillclimb-agent',
  judgment: 'pstack.judgment-agent',
  strongest: 'pstack.strongest-agent',
  review: 'pstack.comment-sicko',
  prose: 'pstack.prose-writer',
  verification: 'pstack.verifier',
});
const REGISTER_EVENT = 'pi-subagents:runtime-agent-register:v1';
const PRECEDENCE = 'User subagents.agentOverrides.<name> model/thinking override pstack.json definitions; project overrides also win when the project is trusted. Unset roles follow pi-subagents defaults. Per-child explicit model overrides are outside this definition binding.';
const lists = new Set(['aliases', 'tools', 'excludeTools', 'mcpDirectTools', 'skills', 'skillPath', 'extensions', 'subagentOnlyExtensions', 'mutationTools', 'defaultReads']);
const booleans = new Set(['allowNestedSubagents', 'inheritProjectContext', 'inheritGlobalContext', 'inheritSkills', 'defaultProgress', 'interactive']);
const numbers = new Set(['maxSubagentDepth', 'timeoutMs', 'toolTimeoutMs']);
const strings = new Set(['description', 'systemPromptMode', 'defaultContext', 'acceptanceRole', 'machine', 'output', 'outputMode']);
const structured = new Set(['acceptance', 'toolBudget', 'permissions', 'runner']);
const metadata = new Set(['name', 'package', 'license']);

/** Parse the supported Pi agent frontmatter without silently dropping restrictions. */
export function parseRoleAgent(content, name, agentsDir) {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) throw new Error(`${name}: frontmatter is required`);
  const { frontmatter, body } = parseFrontmatter(content);
  if (frontmatter.name !== name.slice('pstack.'.length) || frontmatter.package !== 'pstack') throw new Error(`${name}: expected matching name and package: pstack`);
  const definition = { systemPrompt: body };
  for (const [key, value] of Object.entries(frontmatter)) {
    if (metadata.has(key)) continue;
    if (key === 'model' || key === 'thinking') throw new Error(`${name}: configure ${key} through /setup-pstack, not agent frontmatter`);
    if (lists.has(key)) {
      const items = value == null || value === '' ? [] : Array.isArray(value) ? value : typeof value === 'string' ? value.split(',').map(v => v.trim()) : null;
      if (!items || items.some(v => typeof v !== 'string' || !v.trim())) throw new Error(`${name}.${key}: expected string list`);
      definition[key] = items.map(item => ['extensions', 'subagentOnlyExtensions', 'skillPath'].includes(key) && item.startsWith('.') && !isAbsolute(item) ? resolve(agentsDir, item) : item);
    } else if (booleans.has(key) || key === 'async') {
      if (typeof value !== 'boolean') throw new Error(`${name}.${key}: expected boolean`);
      definition[key === 'async' ? 'defaultAsync' : key] = value;
    } else if (numbers.has(key)) {
      if (!Number.isSafeInteger(value) || value < (key === 'maxSubagentDepth' ? 0 : 1)) throw new Error(`${name}.${key}: expected integer`);
      definition[key === 'timeoutMs' ? 'defaultTimeoutMs' : key === 'toolTimeoutMs' ? 'defaultToolTimeoutMs' : key] = value;
    } else if (strings.has(key)) {
      if (typeof value !== 'string' || !value.trim()) throw new Error(`${name}.${key}: expected nonempty string`);
      definition[key] = value;
    } else if (structured.has(key)) {
      definition[key === 'acceptance' ? 'defaultAcceptance' : key] = value;
    } else {
      throw new Error(`${name}: unsupported frontmatter field ${key}; refusing to drop launch constraints`);
    }
  }
  if (!definition.description || !body.trim()) throw new Error(`${name}: description and body are required`);
  return definition;
}

/**
 * Public-event adapter. Create once per extension runtime. Await refresh from
 * session_start/set/unset/session replacement; dispose on session_shutdown.
 * Refreshes are serialized; a failed replacement leaves no stale registrations.
 */
export function createRoleAgentController(pi, agentsDir) {
  let registrations = [];
  let snapshot = { state: 'unregistered', agents: [], precedence: PRECEDENCE };
  let revision = 0;
  let pending = Promise.resolve();
  const clear = () => {
    const old = registrations;
    registrations = [];
    const errors = [];
    for (const registration of old.reverse()) {
      try { registration.dispose(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Failed to dispose pstack role agents');
  };
  const status = () => structuredClone(snapshot);
  return {
    status,
    dispose() {
      revision++;
      clear();
      snapshot = { state: 'unregistered', agents: [], precedence: PRECEDENCE };
    },
    refresh(roles, catalog, currentModel, supportedLevels) {
      const mine = ++revision;
      const refresh = async () => {
        if (mine !== revision) return status();
        try {
          clear();
          snapshot = { state: 'unregistered', agents: [], precedence: PRECEDENCE };
          const config = parseConfig({ version: 1, roles });
          validateChoices(config.roles, catalog, currentModel, supportedLevels);
          // inherit must still resolve to an exact available parent at admission.
          for (const [role, choice] of Object.entries(config.roles)) {
            const selected = choice.model === 'inherit' ? currentModel && `${currentModel.provider}/${currentModel.id}` : choice.model;
            if (!catalog.some(model => `${model.provider}/${model.id}` === selected)) throw new Error(`roles.${role}.model: ${choice.model} is not available in catalog`);
          }
          const definitions = await Promise.all(Object.entries(ROLE_AGENTS).map(async ([role, name]) => {
            const path = resolve(agentsDir, name.slice('pstack.'.length) + '.md');
            const definition = parseRoleAgent(await readFile(path, 'utf8'), name, agentsDir);
            const choice = config.roles[role];
            if (choice) Object.assign(definition, { model: choice.model, ...(choice.thinking === undefined ? {} : { thinking: choice.thinking }) });
            return { role, name, definition };
          }));
          if (mine !== revision) return status();
          for (const { name, definition } of definitions) {
            const request = { version: 1, name, definition };
            pi.events.emit(REGISTER_EVENT, request);
            if (!request.result) {
              const error = new Error('pi-subagents unavailable: not installed, not ready, or no compatible runtime-agent-register v1 owner');
              error.code = 'PSTACK_SUBAGENTS_UNAVAILABLE';
              throw error;
            }
            if (!request.result.ok) throw request.result.error;
            registrations.push(request.result.registration);
          }
          snapshot = { state: 'registered', agents: definitions.map(({ role, name, definition }) => ({ role, name, ...(definition.model === undefined ? {} : { model: definition.model }), ...(definition.thinking === undefined ? {} : { thinking: definition.thinking }) })), precedence: PRECEDENCE };
          return status();
        } catch (error) {
          try { clear(); } catch (cleanupError) { error = new AggregateError([error, cleanupError], 'Role registration and cleanup failed'); }
          snapshot = { state: error.code === 'PSTACK_SUBAGENTS_UNAVAILABLE' ? 'unavailable' : 'error', agents: [], error: String(error), precedence: PRECEDENCE };
          throw error;
        }
      };
      const result = pending.then(refresh);
      pending = result.catch(() => {});
      return result;
    },
  };
}

/**
 * Block a shared model override for pstack children without rewriting inputs.
 * scriptText must be supplied by the host for reply/file workflows. Detection
 * covers literal agent properties only; computed names, aliases constructed at
 * runtime, and indirect calls are outside this static guard's visibility.
 * Absence of a block is not proof that a dynamic script has no pstack children.
 */
export function guardPstackTopLevelModel(input, { scriptText } = {}) {
  if (input.action || input.model === undefined) return;
  const isPstack = agent => typeof agent === 'string' && (agent.startsWith('pstack.') || Object.values(ROLE_AGENTS).includes(agent) || Object.values(ROLE_AGENTS).some(name => name.slice(7) === agent));
  const hasChild = tasks => Array.isArray(tasks) && tasks.some(task => task && (isPstack(task.agent) || hasChild(task.parallel)));
  const known = isPstack(input.agent) || hasChild(input.tasks) || hasChild(input.chain) || (input.workflow === 'parallel' && hasChild(input.args?.tasks));
  const raw = input.workflow === true || input.workflow === 'true' || (typeof input.workflow === 'string' && /[/\\]/.test(input.workflow));
  const literal = raw && typeof scriptText === 'string' && [...scriptText.matchAll(/(?:\bagent|['"]agent['"])\s*:\s*(['"])([^'"\r\n]+)\1/g)].some(match => isPstack(match[2]));
  if (!known && !literal) return;
  return { block: true, reason: 'Remove top-level model and configure pstack roles with /setup-pstack; a shared model overrides agent role definitions.' };
}
