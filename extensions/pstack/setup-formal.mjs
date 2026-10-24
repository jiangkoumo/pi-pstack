/**
 * `/setup-pstack` step 8 (upstream #715): offer a project-local formal
 * verification skill once, and only once, and say whether TLC can run.
 *
 * This module is the injectable half of that step. It owns:
 *   - project skill discovery (any skill name; the decision is made from what the
 *     skill says it does, not from a `verify-` prefix);
 *   - the proposal text, which always carries the TLC capability plus the
 *     explicit no-TLC fallback;
 *   - the "ask once, never nag again" decision, backed by a state record the lead
 *     persists in project-local state (never the user's global Pi config);
 *   - a read-only status view for `/setup-pstack status`.
 *
 * It does not own the confirmation UI, the project state file, or invoking the
 * generator skill. The lead injects `ask`, `stateStore` and `probeTlc`, and runs
 * the accepted offer with `/skill:create-formal-verification-skill`.
 */
import { mkdir, open, readdir, readFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { detectTlc, TLC_MISSING_WARNING } from './verification-exec.mjs';

/** Key of the offer record inside the project state object the lead persists. */
export const SETUP_FORMAL_STATE_KEY = 'formalVerificationSkillOffer';
export const SETUP_FORMAL_STATE_VERSION = 1;

/** Upstream step 8 resolves this wherever pstack is installed; in a Pi package it is a skill. */
export const FORMAL_SKILL_COMMAND = '/skill:create-formal-verification-skill';

/** Project skill roots Pi loads (`CONFIG_DIR_NAME` defaults to `.pi`). */
export const DEFAULT_SKILL_DIRS = Object.freeze(['.pi/skills', '.agents/skills']);
export const MAX_SKILL_DEPTH = 6;
export const MAX_SKILLS = 200;
export const MAX_SKILL_BYTES = 256 * 1024;

/**
 * Tool signals: something that actually checks a model, a proof or a program.
 * A `verify-*` skill that drives the app with a browser never matches these.
 */
export const FORMAL_TOOL_MARKERS = Object.freeze([
  { label: 'tla', pattern: /\btla\+?\b/i },
  { label: 'tla2tools', pattern: /\btla2tools\b/i },
  { label: 'tlc', pattern: /\btlc\b/i },
  { label: 'alloy', pattern: /\balloy\b/i },
  { label: 'dafny', pattern: /\bdafny\b/i },
  { label: 'coq', pattern: /\bcoq\b/i },
  { label: 'z3', pattern: /\bz3\b/i },
  { label: 'smt', pattern: /\bsmt\b/i },
  { label: 'apalache', pattern: /\bapalache\b/i },
  { label: 'promela', pattern: /\bpromela\b/i },
  { label: 'nusmv', pattern: /\bnusmv\b/i },
  { label: 'model-checker', pattern: /\bmodel[-\s]?check(?:er|ing)?\b/i },
  { label: 'proof-assistant', pattern: /\b(?:proof assistant|theorem prover)\b/i },
  { label: 'invariant-checker', pattern: /\binvariant (?:checker|checking|violation)\b/i },
]);

/** Intent signals: the skill's job is a verification claim, not a smoke test. */
export const FORMAL_INTENT_MARKERS = Object.freeze([
  { label: 'formal-verification', pattern: /\bformal (?:verification|methods?|proof|specification)\b/i },
  { label: 'proof', pattern: /\bpro(?:ve|ves|of|ving)\b/i },
  { label: 'invariant', pattern: /\binvariants?\b/i },
  { label: 'counterexample', pattern: /\bcounter-?examples?\b/i },
  { label: 'property-holds', pattern: /\b(?:property|properties) (?:holds?|is preserved|must hold)\b/i },
  { label: 'model-scope', pattern: /\b(?:every|all) (?:order|case|execution)s? in (?:the )?scope\b/i },
]);

/** A skill name alone is enough when it names a formal method. */
export const FORMAL_NAME_PATTERN = /\b(?:formal|proof|proofs|prove|tla\+?|tlc|model-check|modelcheck)\b|\binvariant|\balloy\b|\bdafny\b/i;

const stripFrontmatter = text => text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
const frontmatterValue = (text, key) => {
  const match = text.match(new RegExp('^' + key + ':\\s*(.+)$', 'm'));
  return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null;
};
const errorText = error => (error instanceof Error ? error.message : String(error));

/**
 * Decide from content whether a project skill is a formal verification skill.
 * Pure: pass `{ name, description, content }`, get back the evidence used.
 *
 * @param {{ name?: string, description?: string|null, content?: string }} skill
 * @returns {{ formal: boolean, name: string, tools: string[], intents: string[], reason: string }}
 */
export function classifyFormalSkill(skill = {}) {
  const name = typeof skill.name === 'string' ? skill.name : '';
  const text = [skill.description ?? '', skill.content ?? ''].join('\n');
  const tools = FORMAL_TOOL_MARKERS.filter(marker => marker.pattern.test(text)).map(marker => marker.label);
  const intents = FORMAL_INTENT_MARKERS.filter(marker => marker.pattern.test(text)).map(marker => marker.label);
  const nameSignal = FORMAL_NAME_PATTERN.test(name);
  const formal = tools.length > 0 && intents.length > 0 || nameSignal && tools.length > 0;
  let reason;
  if (formal) reason = `names/runs a formal tool (${tools.join(', ')}) for a verification claim (${intents.join(', ') || 'named formal method'})`;
  else if (tools.length > 0) reason = `mentions ${tools.join(', ')} without a verification claim`;
  else reason = 'no model checker, proof or other formal verifier';
  return { formal, name, tools, intents, reason };
}

async function walkSkills(directory, depth, state) {
  if (depth > MAX_SKILL_DEPTH || state.skills.length >= MAX_SKILLS) return;
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    state.errors.push(`${directory}: ${errorText(error)}`);
    return;
  }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (state.skills.length >= MAX_SKILLS) return;
    const full = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) continue; // never follow a project symlink out of the tree
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const skillFile = resolve(full, 'SKILL.md');
      let content;
      try {
        content = await readFile(skillFile, 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') state.errors.push(`${skillFile}: ${errorText(error)}`);
        await walkSkills(full, depth + 1, state);
        continue;
      }
      if (Buffer.byteLength(content, 'utf8') > MAX_SKILL_BYTES) {
        state.errors.push(`${skillFile}: larger than ${MAX_SKILL_BYTES} bytes, not scanned`);
        continue; // do not descend: a skill's own references are not separate skills
      }
      const declared = frontmatterValue(content, 'name');
      state.skills.push({
        name: declared || entry.name,
        folder: entry.name,
        file: skillFile,
        directory: full,
        description: frontmatterValue(content, 'description'),
        content: stripFrontmatter(content),
      });
      continue;
    }
  }
}

/**
 * List project-local skills from the Pi skill roots (`.pi/skills`, `.agents/skills`).
 * Missing roots are not an error; unreadable ones are reported in `errors`.
 *
 * @param {{ cwd?: string, skillDirs?: string[] }} [options]
 * @returns {Promise<{ cwd: string, roots: string[], skills: any[], errors: string[] }>}
 */
export async function listProjectSkills(options = {}) {
  const cwd = resolve(options.cwd ?? process.cwd());
  const roots = [];
  for (const dir of options.skillDirs ?? DEFAULT_SKILL_DIRS) {
    const root = resolve(cwd, dir);
    const rel = relative(cwd, root);
    if (!rel || rel === '..' || rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) || isAbsolute(rel)) {
      continue; // only project-local roots; a project skill cannot be discovered outside the project
    }
    roots.push({ dir, root });
  }
  const state = { skills: [], errors: [] };
  for (const { root } of roots) await walkSkills(root, 0, state);
  state.skills.sort((left, right) => left.file.localeCompare(right.file));
  return { cwd, roots: roots.map(entry => entry.dir), skills: state.skills, errors: state.errors };
}

/**
 * Find the project skills that already verify code formally. Discovery is by
 * content, so `state-machine-proofs` counts and a `verify-checkout` browser
 * harness does not.
 *
 * @param {{ cwd?: string, skillDirs?: string[] }} [options]
 */
export async function findFormalVerificationSkills(options = {}) {
  const listing = await listProjectSkills(options);
  const annotated = listing.skills.map(skill => ({ ...skill, judgement: classifyFormalSkill(skill) }));
  const formal = annotated.filter(skill => skill.judgement.formal);
  return { ...listing, annotated, formal };
}

/** Normalize a persisted offer record. Unknown or missing values mean "unanswered". */
export function readFormalOfferState(state) {
  const raw = state?.[SETUP_FORMAL_STATE_KEY];
  if (!raw || typeof raw !== 'object') return { status: 'unanswered', decidedAt: null, reason: null };
  if (raw.status !== 'accepted' && raw.status !== 'declined') return { status: 'unanswered', decidedAt: null, reason: null };
  return {
    status: raw.status,
    decidedAt: typeof raw.decidedAt === 'string' ? raw.decidedAt : null,
    reason: typeof raw.reason === 'string' ? raw.reason : null,
  };
}

/**
 * The once-only rule. An existing formal skill wins over any recorded decision;
 * a recorded decline is final; a recorded acceptance is final (the lead runs the
 * generator once and does not re-offer). Anything else can be offered.
 */
export function decideFormalOffer({ formalSkills = [], state } = {}) {
  if (formalSkills.length > 0) {
    return {
      offer: false,
      status: 'existing-skill',
      reason: `project already has a formal verification skill (${formalSkills.map(skill => skill.name).join(', ')})`,
    };
  }
  const recorded = readFormalOfferState(state);
  if (recorded.status === 'declined') {
    return { offer: false, status: 'declined-earlier', reason: 'the user declined this offer before; do not push it again' };
  }
  if (recorded.status === 'accepted') {
    return { offer: false, status: 'accepted-earlier', reason: 'the user accepted this offer before; do not offer it a second time' };
  }
  return { offer: true, status: 'offer', reason: 'no project formal verification skill and no recorded decision' };
}

/** Reduce a TLC capability record (or a probe failure) to what the proposal needs. */
export function summarizeTlc(tlc) {
  if (!tlc || typeof tlc !== 'object') {
    return {
      available: false,
      probed: false,
      formal: 'none',
      reason: 'TLC capability was not probed on this host; formal checks cannot be claimed',
      warning: TLC_MISSING_WARNING,
      javaVersion: null,
      jarPath: null,
      fallbackRequired: true,
    };
  }
  const available = tlc.available === true;
  return {
    available,
    probed: true,
    formal: available ? 'tlc' : 'none',
    reason: available ? null : tlc.reason ?? 'TLC is not available on this host',
    warning: available ? null : tlc.warning ?? TLC_MISSING_WARNING,
    javaVersion: tlc.java?.version ?? null,
    jarPath: tlc.jar?.path ?? null,
    fallbackRequired: !available,
    fallback: available ? null : tlc.fallback ?? null,
  };
}

/**
 * Build the confirmation proposal. Pure. The question always states the TLC
 * capability, and when TLC is missing it states the upstream fallback and that
 * the fallback is not a formal pass.
 */
export function buildFormalSkillProposal({ tlc, formalSkills = [] } = {}) {
  const capability = summarizeTlc(tlc);
  const capabilityLine = capability.available
    ? `TLC is available on this host (Java ${capability.javaVersion ?? 'unknown'}, jar ${capability.jarPath ?? 'unknown'}): a TLA+ check can run through verification_exec, covering only the properties and bounds written in the .tla/.cfg files.`
    : `未做形式化验证，原因是缺少 TLC (${capability.reason}). Without TLC the generated skill falls back to generated-input tests that run the real code; that fallback is not a formal pass and must be reported as generated-test coverage.`;
  const question = [
    'This project has no formal verification skill: nothing here runs a model checker, a proof, or another verifier against the code.',
    `Want one, so agents can prove a key property holds in every case in scope, not only the cases tests reach? I can generate one with ${FORMAL_SKILL_COMMAND}.`,
    capabilityLine,
  ].join('\n');
  return {
    id: 'setup-pstack.formal-verification-skill',
    question,
    options: [
      { value: 'accept', label: 'Create the formal verification skill', description: `runs ${FORMAL_SKILL_COMMAND} and writes a project-local skill` },
      { value: 'decline', label: 'No thanks', description: 'recorded for this project; the offer is never repeated' },
      { value: 'cancel', label: 'Not now', description: 'no decision is recorded, so a later setup run may ask again' },
    ],
    formalSkillCommand: FORMAL_SKILL_COMMAND,
    tlc: capability,
    existingFormalSkills: formalSkills.map(skill => ({ name: skill.name, file: skill.file })),
    askedOnce: true,
  };
}

function normalizeAnswer(answer) {
  if (answer && typeof answer === 'object') {
    const value = answer.value ?? answer.action ?? answer.id ?? answer.choice;
    return normalizeAnswer(value);
  }
  if (answer === true) return 'accept';
  if (answer === false) return 'decline';
  if (typeof answer !== 'string') return 'cancel';
  const token = answer.trim().toLowerCase();
  if (['accept', 'accepted', 'yes', 'y', 'approve', 'approved'].includes(token)) return 'accept';
  if (['decline', 'declined', 'no', 'n', 'reject', 'skip'].includes(token)) return 'decline';
  return 'cancel'; // dismiss, cancel, timeout, empty: not a decision
}

/**
 * Read-only status view for `/setup-pstack status` and `/poteto status`.
 * Never prompts.
 */
export function describeFormalSkillStatus({ tlc, formalSkills = [], state, scanErrors = [] } = {}) {
  const decision = decideFormalOffer({ formalSkills, state });
  return {
    tlc: summarizeTlc(tlc),
    formalVerificationSkills: formalSkills.map(skill => ({ name: skill.name, file: skill.file, reason: skill.judgement?.reason ?? null })),
    offer: { ...readFormalOfferState(state), ...decision },
    scanErrors,
  };
}

/**
 * Run step 8: offer the project a formal verification skill at most once.
 *
 * @param {object} [options]
 * @param {string} [options.cwd] project root used for skill discovery.
 * @param {string[]} [options.skillDirs] override the discovered skill roots.
 * @param {unknown} [options.config] pstack config passed to the TLC probe.
 * @param {boolean} [options.allowPrompt] true only for `/setup-pstack` or an explicit configure action. Status calls pass false and never see a prompt.
 * @param {(proposal: ReturnType<typeof buildFormalSkillProposal>) => Promise<unknown>|unknown} [options.ask] injected confirmation UI. Return `accept`/`decline`/anything else (cancel).
 * @param {{ load?: () => Promise<object>|object, save?: (next: object) => Promise<unknown> }} [options.stateStore] injected project-local state. Without a save hook nothing is persisted and `persisted` stays false.
 * @param {(args: object) => Promise<object>} [options.probeTlc] injected capability probe; defaults to `detectTlc`.
 * @param {() => Date} [options.now] injectable clock for tests.
 */
export async function maybeOfferFormalVerificationSkill(options = {}) {
  const cwd = resolve(options.cwd ?? process.cwd());
  const now = options.now ?? (() => new Date());
  const scan = await findFormalVerificationSkills({ cwd, skillDirs: options.skillDirs });
  let tlc;
  try {
    const probe = options.probeTlc ?? detectTlc;
    tlc = await probe({ config: options.config });
  } catch (error) {
    tlc = { available: false, formal: 'none', reason: `TLC probe failed: ${errorText(error)}`, warning: TLC_MISSING_WARNING };
  }
  const capability = summarizeTlc(tlc);

  let state = null;
  let persistence = 'none';
  let stateError = null;
  if (options.stateStore?.load) {
    try {
      const loaded = await options.stateStore.load();
      state = loaded && typeof loaded === 'object' ? loaded : null;
      persistence = options.stateStore.save ? 'load+save' : 'load';
    } catch (error) {
      stateError = errorText(error);
    }
  }

  const decision = decideFormalOffer({ formalSkills: scan.formal, state });
  const result = {
    cwd,
    status: decision.status,
    reason: decision.reason,
    tlc: capability,
    existingSkills: scan.skills.map(skill => skill.name),
    formalSkills: scan.formal.map(skill => ({ name: skill.name, file: skill.file, reason: skill.judgement.reason })),
    scanErrors: scan.errors,
    recorded: readFormalOfferState(state),
    stateError,
    persistence,
    persisted: false,
    prompted: false,
    question: null,
    options: null,
    formalSkillCommand: FORMAL_SKILL_COMMAND,
  };
  if (!decision.offer) return result;

  const proposal = buildFormalSkillProposal({ tlc, formalSkills: scan.formal });
  if (options.allowPrompt !== true) {
    return { ...result, status: 'no-prompt', reason: 'read-only call: no confirmation UI is allowed here; the lead prompts during /setup-pstack or an explicit configure action', proposalSummary: proposal.question, options: proposal.options };
  }
  if (typeof options.ask !== 'function') {
    return { ...result, status: 'no-ui', reason: 'no confirmation UI was injected, so nothing was asked and nothing is recorded', proposalSummary: proposal.question, options: proposal.options };
  }

  let answer;
  try {
    answer = await options.ask(proposal);
  } catch (error) {
    answer = { value: 'cancel', error: errorText(error) };
  }
  const outcome = normalizeAnswer(answer);
  const prompted = { ...result, prompted: true, question: proposal.question, options: proposal.options };
  if (outcome === 'cancel') {
    return {
      ...prompted,
      status: 'cancelled',
      reason: 'no answer was given; a cancelled prompt is not a decline, so no decision is recorded and a later run may offer again',
      persisted: false,
    };
  }

  const record = {
    status: outcome === 'accept' ? 'accepted' : 'declined',
    decidedAt: now().toISOString(),
    reason: outcome === 'accept'
      ? 'user accepted the formal verification skill proposal'
      : 'user declined the formal verification skill proposal; do not offer it again in this project',
  };
  const nextState = { ...(state ?? { version: SETUP_FORMAL_STATE_VERSION }), [SETUP_FORMAL_STATE_KEY]: record };
  let persisted = false;
  if (options.stateStore?.save) {
    try {
      await options.stateStore.save(nextState);
      persisted = true;
    } catch (error) {
      stateError = errorText(error);
    }
  }
  return {
    ...prompted,
    status: record.status,
    reason: record.reason,
    recorded: { ...record },
    persisted,
    stateError,
    nextState,
    instruction: record.status === 'accepted'
      ? `Invoke ${FORMAL_SKILL_COMMAND} to generate the project-local formal verification skill.`
      : 'Do not offer a formal verification skill again in this project.',
  };
}

/**
 * A project-local JSON state store, so the lead never writes the user's global
 * Pi config for this decision. The lead may instead persist the same
 * `formalVerificationSkillOffer` key inside its own project state (e.g.
 * `.pi/pstack.json`) via an injected `{ load, save }`.
 */
export function createProjectStateStore(options = {}) {
  const cwd = resolve(options.cwd ?? process.cwd());
  const path = resolve(cwd, options.dirName ?? '.pi', options.fileName ?? 'pstack-setup.json');
  const rel = relative(cwd, path);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`refusing a state path outside the project: ${path}`);
  }
  return {
    path,
    async load() {
      try {
        return JSON.parse(await readFile(path, 'utf8'));
      } catch (error) {
        if (error.code === 'ENOENT') return { version: SETUP_FORMAL_STATE_VERSION };
        throw new Error(`${path}: ${errorText(error)}`, { cause: error });
      }
    },
    async save(next) {
      const payload = (next && typeof next === 'object' ? next : {});
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${randomUUID()}.tmp`;
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(JSON.stringify({ ...payload, version: payload.version ?? SETUP_FORMAL_STATE_VERSION }, null, 2) + '\n');
        await file.sync();
      } finally {
        await file.close();
      }
      try {
        await rename(temporary, path);
      } finally {
        await rm(temporary, { force: true });
      }
      return path;
    },
  };
}
