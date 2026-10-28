/**
 * One snapshot of everything the tools reason about: workspaces, patch files,
 * observed AOCI rows, and the diagnosis built from them.
 *
 * A snapshot is cheap (a handful of small reads) and read-only, so every tool
 * starts from a fresh one instead of caching state that a hand edit could
 * invalidate.
 *
 * @module dsh-aoci-bind/state
 */

import { deriveScanRoots, discoverWorkspaces } from './discovery.js';
import { readPatchFile } from './patchfiles.js';
import { aociRowsOf, diagnose } from './binding.js';

/**
 * Build a fresh snapshot.
 *
 * @param {object} config - resolved config.
 * @returns {Promise<{discovery: object, files: object[], rows: object[], diagnosis: object}>}
 */
export async function buildSnapshot(config) {
  const registryOnly = await discoverWorkspaces({
    home: config.home,
    registryFile: config.registryFile,
    scanRoots: [],
  });
  const roots = config.scanRoots ?? deriveScanRoots(registryOnly.workspaces);
  const discovery =
    roots.length === 0
      ? registryOnly
      : await discoverWorkspaces({ home: config.home, registryFile: config.registryFile, scanRoots: roots });

  const files = [];
  for (const target of config.patchFiles) {
    files.push(await readPatchFile(target.file, target.role));
  }
  const rows = files.flatMap((file) => aociRowsOf(file, config));
  const diagnosis = diagnose({ workspaces: discovery.workspaces, rows, config });
  return { discovery, files, rows, diagnosis };
}

/** Case-insensitive workspace selector: full path, or a substring of path/title. */
export function matchesSelector(workspace, selector) {
  if (typeof selector !== 'string' || selector.trim() === '') return true;
  const needle = selector.trim().toLowerCase();
  return (
    workspace.path.toLowerCase().includes(needle) ||
    String(workspace.title ?? '').toLowerCase().includes(needle)
  );
}
