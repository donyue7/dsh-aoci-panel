/**
 * Binding model for dsh-aoci-bind.
 *
 * A *binding* is one `@deepseek-ai/dsh-mcp-client` row in a Cordis patch file
 * that launches `aoci --repo <workspace> mcp` under a unique `serverName`. This
 * module turns the observed patch rows plus the discovered workspaces into a
 * diagnosis, and the diagnosis into a concrete edit plan. It never touches the
 * filesystem: `patchfiles.js` executes the plan.
 *
 * @module dsh-aoci-bind/binding
 */

import path from 'node:path';
import { normalizePath } from './discovery.js';

/** Whether a patch row looks like an AOCI MCP binding. */
export function isAociRow(row, prefix = 'aoci') {
  const command = typeof row.command === 'string' ? row.command.replaceAll('\\', '/').toLowerCase() : '';
  if (command.includes('aoci')) return true;
  // A broken binding can lose its command; its serverName still identifies it
  // (`aoci` for the legacy Geren row, `aoci-*` for the others). Other MCP
  // servers (`zxy`, `omnisockit`) and this plugin's own mount row are excluded.
  const serverName = typeof row.serverName === 'string' ? row.serverName.toLowerCase() : '';
  const base = String(prefix).toLowerCase();
  return serverName !== '' && (serverName === base || serverName.startsWith(`${base}-`));
}

/** Turn a directory name into a stable, collision-safe slug. */
export function slugOf(value) {
  const slug = String(value ?? '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
  return slug === '' ? 'workspace' : slug;
}

/** Collect the AOCI rows of one patch file. */
export function aociRowsOf(parsedFile, config) {
  const rows = [];
  for (const row of parsedFile.parsed?.rows ?? []) {
    if (!isAociRow(row, config.serverNamePrefix)) continue;
    rows.push({
      id: row.id,
      serverName: row.serverName,
      command: row.command,
      repo: row.repo,
      indent: row.indent,
      file: parsedFile.file,
      role: parsedFile.role,
    });
  }
  return rows;
}

/** Build the unique id and serverName for a workspace that has no binding yet. */
function allocateNames(workspace, rows, config) {
  const baseSlug = slugOf(path.basename(workspace.path));
  const takenIds = new Set(rows.map((row) => row.id));
  const takenServerNames = new Set(rows.map((row) => row.serverName).filter(Boolean));

  let id = `${config.serverNamePrefix}-${baseSlug}`;
  for (let suffix = 2; takenIds.has(id); suffix += 1) id = `${config.serverNamePrefix}-${baseSlug}-${suffix}`;

  let serverName = `${config.serverNamePrefix}-${baseSlug}`;
  for (let suffix = 2; takenServerNames.has(serverName); suffix += 1) {
    serverName = `${config.serverNamePrefix}-${baseSlug}-${suffix}`;
  }
  return { id, serverName };
}

/**
 * Diagnose every workspace and every AOCI row.
 *
 * @param {{workspaces: object[], rows: object[], config: object}} input - inputs.
 * @returns {{ok: boolean, workspaces: object[], orphans: object[], duplicates: object[], problems: object[]}}
 */
export function diagnose({ workspaces, rows, config }) {
  // The legacy `~/.dsh` patch is kept in sync for compatibility, but the Host
  // does not read it: a binding that only lives there is *not* usable. Active
  // and legacy rows therefore never collide with each other.
  const activeRows = rows.filter((row) => row.role !== 'legacy');
  const legacyRows = rows.filter((row) => row.role === 'legacy');

  const byRepo = new Map();
  for (const row of activeRows) {
    const repo = normalizePath(row.repo ?? '');
    if (repo === '') continue;
    if (!byRepo.has(repo)) byRepo.set(repo, []);
    byRepo.get(repo).push(row);
  }

  const serverNameCounts = new Map();
  for (const row of activeRows) {
    if (!row.serverName) continue;
    serverNameCounts.set(row.serverName, (serverNameCounts.get(row.serverName) ?? 0) + 1);
  }

  const results = [];
  const claimedRows = new Set();
  for (const workspace of workspaces) {
    const repo = normalizePath(workspace.path);
    const matching = byRepo.get(repo) ?? [];
    for (const row of matching) claimedRows.add(row);
    const legacyMatches = legacyRows.filter((item) => normalizePath(item.repo ?? '') === repo);
    for (const item of legacyMatches) claimedRows.add(item);
    const row = matching[0];
    const namesInUse = new Set(
      activeRows.filter((other) => other !== row).map((other) => other.serverName).filter(Boolean),
    );

    // A row that names this workspace but points `--repo` somewhere else is a
    // *wrong repository* binding, not an unbound workspace: the tool shows up
    // under the expected name while reading a different index.
    const baseId = `${config.serverNamePrefix}-${slugOf(path.basename(workspace.path))}`;
    const expected = allocateNames(
      workspace,
      activeRows.filter((item) => item !== row),
      config,
    );
    const misplaced =
      row === undefined
        ? activeRows.find(
            (item) =>
              !claimedRows.has(item) &&
              (item.id === baseId || item.serverName === baseId || item.id === expected.id),
          )
        : undefined;
    const effectiveRow = row ?? misplaced;
    if (misplaced !== undefined) claimedRows.add(misplaced);

    let state;
    let detail;
    let fix;
    if (!workspace.hasIndex) {
      state = 'no_index';
      detail = 'workspace 里没有 aoci.txt（还没初始化 AOCI）';
      fix = '调用 aoci_project_init 初始化并注册';
    } else if (row === undefined && misplaced !== undefined) {
      state = 'wrong_repo';
      detail = `行 "${misplaced.id}" 的 --repo 指向 ${misplaced.repo ?? '(缺失)'}，不是本工作区`;
      fix = `把该行的 --repo 改成本工作区路径`;
    } else if (row === undefined) {
      state = 'unbound';
      detail =
        legacyMatches.length > 0
          ? `仓库有 aoci.txt，但绑定只写在旧 home（~/.dsh），DSH 不读它 → 会话仍拿不到工具`
          : '仓库有 aoci.txt，但没有任何 AOCI MCP 行 → 会话拿不到该仓库的工具';
      fix = `添加绑定（serverName 建议 ${expected.serverName}）`;
    } else if (matching.length > 1) {
      state = 'duplicate_binding';
      detail = `同一仓库有 ${matching.length} 条 AOCI 行（${matching.map((item) => item.id).join(', ')}）`;
      fix = '删除多余行，只保留一条';
    } else if (effectiveRow.serverName && serverNameCounts.get(effectiveRow.serverName) > 1) {
      state = 'name_conflict';
      detail = `serverName "${effectiveRow.serverName}" 被多条行使用 → 工具命名空间冲突`;
      fix = '改名为唯一的 serverName';
    } else {
      const candidate = allocateNames(workspace, activeRows, config);
      if (effectiveRow.serverName && namesInUse.has(effectiveRow.serverName)) {
        state = 'name_conflict';
        detail = `serverName "${effectiveRow.serverName}" 与其它仓库重复`;
        fix = `改名为 ${candidate.serverName}`;
      } else {
        state = 'bound';
        detail = effectiveRow.serverName
          ? `已绑定：serverName=${effectiveRow.serverName}（工具前缀 mcp__${effectiveRow.serverName}__）`
          : 'AOCI 行存在但缺少 serverName';
        fix = effectiveRow.serverName ? undefined : '补 serverName 字段';
      }
    }

    results.push({
      title: workspace.title,
      path: workspace.path,
      project: workspace.project,
      hasIndex: workspace.hasIndex,
      state,
      detail,
      fix,
      rowId: effectiveRow?.id,
      serverName: effectiveRow?.serverName,
      file: effectiveRow?.file,
      role: effectiveRow?.role,
      legacyShadow: legacyMatches.length > 0,
      toolPrefix: effectiveRow?.serverName ? `mcp__${effectiveRow.serverName}__` : undefined,
    });
  }

  const orphans = activeRows
    .filter((row) => !claimedRows.has(row))
    .map((row) => ({
      id: row.id,
      serverName: row.serverName,
      repo: row.repo,
      file: row.file,
      role: row.role,
      detail:
        row.repo && normalizePath(row.repo) !== ''
          ? '绑定的 --repo 目录不存在或不是已知工作区'
          : 'AOCI 行没有 --repo 参数',
    }));

  // Legacy rows that no workspace claims are inert: report them separately so a
  // stale shadow does not look like an active problem.
  const legacyOrphans = legacyRows
    .filter((row) => !claimedRows.has(row))
    .map((row) => ({ id: row.id, repo: row.repo, file: row.file }));

  const duplicateNames = [...serverNameCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([serverName, count]) => ({ serverName, count }));

  const problems = [];
  for (const workspace of results) {
    if (workspace.state !== 'bound') {
      problems.push({ severity: workspace.state === 'no_index' ? 'warn' : 'error', target: workspace.path, state: workspace.state, detail: workspace.detail, fix: workspace.fix });
    }
  }
  for (const orphan of orphans) {
    problems.push({ severity: 'warn', target: orphan.id, state: 'orphan_row', detail: orphan.detail, fix: '确认后删除该行（repair 的 prune_orphans）' });
  }
  for (const duplicate of duplicateNames) {
    problems.push({ severity: 'error', target: duplicate.serverName, state: 'duplicate_server_name', detail: `serverName 出现 ${duplicate.count} 次`, fix: 'renaming to a unique name' });
  }

  // `no_index` is a warning: a repository that has no index is out of scope, not
  // a broken binding. Only real errors make the diagnosis fail.
  return {
    ok: !problems.some((problem) => problem.severity === 'error'),
    workspaces: results,
    orphans,
    legacyOrphans,
    duplicates: duplicateNames,
    problems,
  };
}

/**
 * Build an edit plan that repairs a diagnosis.
 *
 * The plan is a list of per-file edit operations accepted by
 * `yamlpatch.applyEdits`, plus a human-readable change log.
 *
 * @param {{diagnosis: object, rows: object[], config: object, pruneOrphans?: boolean}} input - inputs.
 * @returns {{edits: Array<{file: string, edits: object[]}>, changes: object[], errors: string[]}}
 */
export function planRepair({ diagnosis, rows, config, pruneOrphans = false }) {
  const byFile = new Map();
  const changes = [];
  const errors = [];

  const editsFor = (file) => {
    if (!byFile.has(file)) byFile.set(file, []);
    return byFile.get(file);
  };

  const primaryFile = config.patchFiles[0].file;
  const rowsById = new Map(rows.map((row) => [row.id, row]));

  for (const workspace of diagnosis.workspaces) {
    if (workspace.hasIndex === false) continue;
    if (workspace.state === 'bound') continue;

    if (workspace.state === 'unbound') {
      if (workspace.serverName !== undefined) {
        errors.push(`${workspace.path}: 期望未绑定却已经带了 serverName`);
        continue;
      }
      const names = allocateNames(workspace, rows, config);
      const row = { id: names.id, serverName: names.serverName, command: config.aociBinary, repo: workspace.path };
      editsFor(primaryFile).push({ op: 'append', lines: renderAppendLines(row) });
      rows.push({ ...row, file: primaryFile, role: config.patchFiles[0].role });
      changes.push({ file: primaryFile, action: 'add', id: row.id, serverName: row.serverName, repo: workspace.path });
      continue;
    }

    if (workspace.state === 'duplicate_binding') {
      // Two or more active rows point at the same repository. Keep one (the one
      // whose id/serverName matches the canonical name when present), normalise
      // it, and remove the rest from their own files.
      const repoKey = normalizePath(workspace.path);
      const matching = rows.filter(
        (row) => row.role !== 'legacy' && normalizePath(row.repo ?? '') === repoKey,
      );
      if (matching.length < 2) {
        errors.push(`${workspace.path}: 判定为重复绑定，但只找到 ${matching.length} 条行`);
        continue;
      }
      const baseId = `${config.serverNamePrefix}-${slugOf(path.basename(workspace.path))}`;
      const keeper =
        matching.find((row) => row.id === baseId) ??
        matching.find((row) => row.serverName === baseId) ??
        matching[0];
      const extras = matching.filter((row) => row !== keeper);
      const others = rows.filter((row) => row !== keeper && !extras.includes(row));
      const names = allocateNames(workspace, others, config);
      const serverNameTaken = others.some((row) => row.serverName === keeper.serverName);
      const serverName = keeper.serverName && !serverNameTaken ? keeper.serverName : names.serverName;
      editsFor(keeper.file).push({
        op: 'replace',
        id: keeper.id,
        lines: renderAppendLines(
          { id: keeper.id, serverName, command: config.aociBinary, repo: workspace.path },
          keeper.indent ?? 4,
        ),
      });
      changes.push({ file: keeper.file, action: 'replace', id: keeper.id, serverName, repo: workspace.path });
      for (const extra of extras) {
        editsFor(extra.file).push({ op: 'remove', id: extra.id });
        changes.push({ file: extra.file, action: 'remove', id: extra.id, serverName: extra.serverName, repo: extra.repo });
      }
      continue;
    }

    if (workspace.state === 'wrong_repo' || workspace.state === 'name_conflict') {
      const row = rowsById.get(workspace.rowId);
      if (row === undefined) {
        errors.push(`${workspace.path}: 找不到要修复的行 ${workspace.rowId}`);
        continue;
      }
      const names = allocateNames(workspace, rows.filter((item) => item.id !== row.id), config);
      const serverName = workspace.state === 'name_conflict' ? names.serverName : (row.serverName ?? names.serverName);
      const repaired = { id: row.id, serverName, command: config.aociBinary, repo: workspace.path };
      editsFor(row.file).push({ op: 'replace', id: row.id, lines: renderAppendLines(repaired, row.indent ?? 4) });
      changes.push({ file: row.file, action: 'replace', id: row.id, serverName, repo: workspace.path });
      continue;
    }
  }

  if (pruneOrphans) {
    for (const orphan of diagnosis.orphans) {
      editsFor(orphan.file).push({ op: 'remove', id: orphan.id });
      changes.push({ file: orphan.file, action: 'remove', id: orphan.id, repo: orphan.repo });
    }
  }

  return {
    edits: [...byFile.entries()].map(([file, edits]) => ({ file, edits })),
    changes,
    errors,
  };
}

/** Render one row as append-position lines (4-space indent inside `- insert:`). */
export function renderAppendLines(row, indent = 4) {
  const pad = ' '.repeat(indent);
  const deep = ' '.repeat(indent + 2);
  const deeper = ' '.repeat(indent + 4);
  const quoted = (value) => `'${String(value).replaceAll("'", "''")}'`;
  return [
    `${pad}- id: ${row.id}`,
    `${deep}name: '@deepseek-ai/dsh-mcp-client'`,
    `${deep}config:`,
    `${deeper}serverName: ${quoted(row.serverName)}`,
    `${deeper}transport: stdio`,
    `${deeper}command: ${quoted(row.command)}`,
    `${deeper}args:`,
    `${deeper}  - '--repo'`,
    `${deeper}  - ${quoted(row.repo)}`,
    `${deeper}  - 'mcp'`,
  ];
}
