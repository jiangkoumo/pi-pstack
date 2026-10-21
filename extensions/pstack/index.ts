import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { type Model, getSupportedThinkingLevels } from '@earendil-works/pi-ai';
import { CONFIG_DIR_NAME, getAgentDir, type ExtensionAPI, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { MODE_ENTRY, MODE_SECTION, ROLES, AGENT_ROLES, modeFromBranch, modeGuidance, roleGuidance, parseConfig, validateChoices } from './runtime.mjs';
import { configPaths, loadConfig, updateConfig } from './config.mjs';
import { LOOP_ENTRY, LOOP_TURN_TYPE, parseLoopArgs, loopFromBranch, createInitialLoopState, decideNextStep, renderLoopPrompt, registerLoopAbortHooks } from './loop.mjs';
import { ROLE_AGENTS, createRoleAgentController, guardPstackTopLevelModel } from './role-agents.mjs';
import { loadModeState, saveModeState } from './mode-state.mjs';

export default function pstack(pi: ExtensionAPI) {
  const skillPath = fileURLToPath(new URL('../../skills/poteto-mode/SKILL.md', import.meta.url));
  const agentsDir = fileURLToPath(new URL('../../agents', import.meta.url));
  const roleController = createRoleAgentController(pi, agentsDir);
  registerLoopAbortHooks(pi);
  const levels = (model: Model<any>) => model.reasoning ? getSupportedThinkingLevels(model) : ['off'];
  const modeFilePath = (ctx: ExtensionContext) => {
    const sessionFile = ctx.sessionManager.getSessionFile();
    if (sessionFile) return sessionFile + '.pstack-mode.json';
    return resolve(getAgentDir(), 'pstack-mode-default.json');
  };
  const state = (ctx: ExtensionContext) => {
    const branch = modeFromBranch(ctx.sessionManager.getBranch());
    try {
      const persisted = loadModeState(modeFilePath(ctx));
      if (persisted.enabled) return { enabled: true, explicit: true };
      if (branch.explicit) return branch;
      return { enabled: false, explicit: branch.explicit };
    } catch (e) {
      throw e;
    }
  };
  const configuration = (ctx: ExtensionContext) => loadConfig(configPaths(getAgentDir(), ctx.cwd, CONFIG_DIR_NAME), ctx.isProjectTrusted());
  const choices = (ctx: ExtensionContext, roles: object) => validateChoices(roles, ctx.modelRegistry.getAvailable(), ctx.model, levels);
  const refreshRoles = async (ctx: ExtensionContext) => {
    try {
      const config = await configuration(ctx);
      await roleController.refresh(config.roles, ctx.modelRegistry.getAvailable(), ctx.model, levels);
    } catch {
      // Role controller tracks its own state snapshot
    }
  };
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
  const reconcileLoop = (ctx: ExtensionContext) => {
    try {
      const branch = ctx.sessionManager.getBranch();
      const loop = loopFromBranch(branch);
      if (loop.active && loop.state) {
        pi.appendEntry(LOOP_ENTRY, {
          ...loop.state,
          status: 'interrupted',
          reason: 'session-restarted-or-branched',
          updatedAt: new Date().toISOString(),
        });
      }
    } catch {
      // Ignore malformed entries during passive discovery
    }
  };
  pi.on('tool_call', async (event, ctx) => {
    if (event.toolName !== 'subagent') return;
    const input = event.input;
    if (!input || typeof input !== 'object') return;
    let scriptText: string | undefined;
    if (typeof input.workflow === 'string' && /[/\\]/.test(input.workflow)) {
      try { scriptText = await readFile(resolve(ctx.cwd, input.workflow), 'utf8'); }
      catch {}
    }
    const guard = guardPstackTopLevelModel(input, { scriptText });
    if (guard?.block) return guard;
  });
  pi.on('session_start', async (_event, ctx) => { refreshStatus(ctx); reconcileLoop(ctx); await refreshRoles(ctx); });
  pi.on('session_tree', async (_event, ctx) => { refreshStatus(ctx); reconcileLoop(ctx); await refreshRoles(ctx); });
  pi.on('session_shutdown', () => { roleController.dispose(); });
  pi.on('before_agent_start', async (event, ctx) => {
    delete event.systemPromptOptions.sections[MODE_SECTION];
    delete event.systemPromptOptions.sections.pstack_context;
    const customType = event.messageType === 'custom' ? ((event as any).message?.customType ?? (event as any).customType) : undefined;
    const isUserOrLoop = event.messageType === 'user' || customType === LOOP_TURN_TYPE;
    if (!isUserOrLoop) return;
    try {
      const mode = state(ctx);
      if (mode.enabled) await access(skillPath);
      const config = await configuration(ctx);
      choices(ctx, config.roles);
      event.systemPromptOptions.sections.pstack_context = [
        `Pstack run directory: ${JSON.stringify(resolve(getAgentDir(), 'pstack-runs'))}. Use a unique <run-id> subdirectory for local pstack artifacts unless the operator approves another path.`,
        roleGuidance(config.roles),
      ].join('\n');
      const guidance = modeGuidance(mode, skillPath, {});
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
        saveModeState(modeFilePath(ctx), { version: 1, enabled });
        let current;
        try { current = modeFromBranch(ctx.sessionManager.getBranch()); } catch (error) { if (enabled) throw error; }
        if (!current?.explicit || current.enabled !== enabled) pi.appendEntry(MODE_ENTRY, { version: 1, enabled });
      }
      refreshStatus(ctx);
      let config;
      let configError;
      try { config = await configuration(ctx); choices(ctx, config.roles); } catch (error) { configError = String(error); }
      let persistent = false;
      const sessionFile = ctx.sessionManager.getSessionFile();
      if (sessionFile) {
        try { await access(sessionFile); persistent = true; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
      const roleStatus = roleController.status();
      const subagentsAvailable = roleStatus.state !== 'unavailable';
      const warning = undefined;
      show({
        mode: state(ctx),
        scope: 'active session branch',
        persistent,
        warning,
        config,
        configError,
        subagents: {
          installed: subagentsAvailable,
          registration: roleStatus,
          exported: Object.values(ROLE_AGENTS),
          roles: ROLES,
          agentRoles: AGENT_ROLES,
          precedence: 'User subagents.agentOverrides.<name> override pstack.json roles; project overrides apply when trusted.',
        },
        capabilities: {
          singleAgent: true,
          subagents: {
            exported: Object.values(ROLE_AGENTS),
            roles: ROLES,
            agentRoles: AGENT_ROLES,
          },
          autoContinue: false,
        },
        skillPath,
      }, ctx);
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
        const roleStatus = roleController.status();
        show({ paths, config, configError, roleStatus, defaults: Object.fromEntries(ROLES.map(role => [role, 'inherit'])), agentRoles: ROLE_AGENTS, appliesTo: 'role preferences bind runtime-registered pstack agent definitions for direct calls and workflow children; user-level subagents.agentOverrides.<name> take precedence; top-level model overrides are blocked' }, ctx);
        return;
      }
      const [, scope, role, model, thinking] = words;
      if (!['set', 'unset'].includes(action) || (scope !== 'user' && scope !== 'project') || !ROLES.includes(role) || (action === 'set' ? words.length < 4 || words.length > 5 : words.length !== 3)) {
        throw new Error(`Usage: /setup-pstack models|status|set <user|project> <${ROLES.join('|')}> <provider/id|inherit> [thinking]|unset <user|project> <role>`);
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
      await refreshRoles(ctx);
      show({ changed, path: paths[scope], scope, role, choice: action === 'set' ? choice : null, currentModelChanged: false }, ctx);
    },
  });
  pi.on('agent_before_settle', async (event, ctx) => {
    let loopInfo;
    try { loopInfo = loopFromBranch(ctx.sessionManager.getBranch()); }
    catch { return; }
    if (!loopInfo.active || !loopInfo.state) return;
    const currentLoop = loopInfo.state;
    if (currentLoop.status !== 'running') return;

    let predicateResult = null;
    if (event.outcome === 'completed' && currentLoop.until?.command) {
      try {
        const timeoutMs = (currentLoop.until.timeoutSec || 60) * 1000;
        const res = await pi.exec('bash', ['-c', currentLoop.until.command], {
          cwd: ctx.cwd,
          timeout: timeoutMs,
        });
        predicateResult = {
          exitCode: res.code,
          timedOut: res.killed,
          error: res.code === null ? 'process killed or failed to launch' : undefined,
        };
      } catch (err: any) {
        predicateResult = {
          exitCode: 127,
          timedOut: false,
          error: String(err?.message ?? err),
        };
      }
    }

    const decision = decideNextStep(currentLoop, predicateResult, {
      outcome: event.outcome,
    });

    // After a normal answer, Pi 1.3.0 reports canContinue=false because the
    // current context ends with an assistant message. Appending a loop message
    // makes the proposed context continuable; Pi validates it after this handler.
    if (decision.action === 'continue') {
      const stateDraft = {
        type: 'custom' as const,
        customType: LOOP_ENTRY,
        data: decision.nextState,
      };
      const turnDraft = {
        type: 'custom_message' as const,
        customType: LOOP_TURN_TYPE,
        content: renderLoopPrompt(decision.nextState, decision.nextState.turn, predicateResult),
        display: true,
      };
      return {
        entries: [...event.entries, stateDraft, turnDraft],
        continue: true,
      };
    } else {
      const stateDraft = {
        type: 'custom' as const,
        customType: LOOP_ENTRY,
        data: decision.nextState,
      };
      return {
        entries: [...event.entries, stateDraft],
        continue: false,
      };
    }
  });
  pi.registerCommand('loop', {
    description: 'Autonomous bounded turn continuation: run [--max-turns <n>] --until <cmd> <goal> | status | stop | resume',
    handler: async (args, ctx) => {
      const parsed = parseLoopArgs(args);
      const branch = ctx.sessionManager.getBranch();
      const current = loopFromBranch(branch);

      if (parsed.action === 'status') {
        show({ loop: current.state, active: current.active, cwd: ctx.cwd }, ctx);
        return;
      }

      if (parsed.action === 'stop') {
        if (!current.active || !current.state) {
          show({ stopped: false, reason: 'no-active-loop', current: current.state }, ctx);
          return;
        }
        const stoppedState = {
          ...current.state,
          status: 'stopped',
          reason: parsed.reason,
          updatedAt: new Date().toISOString(),
        };
        pi.appendEntry(LOOP_ENTRY, stoppedState);
        show({ stopped: true, loop: stoppedState }, ctx);
        return;
      }

      if (parsed.action === 'resume') {
        if (ctx.mode === 'print' || ctx.mode === 'json') throw new Error('/loop run/resume requires RPC/TUI; use pi --mode rpc for headless runs');
        if (!ctx.isIdle()) throw new Error('Wait for the current run to finish before resuming /loop');
        if (current.active) throw new Error('A loop is already active on this branch; use /loop stop first if you want to abort it');
        if (!current.state || !['interrupted', 'stopped'].includes(current.state.status)) {
          throw new Error('No interrupted or stopped loop available to resume on this branch');
        }
        if (!current.state.until?.command?.trim()) throw new Error('--until is required; start a new /loop run with a stop predicate');
        const maxTurns = parsed.maxTurns ?? current.state.maxTurns;
        if (current.state.turn >= maxTurns) {
          throw new Error(`Cannot resume loop: turn count ${current.state.turn} already reached maxTurns ${maxTurns}; specify a higher --max-turns`);
        }
        const resumedState = {
          ...current.state,
          status: 'running',
          maxTurns,
          reason: 'operator-resumed',
          updatedAt: new Date().toISOString(),
        };
        pi.appendEntry(LOOP_ENTRY, resumedState);
        const prompt = renderLoopPrompt(resumedState, resumedState.turn, resumedState.lastPredicateResult);
        await pi.sendMessage({
          customType: LOOP_TURN_TYPE,
          content: prompt,
          display: true,
        }, { triggerTurn: true });
        return;
      }

      if (parsed.action === 'run') {
        if (ctx.mode === 'print' || ctx.mode === 'json') throw new Error('/loop run/resume requires RPC/TUI; use pi --mode rpc for headless runs');
        if (!ctx.isIdle()) throw new Error('Wait for the current run to finish before starting a new /loop');
        if (current.active) throw new Error('A loop is already running on this branch; use /loop stop or /loop status');

        if (!parsed.allowDirty) {
          try {
            const gitStatus = await pi.exec('git', ['status', '--porcelain'], { cwd: ctx.cwd, timeout: 5000 });
            if (gitStatus.code === 0 && gitStatus.stdout?.trim()) {
              throw new Error('Working tree has uncommitted changes. Commit or stash them, or pass --allow-dirty to proceed.');
            }
          } catch (err: any) {
            if (err.message.includes('uncommitted changes')) throw err;
          }
        }

        const initialState = createInitialLoopState({
          goal: parsed.goal,
          maxTurns: parsed.maxTurns,
          until: parsed.until,
          allowDirty: parsed.allowDirty,
        });

        pi.appendEntry(LOOP_ENTRY, initialState);
        const prompt = renderLoopPrompt(initialState, initialState.turn, null);
        await pi.sendMessage({
          customType: LOOP_TURN_TYPE,
          content: prompt,
          display: true,
        }, { triggerTurn: true });
      }
    },
  });
}
