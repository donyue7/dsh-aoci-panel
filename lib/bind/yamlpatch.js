/**
 * A line model for `cordis.patch.yml` files.
 *
 * The plugin never re-emits a whole patch file: it only splices the MCP rows it
 * owns, so every unrelated hand-written row, comment and blank line survives
 * byte-for-byte. That is also why this module is a *line* model instead of a
 * YAML round-trip: a serializer would silently reformat the operator's file.
 *
 * The parser understands the subset a Cordis patch file actually uses —
 * comments, `- ` sequences, `key: value` mappings, quoted and plain scalars,
 * and nested `args:` lists. It is deliberately strict: tabs in indentation,
 * unbalanced quotes, duplicate row ids and structurally broken rows are
 * reported as errors, and callers refuse to write a file that has any.
 *
 * @module dsh-aoci-bind/yamlpatch
 */

/** `- id: some-id` at any indentation. */
const ROW_ID_RE = /^(\s*)-\s+id:\s*'?"?([A-Za-z0-9_@.\-/]+)'?"?\s*(?:#.*)?$/;

/** Leading spaces of one line. */
function indentOf(line) {
  return line.length - line.trimStart().length;
}

/** Strip one layer of matching quotes and any trailing comment. */
export function unquoteScalar(text) {
  let value = String(text).trim();
  const hash = value.indexOf(' #');
  if (hash > 0 && !value.startsWith("'") && !value.startsWith('"')) value = value.slice(0, hash).trim();
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
      value = value.slice(1, -1);
      if (first === "'") value = value.replaceAll("''", "'");
    }
  }
  return value;
}

/** Quote a scalar for emission inside a single-quoted YAML scalar. */
export function quoteScalar(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

/** Count quote characters that are not escaped by doubling. */
function unbalancedQuotes(line) {
  let single = 0;
  let double = 0;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "'") {
      if (line[index + 1] === "'") {
        index += 1;
        continue;
      }
      single += 1;
    } else if (char === '"' && line[index - 1] !== '\\') {
      double += 1;
    }
  }
  return single % 2 !== 0 || double % 2 !== 0;
}

/**
 * Parse a patch file into rows plus structural errors.
 *
 * @param {string} text - file content.
 * @returns {{ok: boolean, errors: string[], lines: string[], rows: object[]}}
 */
export function parsePatch(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const errors = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*\t/.test(line)) errors.push(`line ${index + 1}: tab indentation is not valid YAML`);
    // Comments carry prose (apostrophes included) and are not YAML scalars.
    if (!line.trimStart().startsWith('#') && unbalancedQuotes(line)) {
      errors.push(`line ${index + 1}: unbalanced quote`);
    }
  }

  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = ROW_ID_RE.exec(lines[index]);
    if (match === null) continue;
    const indent = match[1].length;
    let end = lines.length;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor];
      if (candidate.trim() === '') continue;
      if (indentOf(candidate) <= indent) {
        end = cursor;
        break;
      }
    }
    // Blank lines just before the next row are separators, not part of the row.
    let trimmed = end;
    while (trimmed > index + 1 && lines[trimmed - 1].trim() === '') trimmed -= 1;
    const block = lines.slice(index, trimmed);
    rows.push({ id: match[2], indent, start: index, end: trimmed, lines: block, ...extractRowFields(block) });
    index = trimmed - 1;
  }

  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.id)) errors.push(`duplicate row id "${row.id}"`);
    seen.add(row.id);
    if (row.name === undefined && row.config === undefined) {
      errors.push(`row "${row.id}" has neither name nor config`);
    }
  }

  return { ok: errors.length === 0, errors, lines, rows };
}

/** Pull the MCP-relevant fields out of one row block. */
export function extractRowFields(block) {
  const fields = {
    name: undefined,
    config: undefined,
    serverName: undefined,
    command: undefined,
    repo: undefined,
    transport: undefined,
  };
  const rowIndent = indentOf(block[0] ?? '');
  for (let index = 0; index < block.length; index += 1) {
    const line = block[index];
    const indent = indentOf(line);
    const pair = /^\s*([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (pair !== null) {
      const key = pair[1];
      const value = pair[2];
      if (indent === rowIndent + 2 && key === 'name') {
        fields.name = unquoteScalar(value);
        continue;
      }
      if (indent === rowIndent + 2 && key === 'config') {
        fields.config = true;
        continue;
      }
      if (indent === rowIndent + 4) {
        if (key === 'serverName') {
          fields.serverName = unquoteScalar(value);
          continue;
        }
        if (key === 'command') {
          fields.command = unquoteScalar(value);
          continue;
        }
        if (key === 'transport') {
          fields.transport = unquoteScalar(value);
          continue;
        }
      }
    }
    if (/^\s*-\s*'?--repo'?\s*$/.test(line)) {
      const next = block[index + 1];
      if (next !== undefined) {
        const valueMatch = /^\s*-\s*(.+?)\s*$/.exec(next);
        if (valueMatch) fields.repo = unquoteScalar(valueMatch[1]);
      }
    }
  }
  return fields;
}

/**
 * Render one MCP server row at the given indentation.
 *
 * @param {{id: string, serverName: string, command: string, repo: string, name?: string}} row - row data.
 * @param {number} [indent] - spaces before the `- id:` dash.
 * @returns {string[]} lines without a trailing newline.
 */
export function renderMcpRow(row, indent = 4) {
  const pad = ' '.repeat(indent);
  const deep = ' '.repeat(indent + 2);
  const deeper = ' '.repeat(indent + 4);
  return [
    `${pad}- id: ${row.id}`,
    `${deep}name: '@deepseek-ai/dsh-mcp-client'`,
    `${deep}config:`,
    `${deeper}serverName: ${quoteScalar(row.serverName)}`,
    `${deeper}transport: stdio`,
    `${deeper}command: ${quoteScalar(row.command)}`,
    `${deeper}args:`,
    `${deeper}  - '--repo'`,
    `${deeper}  - ${quoteScalar(row.repo)}`,
    `${deeper}  - 'mcp'`,
  ];
}

/**
 * Apply row edits to a patch file's text.
 *
 * Operations are applied to the text as parsed on entry. Replacements reuse the
 * row's original indentation; appends create one fresh top-level `- insert:`
 * block so the file stays valid regardless of how the existing rows are nested.
 *
 * @param {string} text - current file content.
 * @param {Array<{op: 'replace'|'remove'|'append', row?: object, lines?: string[]}>} edits - edits.
 * @returns {string} the new text.
 */
export function applyEdits(text, edits) {
  const parsed = parsePatch(text);
  if (!parsed.ok) throw new Error(`refusing to edit an invalid patch file: ${parsed.errors.join('; ')}`);
  const lines = [...parsed.lines];
  const byId = new Map(parsed.rows.map((row) => [row.id, row]));

  const replacements = [];
  const appends = [];
  for (const edit of edits) {
    if (edit.op === 'append') {
      appends.push(...(edit.lines ?? []));
      continue;
    }
    const row = byId.get(edit.row?.id ?? edit.id);
    if (row === undefined) {
      if (edit.op === 'replace') throw new Error(`row "${edit.id ?? edit.row?.id}" not found`);
      continue;
    }
    replacements.push({ start: row.start, end: row.end, lines: edit.op === 'remove' ? [] : (edit.lines ?? []) });
    byId.delete(row.id);
  }

  replacements.sort((left, right) => right.start - left.start);
  for (const replacement of replacements) {
    lines.splice(replacement.start, replacement.end - replacement.start, ...replacement.lines);
  }

  let output = lines.join('\n');
  if (appends.length > 0) {
    if (!output.endsWith('\n')) output += '\n';
    output += ['', '# --- dsh-aoci-bind: generated MCP bindings ---', '- insert:', ...appends].join('\n');
  }
  if (!output.endsWith('\n')) output += '\n';
  return output;
}

/**
 * Build the appendix lines for one generated `- insert:` block.
 * @param {Array<object>} rows - rows to render.
 * @returns {string[]} rendered lines (without the `- insert:` header).
 */
export function renderInsertRows(rows) {
  const lines = [];
  for (const row of rows) lines.push(...renderMcpRow(row, 4));
  return lines;
}
