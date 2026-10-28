/**
 * Test fixtures: a throwaway DSH home with a workspace registry, repositories
 * carrying an `aoci.txt`, and Cordis patch files.
 *
 * Every fixture lives under the OS temp directory and is removed by the caller's
 * process exit; nothing touches the real DSH home.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeConfig } from '../../lib/bind/config.js';

/** Create a throwaway directory. */
export async function makeTemp(prefix = 'aoci-bind-') {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

/** Write a repository with an AOCI index header. */
export async function makeRepo(parent, name, project = name) {
  const dir = path.join(parent, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, 'aoci.txt'),
    [`#AOCI-ROOT-MANIFEST: 1`, `#Format-Version: cognition-volumes/v1`, `#Locale: zh-CN`, `#Project: ${project}`, ''].join('\n'),
    'utf8',
  );
  return dir;
}

/** Write a repository without an index. */
export async function makePlainDir(parent, name) {
  const dir = path.join(parent, name);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** Write the v2 workspace registry for a home. */
export async function writeRegistry(home, entries) {
  const dir = path.join(home, 'storages');
  await fs.mkdir(dir, { recursive: true });
  const table = {};
  for (const entry of entries) {
    table[entry.id] = {
      path: entry.path,
      title: entry.title ?? path.basename(entry.path),
      sessionIds: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
  }
  const payload = {
    unit: { name: 'workspace', version: 2 },
    global: { initialized: true, defaultWorkspaceId: entries[0]?.id, workspaceIds: entries.map((entry) => entry.id), archivedSessionIds: [], pinnedSessionIds: [] },
    tables: { workspaces: table },
  };
  await fs.writeFile(path.join(home, 'storages', 'workspace.json'), JSON.stringify(payload, null, 2), 'utf8');
}

/** A minimal patch file with one already-bound AOCI row. */
export function boundPatch({ id = 'aoci-gys', serverName = 'aoci-gys', repo }) {
  return [
    '# test patch',
    '- insert:',
    `    - id: ${id}`,
    `      name: '@deepseek-ai/dsh-mcp-client'`,
    '      config:',
    `        serverName: '${serverName}'`,
    '        transport: stdio',
    `        command: 'C:/aoci/bin/aoci-rc19.exe'`,
    '        args:',
    `          - '--repo'`,
    `          - '${repo.replaceAll('\\', '/')}'`,
    `          - 'mcp'`,
    '',
  ].join('\n');
}

/** Read a file as UTF-8. */
export async function readText(file) {
  return fs.readFile(file, 'utf8');
}

/** Build a resolved config pointed at a throwaway home. */
export function configFor(home, overrides = {}) {
  return normalizeConfig(
    {
      home,
      profile: 'desktop',
      legacyHome: 'off',
      aociBinary: path.join(home, 'no-such-aoci.exe'),
      ...overrides,
    },
    { USERPROFILE: home, DSH_HOME: home, DSH_PROFILE: 'desktop' },
  );
}

/** Register one fake host context that records tool registrations. */
export function fakeHost() {
  const tools = [];
  const injections = [];
  const ctx = {
    logger: { info() {}, warn() {} },
    tools: { register: (definition) => tools.push(definition) },
    inject: (services, callback) => injections.push({ services, callback }),
  };
  return { ctx, tools, injections };
}
