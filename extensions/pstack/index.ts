import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { type Model, getSupportedThinkingLevels } from '@earendil-works/pi-ai';
import { CONFIG_DIR_NAME, getAgentDir, type ExtensionAPI, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { MODE_ENTRY, MODE_SECTION, ROLES, modeFromBranch, modeGuidance, parseConfig, validateChoices } from './runtime.mjs';
import { configPaths, loadConfig, updateConfig } from './config.mjs';

export default function pstack(pi: ExtensionAPI) {
  const skillPath = fileURLToPath(new URL('../../skills/poteto-mode/SKILL.md', import.meta.url));
  const levels = (model: Model<any>) => model.reasoning ? getSupportedThinkingLevels(model) : ['off'];
  const state = (ctx: ExtensionContext) => modeFromBranch(ctx.sessionManager.getBranch());
  const configuration = (ctx: ExtensionContext) => loadConfig(configPaths(getAgentDir(), ctx.cwd, CONFIG_DIR_NAME), ctx.isProjectTrusted());
  const choices = (ctx: ExtensionContext, roles: object) => validateChoices(roles, ctx.modelRegistry.getAvailable(), ctx.model, levels);
  const show = (data: object, ctx: ExtensionContext) => {
    const content = JSON.stringify(data, null, 2);
    if (ctx.mode === 'print') console.error(content);
    else pi.sendMessage({ customType: 'pstack.command', content, display: true }, { triggerTurn: false });
  };
  const refreshStatus = (ctx: ExtensionContext) => {
    if (ctx.mode !== 'tui') return;
    try { ctx.ui.setStatus('pstack', state(ctx).enabled ? 'poteto-mode on' : undefined); }
    catch { ctx.ui.setStatus('pstack', 'poteto-mode state error'); }
  };
  pi.on('session_start', (_event, ctx) => refreshStatus(ctx));
  pi.on('session_tree', (_event, ctx) => refreshStatus(ctx));
  pi.on('before_agent_start', async (event, ctx) => {
    delete event.systemPromptOptions.sections[MODE_SECTION];
    if (event.messageType !== 'user') return;
    try {
      const mode = state(ctx);
      let roles = {};
      if (mode.enabled) {
        await access(skillPath);
        const config = await configuration(ctx);
        choices(ctx, config.roles);
        roles = config.roles;
      }
      const guidance = modeGuidance(mode, skillPath, roles);
      if (guidance) event.systemPromptOptions.sections[MODE_SECTION] = guidance;
    } catch (error) {
      event.systemPromptOptions.sections[MODE_SECTION] = `Pstack configuration/state error: ${String(error)}. Report this error and stop this task until the operator fixes configuration or disables poteto-mode. No alternative model or provider was selected.`;
    }
  });
  pi.registerCommand('poteto-mode', {
    description: 'Enable, disable, or inspect branch-local poteto-mode: on | off | status',
    handler: async (args, ctx) => {
      const action = args.trim() || 'status';
      if (!['on', 'off', 'status'].includes(action)) throw new Error('Usage: /poteto-mode on|off|status');
      if (action !== 'status') {
        if (!ctx.isIdle()) throw new Error('Wait for the current run to finish before changing poteto-mode');
        const enabled = action === 'on';
        if (enabled) {
          await access(skillPath);
          choices(ctx, (await configuration(ctx)).roles);
        }
        let current;
        try { current = state(ctx); } catch (error) { if (enabled) throw error; }
        if (!current?.explicit || current.enabled !== enabled) pi.appendEntry(MODE_ENTRY, { version: 1, enabled });
      }
      refreshStatus(ctx);
      let config;
      let configError;
      try { config = await configuration(ctx); choices(ctx, config.roles); } catch (error) { configError = String(error); }
      show({ mode: state(ctx), scope: 'active session branch', persistent: !!ctx.sessionManager.getSessionFile(), config, configError, capabilities: { singleAgent: true, subagents: 'not implemented by this package', autoContinue: false }, skillPath }, ctx);
    },
  });
  pi.registerCommand('setup-pstack', {
    description: 'Inspect or configure model roles: models | status | set <user|project> <role> <provider/id|inherit> [thinking] | unset <user|project> <role>',
    handler: async (args, ctx) => {
      const words = args.trim().split(/\s+/).filter(Boolean);
      const action = words[0] || 'status';
      const paths = configPaths(getAgentDir(), ctx.cwd, CONFIG_DIR_NAME);
      if (action === 'models' && words.length === 1) {
        show({ models: ctx.modelRegistry.getAvailable().map(model => ({ model: `${model.provider}/${model.id}`, thinking: levels(model) })), availability: 'Pi configured/authenticated catalog snapshot; no inference request was sent' }, ctx);
        return;
      }
      if (action === 'status' && words.length <= 1) {
        let config;
        let configError;
        try { config = await configuration(ctx); choices(ctx, config.roles); } catch (error) { configError = String(error); }
        show({ paths, config, configError, defaults: Object.fromEntries(ROLES.map(role => [role, 'inherit'])), appliesTo: 'role preferences only; current Pi model is unchanged; delegation is not implemented' }, ctx);
        return;
      }
      const [, scope, role, model, thinking] = words;
      if (!['set', 'unset'].includes(action) || !['user', 'project'].includes(scope) || !ROLES.includes(role) || (action === 'set' ? words.length < 4 || words.length > 5 : words.length !== 3)) {
        throw new Error('Usage: /setup-pstack models|status|set <user|project> <code|review|prose|verification> <provider/id|inherit> [thinking]|unset <user|project> <role>');
      }
      if (!ctx.isIdle()) throw new Error('Wait for the current run to finish before changing pstack configuration');
      if (scope === 'project' && !ctx.isProjectTrusted()) throw new Error(`Project configuration is untrusted; trust this project through Pi before writing or applying ${paths.project}`);
      const choice = { model, ...(thinking === undefined ? {} : { thinking }) };
      if (action === 'set') {
        parseConfig({ version: 1, roles: { [role]: choice } });
        choices(ctx, { [role]: choice });
      }
      const changed = await updateConfig(paths[scope], current => {
        const roles = { ...current.roles };
        if (action === 'set') roles[role] = choice;
        else delete roles[role];
        return { version: 1, roles };
      });
      show({ changed, path: paths[scope], scope, role, choice: action === 'set' ? choice : null, currentModelChanged: false }, ctx);
    },
  });
}
