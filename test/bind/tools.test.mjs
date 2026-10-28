import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { apply } from '../../lib/bind/index.js';
import { boundPatch, fakeHost, makeRepo, makeTemp, readText, writeRegistry } from './helpers.mjs';

/** Mount the plugin on a fake Host and index its tools by name. */
async function mount() {
  const home = await makeTemp();
  const repos = path.join(home, 'repos');
  const gys = await makeRepo(repos, 'Gys');
  const store = await makeRepo(repos, 'StoreProject');
  await writeRegistry(home, [
    { id: 'w1', path: gys, title: 'Gys' },
    { id: 'w2', path: store, title: 'StoreProject' },
  ]);
  const patch = path.join(home, 'cordis.patch.yml');
  await fs.writeFile(patch, boundPatch({ repo: gys }), 'utf8');
  const host = fakeHost();
  apply(host.ctx, { home, profile: 'desktop', legacyHome: 'off', aociBinary: path.join(home, 'no-such-aoci.exe') });
  const tools = new Map(host.tools.map((tool) => [tool.name, tool]));
  return { home, gys, store, patch, tools };
}

const tool = (store, name) => {
  const found = store.tools.get(name);
  assert.ok(found, `tool ${name} must be registered`);
  return found;
};

test('aoci_bind_status reports the unbound workspace and its fix', async () => {
  const store = await mount();
  const status = tool(store, 'aoci_bind_status');
  const value = await status.execute({}, {});
  assert.equal(value.ok, false);
  assert.equal(value.summary.workspaces, 2);
  assert.equal(value.summary.bound, 1);
  const unbound = value.workspaces.find((workspace) => workspace.state === 'unbound');
  assert.equal(unbound.title, 'StoreProject');
  assert.match(unbound.fix, /aoci-storeproject/);
  const rendered = status.output.render({}, value);
  assert.equal(rendered[0].type, 'text');
  assert.match(rendered[0].text, /StoreProject/);
});

test('aoci_bind_status filters by workspace substring', async () => {
  const store = await mount();
  const value = await tool(store, 'aoci_bind_status').execute({ workspace: 'store' }, {});
  assert.equal(value.workspaces.length, 1);
  assert.equal(value.workspaces[0].title, 'StoreProject');
});

test('aoci_bind_repair dry-run writes nothing, the real run binds, and a repeat is a no-op', async () => {
  const store = await mount();
  const repair = tool(store, 'aoci_bind_repair');
  const before = await readText(store.patch);

  const dry = await repair.execute({ dry_run: true }, {});
  assert.equal(dry.ok, true);
  assert.equal(dry.dryRun, true);
  assert.equal(dry.changes.length, 1);
  assert.equal(await readText(store.patch), before, 'dry run must not write');

  const real = await repair.execute({}, {});
  assert.equal(real.ok, true);
  assert.equal(real.changes.length, 1);
  assert.ok(real.backups.length >= 1, 'a write must leave a backup');

  const repeat = await repair.execute({}, {});
  assert.equal(repeat.ok, true);
  assert.equal(repeat.changes.length, 0);

  const status = await tool(store, 'aoci_bind_status').execute({}, {});
  assert.equal(status.ok, true);
  assert.equal(status.summary.problems, 0);
});

test('aoci_doctor fails on a missing CLI and on the unbound index', async () => {
  const store = await mount();
  const value = await tool(store, 'aoci_doctor').execute({}, {});
  assert.equal(value.ok, false);
  const cli = value.checks.find((check) => check.name === 'aoci-cli');
  assert.equal(cli.severity, 'error');
  const unbound = value.checks.find((check) => check.name === 'unbound-indexes');
  assert.equal(unbound.severity, 'error');
  assert.match(value.summary, /error/);
});

test('aoci_project_init fails cleanly when the AOCI CLI is missing', async () => {
  const store = await mount();
  const value = await tool(store, 'aoci_project_init').execute({ workspace: 'StoreProject' }, {});
  assert.equal(value.ok, false);
  assert.match(value.error, /AOCI CLI/);
  assert.equal(value.steps[0].step, 'aoci-version');
  assert.equal(value.steps[0].ok, false);
});

test('output renders are always text blocks', async () => {
  const store = await mount();
  for (const name of ['aoci_bind_status', 'aoci_doctor']) {
    const definition = tool(store, name);
    const value = await definition.execute({}, {});
    const rendered = definition.output.render({}, value);
    assert.ok(Array.isArray(rendered) && rendered.length > 0);
    assert.equal(typeof rendered[0].text, 'string');
  }
});
