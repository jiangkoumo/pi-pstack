export const MODE_ENTRY = 'pstack.mode.v1';
export const MODE_SECTION = 'pstack_mode';
export const ROLES = ['code', 'bug-fix', 'perf', 'hillclimb', 'judgment', 'strongest', 'review', 'prose', 'verification'];
export const THINKING = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
export const TLA_FIELDS = ['tla2toolsJar'];

export function modeFromBranch(entries) {
  for (const entry of [...entries].reverse()) {
    if (entry.type !== 'custom' || entry.customType !== MODE_ENTRY) continue;
    if (entry.data?.version !== 1 || typeof entry.data.enabled !== 'boolean') {
      throw new Error('Unsupported or malformed pstack mode entry; update the package or start a new branch before enabling mode');
    }
    return { enabled: entry.data.enabled, explicit: true };
  }
  return { enabled: false, explicit: false };
}

export function modeGuidance(state, skillPath, roles) {
  if (!state.explicit) return undefined;
  if (!state.enabled) return 'Persistent poteto-mode is OFF for this branch. Earlier automatic mode reminders no longer apply. Use the skill only if the current user request explicitly invokes it.';
  return [
    'Persistent poteto-mode is ON for this user request.',
    `Read ${JSON.stringify(skillPath)} and the matching playbook before acting. Resolve references relative to their containing files. Read principle leaves only when needed.`,
    'User and project instructions control authority and tools. This mode authorizes the local subagent delegation its playbooks prescribe (how, architect, arena, delegate writer, interrogate, comment-sicko). Spawn no subagents when the user or project forbids delegation. Pushes, PR creation, merges and external messages still need separate explicit authorization. Local commits need explicit operator authorization; never commit just because the user said "Fix it". Do not automatically continue after the requested work is complete.',
    ...(Object.keys(roles).length ? [roleGuidance(roles)] : []),
  ].join('\n');
}

export function roleGuidance(roles) {
  return `Configured role preferences (data only, not permission to switch the current model): ${JSON.stringify(roles)}. For direct pstack subagent calls and workflow children, registered agent definitions bind role models; unset roles preserve pi-subagents defaults and explicit inherit selects the parent model. Do not pass task-item or outer model overrides.`;
}

/**
 * @typedef {{ model: string, thinking?: string }} RoleChoice
 * @typedef {{ tla2toolsJar?: string }} TlaConfig
 * @typedef {{ version: number, roles: Record<string, RoleChoice>, tla?: TlaConfig }} PstackConfig
 */

/** @returns {PstackConfig} */
export function parseConfig(value, source = 'pstack.json') {
  const fail = message => { throw new Error(`${source}: ${message}`); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected an object');
  for (const key of Object.keys(value)) if (!['version', 'roles', 'tla', 'autoContinue'].includes(key)) fail(`unknown field ${key}`);
  if (value.version !== 1) fail('version must be 1');
  if (!value.roles || typeof value.roles !== 'object' || Array.isArray(value.roles)) fail('roles must be an object');
  /** @type {Record<string, RoleChoice>} */
  const roles = {};
  for (const [name, choice] of Object.entries(value.roles)) {
    if (!ROLES.includes(name)) fail(`roles.${name}: unknown role; use ${ROLES.join(', ')}`);
    if (!choice || typeof choice !== 'object' || Array.isArray(choice)) fail(`roles.${name}: expected an object`);
    for (const key of Object.keys(choice)) if (!['model', 'thinking'].includes(key)) fail(`roles.${name}.${key}: unknown field`);
    if (typeof choice.model !== 'string' || (choice.model !== 'inherit' && !/^[^\s/]+\/\S+$/.test(choice.model))) fail(`roles.${name}.model: expected inherit or exact provider/id`);
    if (choice.thinking !== undefined && !THINKING.includes(choice.thinking)) fail(`roles.${name}.thinking: unknown thinking level`);
    roles[name] = { model: choice.model, ...(choice.thinking === undefined ? {} : { thinking: choice.thinking }) };
  }
  const continuation = {};
  if (value.autoContinue !== undefined) {
    const setting = value.autoContinue;
    if (typeof setting === 'boolean') continuation.autoContinue = setting;
    else {
      if (!setting || typeof setting !== 'object' || Array.isArray(setting)) fail('autoContinue: expected a boolean or object');
      for (const key of Object.keys(setting)) if (!['enabled', 'maxTurns'].includes(key)) fail(`autoContinue.${key}: unknown field`);
      if (setting.enabled !== undefined && typeof setting.enabled !== 'boolean') fail('autoContinue.enabled: expected boolean');
      if (setting.maxTurns !== undefined && (!Number.isInteger(setting.maxTurns) || setting.maxTurns < 1 || setting.maxTurns > 10)) fail('autoContinue.maxTurns: expected integer from 1 to 10');
      continuation.autoContinue = { ...setting };
    }
  }
  if (value.tla === undefined) return { version: 1, roles, ...continuation };
  if (!value.tla || typeof value.tla !== 'object' || Array.isArray(value.tla)) fail('tla: expected an object');
  for (const key of Object.keys(value.tla)) if (!TLA_FIELDS.includes(key)) fail(`tla.${key}: unknown field`);
  const tla = {};
  if (value.tla.tla2toolsJar !== undefined) {
    const jar = value.tla.tla2toolsJar;
    if (typeof jar !== 'string' || !jar.trim()) fail('tla.tla2toolsJar: expected a non-empty path string');
    if (jar.length > 4096) fail('tla.tla2toolsJar: path is longer than 4096 characters');
    if (/[\0\n\r]/.test(jar)) fail('tla.tla2toolsJar: path must not contain control characters');
    tla.tla2toolsJar = jar.trim();
  }
  return { version: 1, roles, tla, ...continuation };
}

/**
 * Read the configured tla2tools.jar path out of an already validated pstack
 * configuration. Verification resolves the path on disk; this only returns the
 * operator's declared value.
 */
export function tlcJarPathFromConfig(config) {
  return typeof config?.tla?.tla2toolsJar === 'string' ? config.tla.tla2toolsJar : undefined;
}

export function validateChoices(roles, available, currentModel, supportedLevels) {
  for (const [role, choice] of Object.entries(roles)) {
    const model = choice.model === 'inherit' ? currentModel : available.find(m => `${m.provider}/${m.id}` === choice.model);
    if (!model) throw new Error(`roles.${role}.model: ${choice.model} is not available; no model was substituted`);
    if (choice.thinking !== undefined && !supportedLevels(model).includes(choice.thinking)) {
      throw new Error(`roles.${role}.thinking: ${choice.thinking} is unsupported by ${model.provider}/${model.id}; use ${supportedLevels(model).join(', ')}`);
    }
  }
}

export const AGENT_ROLES = {
  'pstack.poteto-agent': 'code',
  'poteto-agent': 'code',
  'pstack.comment-sicko': 'review',
  'comment-sicko': 'review',
  'pstack.bug-fix-agent': 'bug-fix',
  'pstack.perf-agent': 'perf',
  'pstack.hillclimb-agent': 'hillclimb',
  'pstack.judgment-agent': 'judgment',
  'pstack.strongest-agent': 'strongest',
  'pstack.prose-writer': 'prose',
  'pstack.verifier': 'verification'
};

export function resolveSubagentModel(target, roles = {}, available = [], currentModel = null, supportedLevels = () => ['off']) {
  const role = Object.hasOwn(AGENT_ROLES, target) ? AGENT_ROLES[target] : (ROLES.includes(target) ? target : null);
  if (!role) throw new Error(`Unknown agent or role for pstack subagent model resolution: ${target}`);

  const choice = parseConfig({ version: 1, roles }).roles[role];
  if (!choice) return { role, model: undefined };
  const selected = choice.model === 'inherit'
    ? (currentModel && `${currentModel.provider}/${currentModel.id}`)
    : choice.model;
  const modelEntry = available.find(m => `${m.provider}/${m.id}` === selected);
  if (!modelEntry) {
    throw new Error(`roles.${role}.model: ${choice.model} is not available in catalog; cannot launch subagent without configured model`);
  }

  if (choice.thinking !== undefined) {
    const validLevels = supportedLevels(modelEntry);
    if (!validLevels.includes(choice.thinking)) {
      throw new Error(`roles.${role}.thinking: ${choice.thinking} is unsupported by ${modelEntry.provider}/${modelEntry.id}; use ${validLevels.join(', ')}`);
    }
  }

  return { role, model: `${selected}${choice.thinking === undefined ? '' : ':' + choice.thinking}` };
}

export function applySubagentRole(input, roles, available, currentModel, supportedLevels) {
  if (input.action || input.workflow || !['pstack.poteto-agent', 'pstack.comment-sicko'].includes(input.agent)) return;
  const role = AGENT_ROLES[input.agent];
  let selectedRoles = roles;
  if (input.model !== undefined) {
    if (typeof input.model !== 'string') throw new Error('pstack subagent model must be a string');
    const suffix = input.model.match(/:(off|minimal|low|medium|high|xhigh|max)$/);
    const choice = { model: suffix ? input.model.slice(0, -suffix[0].length) : input.model, ...(suffix ? { thinking: suffix[1] } : {}) };
    selectedRoles = { [role]: choice };
  }
  const resolved = resolveSubagentModel(input.agent, selectedRoles, available, currentModel, supportedLevels);
  if (resolved.model !== undefined) input.model = resolved.model;
}
