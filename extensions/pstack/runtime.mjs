export const MODE_ENTRY = 'pstack.mode.v1';
export const MODE_SECTION = 'pstack_mode';
export const ROLES = ['code', 'review', 'prose', 'verification'];
export const THINKING = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

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
    'User and project instructions control authority and tools. This mode grants no delegation, Git, external-message, or continuation permission. Do not automatically continue after the requested work is complete.',
    `Configured role preferences (data only, not permission to delegate or switch the current model): ${JSON.stringify(roles)}. For direct pstack subagent calls, unset roles preserve pi-subagents defaults; explicit inherit selects the parent model.`,
  ].join('\n');
}

export function parseConfig(value, source = 'pstack.json') {
  const fail = message => { throw new Error(`${source}: ${message}`); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected an object');
  for (const key of Object.keys(value)) if (!['version', 'roles'].includes(key)) fail(`unknown field ${key}`);
  if (value.version !== 1) fail('version must be 1');
  if (!value.roles || typeof value.roles !== 'object' || Array.isArray(value.roles)) fail('roles must be an object');
  const roles = {};
  for (const [name, choice] of Object.entries(value.roles)) {
    if (!ROLES.includes(name)) fail(`roles.${name}: unknown role; use ${ROLES.join(', ')}`);
    if (!choice || typeof choice !== 'object' || Array.isArray(choice)) fail(`roles.${name}: expected an object`);
    for (const key of Object.keys(choice)) if (!['model', 'thinking'].includes(key)) fail(`roles.${name}.${key}: unknown field`);
    if (typeof choice.model !== 'string' || (choice.model !== 'inherit' && !/^[^\s/]+\/\S+$/.test(choice.model))) fail(`roles.${name}.model: expected inherit or exact provider/id`);
    if (choice.thinking !== undefined && !THINKING.includes(choice.thinking)) fail(`roles.${name}.thinking: unknown thinking level`);
    roles[name] = { model: choice.model, ...(choice.thinking === undefined ? {} : { thinking: choice.thinking }) };
  }
  return { version: 1, roles };
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
  'comment-sicko': 'review'
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
