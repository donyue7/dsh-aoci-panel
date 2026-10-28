/**
 * Resolved configuration for dsh-aoci-bind.
 *
 * Configuration is normalised by hand rather than by a Cordis `Config` schema:
 * this plugin lives outside the DSH installation, so importing schemastery
 * would be a bare `@deepseek-ai/...` specifier that plain Node resolution
 * cannot resolve from a profile plugin directory (see `toolkit.js`).
 *
 * Every value has a working default, and an unknown or malformed value falls
 * back to that default instead of failing the mount.
 *
 * @module dsh-aoci-bind/config
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

/** What an operator may override in the profile patch. */
export const DEFAULT_CONFIG = {
  /** Mount at all. */
  enabled: true,
  /** Register the four model-facing tools. */
  tools: true,
  /** Inject a short system-prompt section describing the tool family. */
  promptSection: false,
  /** AOCI CLI used for version/init/scan probes. */
  aociBinary: 'C:/aoci/bin/aoci-rc19.exe',
  /** DSH home; defaults to $DSH_HOME. */
  home: undefined,
  /** Profile name; defaults to $DSH_PROFILE, else "desktop". */
  profile: undefined,
  /** "auto" syncs the legacy ~/.dsh patch only when it already exists. */
  legacyHome: 'auto',
  /** Also maintain the profile-level cordis.patch.yml. */
  syncProfilePatch: true,
  /** serverName prefix; the suffix is a slug of the workspace directory name. */
  serverNamePrefix: 'aoci',
  /** Directories scanned for repositories that carry an aoci.txt. */
  scanRoots: undefined,
  /** Where timestamped backups of edited patch files are written. */
  backupDir: undefined,
  /** Subprocess budgets. */
  initTimeoutMs: 180000,
  probeTimeoutMs: 20000,
};

/** Expand a leading `~` and normalise slashes. */
export function expandPath(value, homeDir = os.homedir()) {
  if (typeof value !== 'string' || value === '') return undefined;
  const raw = value.startsWith('~') ? path.join(homeDir, value.slice(1)) : value;
  return path.resolve(raw);
}

/** Coerce to a boolean with a default. */
function boolOf(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

/** Coerce to a positive integer with a default. */
function positiveIntOf(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/** Coerce to a non-empty string with a default. */
function stringOf(value, fallback) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

/**
 * Resolve every config value, including the concrete patch files.
 *
 * @param {object} [raw] - raw config from the profile patch.
 * @param {NodeJS.ProcessEnv} [env] - environment (injectable for tests).
 * @returns {object} the resolved config.
 */
export function normalizeConfig(raw = {}, env = process.env) {
  const homeDir = env.USERPROFILE || env.HOME || os.homedir();
  const home = expandPath(stringOf(raw.home, env.DSH_HOME || path.join(homeDir, '.dsh-harness-next')), homeDir);
  const profile = stringOf(raw.profile, env.DSH_PROFILE || 'desktop');
  const profileDir = expandPath(stringOf(raw.profileDir, env.DSH_PROFILE_DIR || path.join(home, 'profiles', profile)), homeDir);

  let legacyMode = stringOf(raw.legacyHome, DEFAULT_CONFIG.legacyHome);
  if (legacyMode !== 'auto' && legacyMode !== 'on' && legacyMode !== 'off') legacyMode = 'auto';
  const legacyFile = path.join(homeDir, '.dsh', 'cordis.patch.yml');
  const legacyWanted = legacyMode === 'on' || (legacyMode === 'auto' && exists(legacyFile));

  const patchFiles = [];
  patchFiles.push({ role: 'home', file: path.join(home, 'cordis.patch.yml'), enabled: true });
  if (boolOf(raw.syncProfilePatch, DEFAULT_CONFIG.syncProfilePatch)) {
    patchFiles.push({ role: 'profile', file: path.join(profileDir, 'cordis.patch.yml'), enabled: true });
  }
  if (legacyWanted) patchFiles.push({ role: 'legacy', file: legacyFile, enabled: true });

  let scanRoots = Array.isArray(raw.scanRoots)
    ? raw.scanRoots.map((entry) => expandPath(entry, homeDir)).filter(Boolean)
    : undefined;

  return {
    enabled: boolOf(raw.enabled, DEFAULT_CONFIG.enabled),
    tools: boolOf(raw.tools, DEFAULT_CONFIG.tools),
    promptSection: boolOf(raw.promptSection, DEFAULT_CONFIG.promptSection),
    aociBinary: stringOf(raw.aociBinary, DEFAULT_CONFIG.aociBinary),
    home,
    profile,
    profileDir,
    registryFile: path.join(home, 'storages', 'workspace.json'),
    legacyHome: legacyMode,
    legacyFile,
    syncProfilePatch: patchFiles.some((entry) => entry.role === 'profile'),
    serverNamePrefix: stringOf(raw.serverNamePrefix, DEFAULT_CONFIG.serverNamePrefix),
    scanRoots,
    backupDir: expandPath(stringOf(raw.backupDir, path.join(home, 'aoci-bind', 'backups')), homeDir),
    initTimeoutMs: positiveIntOf(raw.initTimeoutMs, DEFAULT_CONFIG.initTimeoutMs),
    probeTimeoutMs: positiveIntOf(raw.probeTimeoutMs, DEFAULT_CONFIG.probeTimeoutMs),
    patchFiles,
  };
}

/** Whether a path exists (sync, cheap, used only during normalisation). */
function exists(file) {
  try {
    fs.accessSync(file);
    return true;
  } catch {
    return false;
  }
}
