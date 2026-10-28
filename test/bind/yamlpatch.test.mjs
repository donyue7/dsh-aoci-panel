import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEdits, parsePatch, renderMcpRow } from '../../lib/bind/yamlpatch.js';

const VALID = [
  '# comment',
  '- insert:',
  '    - id: aoci-geren',
  "      name: '@deepseek-ai/dsh-mcp-client'",
  '      config:',
  "        serverName: 'aoci'",
  '        transport: stdio',
  "        command: 'C:/aoci/bin/aoci-rc19.exe'",
  '        args:',
  "          - '--repo'",
  "          - 'C:/Users/me/Desktop/Geren'",
  "          - 'mcp'",
  '- id: agent-default-model',
  '  config:',
  '    model: auto',
  '',
].join('\n');

test('parses rows and their MCP fields', () => {
  const parsed = parsePatch(VALID);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.rows.length, 2);
  const aoci = parsed.rows.find((row) => row.id === 'aoci-geren');
  assert.equal(aoci.serverName, 'aoci');
  assert.equal(aoci.repo, 'C:/Users/me/Desktop/Geren');
  assert.equal(aoci.command, 'C:/aoci/bin/aoci-rc19.exe');
});

test('rejects tab indentation', () => {
  const parsed = parsePatch('- insert:\n\t- id: bad\n');
  assert.equal(parsed.ok, false);
  assert.match(parsed.errors.join(' '), /tab indentation/);
});

test('rejects an unbalanced quote', () => {
  const parsed = parsePatch("- insert:\n    - id: 'broken\n");
  assert.equal(parsed.ok, false);
  assert.match(parsed.errors.join(' '), /unbalanced quote/);
});

test('rejects duplicate row ids', () => {
  const text = ['- insert:', '    - id: same', "      name: 'x'", '    - id: same', "      name: 'y'", ''].join('\n');
  const parsed = parsePatch(text);
  assert.equal(parsed.ok, false);
  assert.match(parsed.errors.join(' '), /duplicate row id "same"/);
});

test('append keeps every unrelated line and adds one insert block', () => {
  const next = applyEdits(VALID, [
    {
      op: 'append',
      lines: renderMcpRow({ id: 'aoci-store', serverName: 'aoci-store', command: 'C:/aoci/bin/aoci-rc19.exe', repo: 'C:/Repo/StoreProject' }, 4),
    },
  ]);
  assert.match(next, /# comment/);
  assert.match(next, /model: auto/);
  assert.match(next, /# --- dsh-aoci-bind: generated MCP bindings ---/);
  assert.match(next, /- id: aoci-store/);
  assert.match(next, /serverName: 'aoci-store'/);
  assert.match(next, /- 'C:\/Repo\/StoreProject'/);
  assert.equal(parsePatch(next).ok, true);
});

test('replace preserves the row indentation and drops the old block', () => {
  const next = applyEdits(VALID, [
    {
      op: 'replace',
      id: 'aoci-geren',
      lines: renderMcpRow({ id: 'aoci-geren', serverName: 'aoci-geren', command: 'C:/aoci/bin/aoci-rc19.exe', repo: 'C:/elsewhere/Geren' }, 4),
    },
  ]);
  const parsed = parsePatch(next);
  assert.equal(parsed.ok, true);
  const row = parsed.rows.find((item) => item.id === 'aoci-geren');
  assert.equal(row.serverName, 'aoci-geren');
  assert.equal(row.repo, 'C:/elsewhere/Geren');
  assert.equal((next.match(/aoci-rc19/g) ?? []).length, 1, 'old command must be gone');
});

test('remove drops exactly one row', () => {
  const next = applyEdits(VALID, [{ op: 'remove', id: 'aoci-geren' }]);
  const parsed = parsePatch(next);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].id, 'agent-default-model');
});

test('refuses to edit an invalid file', () => {
  assert.throws(() => applyEdits('- insert:\n\t- id: bad\n', [{ op: 'append', lines: [] }]), /invalid patch file/);
});
