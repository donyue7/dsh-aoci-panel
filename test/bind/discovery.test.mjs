import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { discoverWorkspaces, deriveScanRoots, normalizePath, readProject } from '../../lib/bind/discovery.js';
import { makePlainDir, makeRepo, makeTemp, writeRegistry } from './helpers.mjs';

test('reads the #Project header', async () => {
  const root = await makeTemp();
  const repo = await makeRepo(root, 'Demo', 'Demo-Project');
  assert.equal(await readProject(path.join(repo, 'aoci.txt')), 'Demo-Project');
  assert.equal(await readProject(path.join(root, 'missing', 'aoci.txt')), null);
});

test('discovers registry workspaces and flags the one without an index', async () => {
  const home = await makeTemp();
  const repos = path.join(home, 'repos');
  const withIndex = await makeRepo(repos, 'Gys');
  const withoutIndex = await makePlainDir(repos, 'Empty');
  await writeRegistry(home, [
    { id: 'w1', path: withIndex, title: 'Gys' },
    { id: 'w2', path: withoutIndex, title: 'Empty' },
  ]);
  const discovery = await discoverWorkspaces({ home, registryFile: path.join(home, 'storages', 'workspace.json') });
  const gys = discovery.workspaces.find((workspace) => workspace.title === 'Gys');
  const empty = discovery.workspaces.find((workspace) => workspace.title === 'Empty');
  assert.equal(gys.hasIndex, true);
  assert.equal(gys.project, 'Gys');
  assert.equal(empty.hasIndex, false);
  assert.equal(discovery.workspaces.length, 2);
});

test('scan roots add repositories that the registry does not know', async () => {
  const home = await makeTemp();
  const repos = path.join(home, 'repos');
  const registered = await makeRepo(repos, 'Gys');
  const unregistered = await makeRepo(repos, 'StoreProject', 'StoreProject');
  await writeRegistry(home, [{ id: 'w1', path: registered, title: 'Gys' }]);
  const discovery = await discoverWorkspaces({
    home,
    registryFile: path.join(home, 'storages', 'workspace.json'),
    scanRoots: [repos],
  });
  const found = discovery.workspaces.find((workspace) => normalizePath(workspace.path) === normalizePath(unregistered));
  assert.ok(found, 'scanned repository must be discovered');
  assert.equal(found.source, 'scan');
  assert.equal(found.project, 'StoreProject');
});

test('a repository seen by both sources is reported once', async () => {
  const home = await makeTemp();
  const repos = path.join(home, 'repos');
  const repo = await makeRepo(repos, 'Gys');
  await writeRegistry(home, [{ id: 'w1', path: repo, title: 'Gys' }]);
  const discovery = await discoverWorkspaces({
    home,
    registryFile: path.join(home, 'storages', 'workspace.json'),
    scanRoots: [repos],
  });
  assert.equal(discovery.workspaces.length, 1);
  assert.equal(discovery.workspaces[0].source, 'registry');
});

test('deriveScanRoots returns the distinct parents of indexed workspaces', async () => {
  const discovery = {
    workspaces: [
      { path: 'C:/a/one/Gys', hasIndex: true },
      { path: 'C:/a/one/Fws', hasIndex: true },
      { path: 'C:/b/two/Store', hasIndex: true },
      { path: 'C:/b/two/Empty', hasIndex: false },
    ],
  };
  const roots = deriveScanRoots(discovery.workspaces).map((root) => root.replaceAll('\\', '/'));
  assert.deepEqual(roots.sort(), ['C:/a/one', 'C:/b/two']);
});

test('a broken registry is reported, not thrown', async () => {
  const home = await makeTemp();
  await fs.mkdir(path.join(home, 'storages'), { recursive: true });
  await fs.writeFile(path.join(home, 'storages', 'workspace.json'), '{ not json', 'utf8');
  const discovery = await discoverWorkspaces({ home, registryFile: path.join(home, 'storages', 'workspace.json') });
  assert.equal(discovery.workspaces.length, 0);
  assert.match(discovery.registryError, /not valid JSON/);
});
