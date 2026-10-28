/**
 * Workspace discovery for dsh-aoci-bind.
 *
 * A workspace is interesting when it either carries an AOCI index (an
 * `aoci.txt`), or when the operator pointed a scan root at it. Sources:
 *
 *   1. the Host's durable workspace registry (`<home>/storages/workspace.json`);
 *   2. optional scan roots (directories whose children are probed for aoci.txt).
 *
 * Discovery is filesystem-only and never writes.
 *
 * @module dsh-aoci-bind/discovery
 */

import fs from 'node:fs/promises';
import path from 'node:path';

/** Normalise a repository path so it compares equal across slash styles and case. */
export function normalizePath(value) {
  if (typeof value !== 'string' || value === '') return '';
  return path.resolve(value).replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();
}

/** Read the `#Project:` header of a repository's aoci.txt, if any. */
export async function readProject(file) {
  try {
    const text = await fs.readFile(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = /^#Project:\s*(.+?)\s*$/.exec(line);
      if (match) return match[1];
    }
    return null;
  } catch {
    return null;
  }
}

/** Whether a path is a directory. */
async function isDirectory(target) {
  try {
    return (await fs.stat(target)).isDirectory();
  } catch {
    return false;
  }
}

/** Probe one candidate repository directory. */
async function probe(candidate, source) {
  const dir = path.resolve(candidate);
  if (!(await isDirectory(dir))) return undefined;
  const indexFile = path.join(dir, 'aoci.txt');
  const project = await readProject(indexFile);
  return {
    id: `${source}:${normalizePath(dir)}`,
    title: path.basename(dir),
    path: dir,
    hasIndex: project !== null,
    project,
    indexFile,
    source,
  };
}

/** Read the Host workspace registry, tolerating both stored shapes. */
export async function readRegistry(file) {
  let text;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch {
    return { file, workspaces: [], error: undefined };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { file, workspaces: [], error: `workspace registry is not valid JSON: ${error.message}` };
  }
  const table = parsed?.tables?.workspaces;
  const entries = [];
  if (table !== null && typeof table === 'object') {
    for (const [id, value] of Object.entries(table)) {
      if (value !== null && typeof value === 'object' && typeof value.path === 'string') {
        entries.push({ id, path: value.path, title: typeof value.title === 'string' ? value.title : undefined });
      }
    }
  }
  if (Array.isArray(parsed?.workspaces)) {
    for (const value of parsed.workspaces) {
      if (value !== null && typeof value === 'object' && typeof value.path === 'string') {
        entries.push({ id: value.id, path: value.path, title: value.title });
      }
    }
  }
  return { file, workspaces: entries, error: undefined };
}

/**
 * Discover candidate AOCI repositories.
 *
 * @param {{home: string, registryFile?: string, scanRoots?: string[]}} options - discovery inputs.
 * @returns {Promise<{workspaces: object[], registryFile: string, registryError?: string, scannedRoots: string[]}>}
 */
export async function discoverWorkspaces(options) {
  const registryFile = options.registryFile ?? path.join(options.home, 'storages', 'workspace.json');
  const registry = await readRegistry(registryFile);
  const found = new Map();

  for (const entry of registry.workspaces) {
    const workspace = await probe(entry.path, 'registry');
    if (workspace === undefined) continue;
    if (entry.title !== undefined) workspace.title = entry.title;
    workspace.workspaceId = entry.id;
    found.set(normalizePath(workspace.path), workspace);
  }

  const scannedRoots = [];
  for (const root of options.scanRoots ?? []) {
    const dir = path.resolve(root);
    if (!(await isDirectory(dir))) continue;
    scannedRoots.push(dir);
    let children;
    try {
      children = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const child of children) {
      if (!child.isDirectory()) continue;
      if (child.name.startsWith('.') || child.name === 'node_modules') continue;
      const workspace = await probe(path.join(dir, child.name), 'scan');
      if (workspace === undefined || !workspace.hasIndex) continue;
      const key = normalizePath(workspace.path);
      if (!found.has(key)) found.set(key, workspace);
    }
  }

  const workspaces = [...found.values()].sort((left, right) => left.path.localeCompare(right.path));
  return { workspaces, registryFile, registryError: registry.error, scannedRoots };
}

/**
 * Choose sensible scan roots from the registered workspaces: the distinct
 * parent directories of the ones that already carry an index.
 *
 * @param {object[]} workspaces - discovered workspaces.
 * @returns {string[]} distinct parent directories.
 */
export function deriveScanRoots(workspaces) {
  const roots = new Set();
  for (const workspace of workspaces) {
    if (!workspace.hasIndex) continue;
    roots.add(path.dirname(workspace.path));
  }
  return [...roots];
}
