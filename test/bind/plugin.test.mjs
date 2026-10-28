import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { apply, DEFAULT_CONFIG } from '../../lib/bind/index.js';
import { fakeHost, makeTemp } from './helpers.mjs';

/** A raw config pointing at a throwaway home. */
async function rawConfig(overrides = {}) {
  const home = await makeTemp();
  return { home, profile: 'desktop', legacyHome: 'off', aociBinary: path.join(home, 'none.exe'), ...overrides };
}

test('mounting registers exactly the four AOCI binding tools', async () => {
  const host = fakeHost();
  apply(host.ctx, await rawConfig());
  const names = host.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, ['aoci_bind_repair', 'aoci_bind_status', 'aoci_doctor', 'aoci_project_init']);
  for (const tool of host.tools) {
    assert.equal(typeof tool.description, 'string');
    assert.ok(tool.description.length > 20);
    assert.equal(tool.parameters.type, 'object');
    assert.equal(tool.parameters.additionalProperties, false);
    assert.equal(typeof tool.output.render, 'function');
    assert.equal(typeof tool.execute, 'function');
  }
});

test('a disabled plugin registers nothing', async () => {
  const host = fakeHost();
  apply(host.ctx, await rawConfig({ enabled: false }));
  assert.equal(host.tools.length, 0);
});

test('promptSection is opt-in and adds one section', async () => {
  const host = fakeHost();
  apply(host.ctx, await rawConfig({ promptSection: true }));
  assert.equal(host.injections.length, 1);
  assert.deepEqual(host.injections[0].services, ['systemPrompt']);
  const sections = [];
  host.injections[0].callback({ systemPrompt: { section: (section) => sections.push(section) } });
  assert.equal(sections.length, 1);
  assert.equal(typeof sections[0].text, 'string');
  assert.equal(sections[0].interpolate, false);
});

test('a malformed config never throws out of apply', async () => {
  const host = fakeHost();
  assert.doesNotThrow(() => apply(host.ctx, { home: 42, scanRoots: 'nope', initTimeoutMs: -1 }));
  assert.equal(host.tools.length, 4, 'the plugin falls back to defaults and still mounts');
});

test('DEFAULT_CONFIG documents every shipped default', () => {
  for (const key of ['enabled', 'tools', 'aociBinary', 'legacyHome', 'syncProfilePatch', 'serverNamePrefix']) {
    assert.ok(Object.hasOwn(DEFAULT_CONFIG, key), `missing default for ${key}`);
  }
});
