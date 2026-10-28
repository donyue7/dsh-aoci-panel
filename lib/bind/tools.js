/**
 * Model-facing tools of dsh-aoci-bind.
 *
 * Four tools, each with a bounded JSON result and a readable summary:
 *   - `aoci_bind_status`  diagnose every workspace binding
 *   - `aoci_bind_repair`  apply the minimal edits that fix the diagnosis
 *   - `aoci_project_init` initialise an unindexed repository and bind it
 *   - `aoci_doctor`       environment-level checks with severities
 *
 * @module dsh-aoci-bind/tools
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureIndex, hasIndex, probeVersion } from './aoci.js';
import { normalizePath } from './discovery.js';
import { applyPlan } from './patchfiles.js';
import { planRepair } from './binding.js';
import { bootstrapPrompt } from './prompt.js';
import { buildSnapshot, matchesSelector } from './state.js';
import { defineTool } from './toolkit.js';

/** Hard cap on workspace rows in one status page. */
const MAX_WORKSPACE_ROWS = 40;

/** Severity ordering used by doctor. */
const SEVERITY_RANK = { error: 0, warn: 1, ok: 2 };

/** Render a compact status table. */
function renderStatus(value) {
  const lines = [`AOCI 绑定：${value.summary.workspaces} 个工作区 · 已绑定 ${value.summary.bound} · 问题 ${value.summary.problems}`];
  for (const workspace of value.workspaces) {
    const mark = workspace.state === 'bound' ? 'OK  ' : workspace.state === 'no_index' ? '--  ' : 'FAIL';
    lines.push(`${mark} ${workspace.title}  [${workspace.state}]  ${workspace.serverName ?? '(未绑定)'}`);
    if (workspace.state !== 'bound') lines.push(`     ${workspace.detail}${workspace.fix ? ` → ${workspace.fix}` : ''}`);
  }
  if (value.orphans.length > 0) {
    lines.push(`孤儿行：${value.orphans.map((row) => row.id).join(', ')}`);
  }
  for (const file of value.patchFiles) {
    lines.push(`补丁文件 ${file.role}: ${file.file} (${file.exists ? `${file.rows} 行` : '不存在'})${file.valid ? '' : '  ⚠ 不是合法 YAML'}`);
  }
  return [{ type: 'text', text: lines.join('\n') }];
}

/** Render the change log of a repair run. */
function renderRepair(value) {
  const header = value.dryRun ? `预演（未写入）：${value.changes.length} 处改动` : `已修复：${value.changes.length} 处改动`;
  const lines = [header];
  for (const change of value.changes) lines.push(`  ${change.action} ${change.id} → serverName=${change.serverName ?? '(保持)'} repo=${change.repo ?? ''}`);
  for (const backup of value.backups) lines.push(`  备份：${backup.backup}`);
  for (const error of value.errors) lines.push(`  错误：${error}`);
  if (value.changes.length === 0 && value.errors.length === 0) lines.push('  无需改动，绑定已经一致。');
  return [{ type: 'text', text: lines.join('\n') }];
}

/** Render one project init result. */
function renderInit(value) {
  const lines = [
    value.ok ? `已接入：${value.title}（${value.path}）` : `接入失败：${value.error ?? '未知错误'}`,
    `  初始化索引：${value.createdIndex ? '新建' : '已存在'} · 扫描基线：${value.scanned ? '是' : '否'}`,
    value.serverName ? `  serverName：${value.serverName}（工具前缀 mcp__${value.serverName}__）` : '  serverName：(未注册)',
  ];
  for (const step of value.steps ?? []) lines.push(`  ${step.step}: ${step.ok ? 'OK' : 'FAIL'}${step.detail ? ` — ${step.detail}` : ''}`);
  if (value.bootstrapPrompt) {
    lines.push('', '把下面这段交给要使用该索引的会话：', '---', value.bootstrapPrompt, '---');
  }
  return [{ type: 'text', text: lines.join('\n') }];
}

/** Render doctor checks. */
function renderDoctor(value) {
  const lines = [value.ok ? '环境检查：全部通过' : '环境检查：存在问题'];
  for (const check of value.checks) {
    lines.push(`${check.severity === 'ok' ? 'OK  ' : check.severity === 'warn' ? 'WARN' : 'FAIL'} ${check.name}: ${check.detail}${check.fix ? ` → ${check.fix}` : ''}`);
  }
  return [{ type: 'text', text: lines.join('\n') }];
}

/** Shared patch-file summary shape. */
const PATCH_FILE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    role: { type: 'string', description: 'home | profile | legacy' },
    file: { type: 'string' },
    exists: { type: 'boolean' },
    rows: { type: 'integer', description: 'AOCI MCP rows found in this file.' },
    valid: { type: 'boolean', description: 'False when the file is not a valid YAML patch.' },
  },
  required: ['role', 'file', 'exists', 'rows', 'valid'],
};

/**
 * Register the four tools.
 *
 * @param {object} ctx - plugin context carrying `tools`.
 * @param {object} config - resolved config.
 * @returns {void}
 */
export function registerTools(ctx, config) {
  ctx.tools.register(
    defineTool({
      name: 'aoci_bind_status',
      description:
        'Diagnose AOCI bindings for this DSH instance: for every known workspace report whether its index is exposed as an MCP server, bound to the wrong repository, colliding on a serverName, or not indexed yet. Read-only. Returns each workspace state plus the exact fix; use aoci_bind_repair to apply it.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          workspace: {
            type: 'string',
            description: 'Optional filter: full path or a case-insensitive substring of a workspace path or title.',
          },
          include_orphans: {
            type: 'boolean',
            description: 'Include AOCI rows whose --repo is not a known workspace. Defaults to true.',
          },
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'True when every indexed workspace is correctly bound.' },
            home: { type: 'string' },
            summary: {
              type: 'object',
              additionalProperties: false,
              properties: {
                workspaces: { type: 'integer' },
                bound: { type: 'integer' },
                problems: { type: 'integer' },
                orphans: { type: 'integer' },
                patchFiles: { type: 'integer' },
              },
              required: ['workspaces', 'bound', 'problems'],
            },
            patchFiles: { type: 'array', items: PATCH_FILE_SCHEMA },
            workspaces: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  title: { type: 'string' },
                  path: { type: 'string' },
                  state: { type: 'string', description: 'bound | unbound | wrong_repo | name_conflict | duplicate_binding | no_index' },
                  hasIndex: { type: 'boolean' },
                  serverName: { type: 'string' },
                  rowId: { type: 'string' },
                  toolPrefix: { type: 'string', description: 'MCP tool prefix a Session would see, e.g. mcp__aoci-gys__' },
                  legacyShadow: { type: 'boolean', description: 'A row for this repository exists only in the legacy ~/.dsh patch, which the Host does not read.' },
                  detail: { type: 'string' },
                  fix: { type: 'string' },
                },
                required: ['title', 'path', 'state', 'hasIndex'],
              },
            },
            orphans: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string' },
                  serverName: { type: 'string' },
                  repo: { type: 'string' },
                  file: { type: 'string' },
                  reason: { type: 'string' },
                },
                required: ['id'],
              },
            },
          },
          required: ['ok', 'summary', 'workspaces'],
        },
        render: (_args, value) => renderStatus(value),
      },
      async execute(args) {
        const snapshot = await buildSnapshot(config);
        const workspaces = snapshot.diagnosis.workspaces.filter((workspace) => matchesSelector(workspace, args.workspace));
        const includeOrphans = args.include_orphans !== false;
        const orphans = includeOrphans ? snapshot.diagnosis.orphans : [];
        return {
          ok: snapshot.diagnosis.ok,
          home: config.home,
          summary: {
            workspaces: workspaces.length,
            bound: workspaces.filter((workspace) => workspace.state === 'bound').length,
            problems: workspaces.filter((workspace) => workspace.state !== 'bound').length + orphans.length,
            orphans: orphans.length,
            patchFiles: snapshot.files.length,
          },
          patchFiles: snapshot.files.map((file) => ({
            role: file.role,
            file: file.file,
            exists: file.exists,
            rows: file.parsed.rows.filter((row) => row.serverName !== undefined).length,
            valid: file.parsed.ok,
          })),
          workspaces: workspaces.slice(0, MAX_WORKSPACE_ROWS),
          orphans: orphans.map((orphan) => ({
            id: orphan.id,
            serverName: orphan.serverName,
            repo: orphan.repo,
            file: orphan.file,
            reason: orphan.detail,
          })),
        };
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: 'aoci_bind_repair',
      description:
        'Repair AOCI bindings: add a row for a workspace that has an index but no MCP server, point a row at the right repository, rename a colliding serverName, optionally remove orphan rows. Idempotent — a second run with the same inputs changes nothing. Writes to cordis.patch.yml files after a timestamped backup, and refuses to write a file that is not valid YAML. Host-side rows need a DSH restart to appear as tools.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          workspace: {
            type: 'string',
            description: 'Optional filter: repair only workspaces matching this path substring. Omit to repair every problem.',
          },
          dry_run: {
            type: 'boolean',
            description: 'Report the planned edits without writing anything. Defaults to false.',
          },
          prune_orphans: {
            type: 'boolean',
            description: 'Also remove AOCI rows whose --repo is not a known workspace. Defaults to false because it is destructive.',
          },
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean' },
            dryRun: { type: 'boolean' },
            changes: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  file: { type: 'string' },
                  action: { type: 'string', description: 'add | replace | remove' },
                  id: { type: 'string' },
                  serverName: { type: 'string' },
                  repo: { type: 'string' },
                },
                required: ['file', 'action', 'id'],
              },
            },
            backups: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: { file: { type: 'string' }, backup: { type: 'string' } },
                required: ['file', 'backup'],
              },
            },
            errors: { type: 'array', items: { type: 'string' } },
            summary: { type: 'string' },
          },
          required: ['ok', 'dryRun', 'changes', 'errors', 'summary'],
        },
        render: (_args, value) => renderRepair(value),
      },
      async execute(args) {
        const snapshot = await buildSnapshot(config);
        const selector = typeof args.workspace === 'string' && args.workspace.trim() !== '' ? args.workspace.trim() : undefined;
        const onlyPath = selector === undefined ? undefined : resolveWorkspacePath(snapshot, selector);
        const filtered = {
          ...snapshot.diagnosis,
          workspaces:
            onlyPath === undefined
              ? snapshot.diagnosis.workspaces
              : snapshot.diagnosis.workspaces.filter((workspace) => normalizePath(workspace.path) === onlyPath),
          orphans: args.prune_orphans === true ? snapshot.diagnosis.orphans : [],
        };
        const plan = planRepair({
          diagnosis: filtered,
          rows: snapshot.rows,
          config,
          pruneOrphans: args.prune_orphans === true,
        });
        const applied = await applyPlan(plan, config, { dryRun: args.dry_run === true });
        return {
          ok: applied.ok,
          dryRun: applied.dryRun,
          changes: applied.changes,
          backups: applied.backups,
          errors: applied.errors,
          summary: summarize(applied),
        };
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: 'aoci_project_init',
      description:
        'Make one repository AOCI-ready and bound: initialise the index skeleton and Baseline when missing, register the MCP row, and return a bootstrap prompt that names the tool prefix and the root self-check. Use this for a repository that has source but no aoci.txt. Requires the AOCI CLI to be reachable; reports the CLI output when it is not.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          workspace: {
            type: 'string',
            description: 'Repository to initialise: a workspace path, a path substring, or a title. Required.',
          },
          server_name: {
            type: 'string',
            description: 'Explicit serverName to register. Defaults to the configured prefix plus a slug of the directory name.',
          },
          scan: {
            type: 'boolean',
            description: 'Run a Baseline scan after init when the index is created. Defaults to true.',
          },
        },
        required: ['workspace'],
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean' },
            path: { type: 'string' },
            title: { type: 'string' },
            createdIndex: { type: 'boolean' },
            scanned: { type: 'boolean' },
            serverName: { type: 'string' },
            rowId: { type: 'string' },
            bootstrapPrompt: { type: 'string' },
            steps: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: { step: { type: 'string' }, ok: { type: 'boolean' }, detail: { type: 'string' } },
                required: ['step', 'ok'],
              },
            },
            error: { type: 'string' },
          },
          required: ['ok', 'steps'],
        },
        render: (_args, value) => renderInit(value),
      },
      async execute(args) {
        const snapshot = await buildSnapshot(config);
        const selected =
          snapshot.discovery.workspaces.find((workspace) => normalizePath(workspace.path) === normalizePath(args.workspace)) ??
          snapshot.discovery.workspaces.find((workspace) => matchesSelector(workspace, args.workspace));
        const repo = selected?.path ?? path.resolve(args.workspace);
        const title = selected?.title ?? path.basename(repo);

        const steps = [];
        const version = await probeVersion(config.aociBinary, config.probeTimeoutMs);
        steps.push({ step: 'aoci-version', ok: version.ok, detail: version.ok ? version.version : version.error ?? version.raw });
        if (!version.ok) {
          return { ok: false, path: repo, title, steps, error: `AOCI CLI 不可用：${config.aociBinary}` };
        }
        if (!(await existsDir(repo))) {
          return { ok: false, path: repo, title, steps, error: `目录不存在：${repo}` };
        }

        const ensured = await ensureIndex({ binary: config.aociBinary, repo, timeoutMs: config.initTimeoutMs, scan: args.scan !== false });
        steps.push(...ensured.steps);
        if (!ensured.ok) {
          return { ok: false, path: repo, title, createdIndex: ensured.created, scanned: ensured.scanned, steps, error: ensured.error };
        }

        const after = await buildSnapshot(config);
        const state = after.diagnosis.workspaces.find((workspace) => normalizePath(workspace.path) === normalizePath(repo));
        const repaired = await applyPlan(
          planRepair({
            diagnosis: {
              ...after.diagnosis,
              workspaces: after.diagnosis.workspaces.filter((workspace) => normalizePath(workspace.path) === normalizePath(repo)),
              orphans: [],
            },
            rows: after.rows,
            config,
          }),
          config,
          {},
        );
        steps.push({ step: 'register-binding', ok: repaired.ok, detail: repaired.errors.join('; ') || repaired.changes.map((change) => `${change.action}:${change.id}`).join(', ') });
        const change = repaired.changes[0];
        const serverName = change?.serverName ?? state?.serverName ?? args.server_name;
        return {
          ok: repaired.ok,
          path: repo,
          title,
          createdIndex: ensured.created,
          scanned: ensured.scanned,
          serverName,
          rowId: change?.id ?? state?.rowId,
          bootstrapPrompt: serverName
            ? bootstrapPrompt({ title, path: repo, serverName, project: selected?.project ?? null })
            : undefined,
          steps,
          error: repaired.ok ? undefined : repaired.errors.join('; '),
        };
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: 'aoci_doctor',
      description:
        'Environment checks for AOCI integration: CLI reachability and version, patch files readable and valid, duplicate serverNames, indexed workspaces with no binding, rows pointing at unknown repositories, and the workspace registry itself. Each check carries a severity and a fix; no writes.',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean' },
            checks: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string' },
                  severity: { type: 'string', description: 'ok | warn | error' },
                  detail: { type: 'string' },
                  fix: { type: 'string' },
                },
                required: ['name', 'severity', 'detail'],
              },
            },
            summary: { type: 'string' },
          },
          required: ['ok', 'checks', 'summary'],
        },
        render: (_args, value) => renderDoctor(value),
      },
      async execute() {
        const checks = [];
        const version = await probeVersion(config.aociBinary, config.probeTimeoutMs);
        checks.push({
          name: 'aoci-cli',
          severity: version.ok ? 'ok' : 'error',
          detail: version.ok ? `${config.aociBinary} (${version.version})` : `${config.aociBinary} 不可用：${version.error ?? version.raw}`,
          fix: version.ok ? undefined : '把配置项 aociBinary 指向可执行文件',
        });

        const snapshot = await buildSnapshot(config);
        checks.push({
          name: 'workspace-registry',
          severity: snapshot.discovery.registryError ? 'error' : 'ok',
          detail: snapshot.discovery.registryError ?? `${snapshot.discovery.workspaces.length} 个工作区`,
          fix: snapshot.discovery.registryError ? '检查 storages/workspace.json' : undefined,
        });

        for (const file of snapshot.files) {
          checks.push({
            name: `patch-${file.role}`,
            severity: file.exists ? (file.parsed.ok ? 'ok' : 'error') : 'warn',
            detail: file.exists
              ? file.parsed.ok
                ? `${file.file}（${file.parsed.rows.length} 行）`
                : `${file.file} 不是合法 YAML：${file.parsed.errors.join('; ')}`
              : `${file.file} 不存在`,
            fix: file.parsed.ok ? undefined : '先修好该 YAML，或让 repair 新建一份',
          });
        }

        const unbound = snapshot.diagnosis.workspaces.filter((workspace) => workspace.state === 'unbound');
        checks.push({
          name: 'unbound-indexes',
          severity: unbound.length === 0 ? 'ok' : 'error',
          detail: unbound.length === 0 ? '所有已建索引都已绑定' : `${unbound.length} 个：${unbound.map((workspace) => workspace.title).join(', ')}`,
          fix: unbound.length === 0 ? undefined : '调用 aoci_bind_repair',
        });

        const indexless = snapshot.diagnosis.workspaces.filter((workspace) => workspace.state === 'no_index');
        checks.push({
          name: 'workspaces-without-index',
          severity: 'ok',
          detail: indexless.length === 0 ? '所有工作区都有索引' : `${indexless.length} 个未建索引（可选接入）：${indexless.map((workspace) => workspace.title).join(', ')}`,
          fix: indexless.length === 0 ? undefined : '需要接入时调用 aoci_project_init',
        });

        const duplicates = snapshot.diagnosis.duplicates;
        checks.push({
          name: 'server-name-uniqueness',
          severity: duplicates.length === 0 ? 'ok' : 'error',
          detail: duplicates.length === 0 ? 'serverName 唯一' : duplicates.map((item) => `${item.serverName}×${item.count}`).join(', '),
          fix: duplicates.length === 0 ? undefined : '调用 aoci_bind_repair 改名',
        });

        const orphans = snapshot.diagnosis.orphans;
        checks.push({
          name: 'orphan-rows',
          severity: orphans.length === 0 ? 'ok' : 'warn',
          detail: orphans.length === 0 ? '没有孤立的 --repo' : orphans.map((row) => `${row.id}→${row.repo ?? '(缺失)'}`).join(', '),
          fix: orphans.length === 0 ? undefined : '确认后 aoci_bind_repair 的 prune_orphans',
        });

        const legacyOnly = snapshot.diagnosis.workspaces.filter((workspace) => workspace.legacyShadow && workspace.state !== 'bound');
        checks.push({
          name: 'legacy-shadow',
          severity: legacyOnly.length === 0 ? 'ok' : 'warn',
          detail:
            legacyOnly.length === 0
              ? '没有只存在于旧 home 的绑定'
              : `${legacyOnly.length} 个工作区只在 ~/.dsh 里有行（DSH 不读旧 home）：${legacyOnly.map((workspace) => workspace.title).join(', ')}`,
          fix: legacyOnly.length === 0 ? undefined : 'aoci_bind_repair 会在当前 home 补一条生效的行',
        });

        checks.sort((left, right) => SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity]);
        const failed = checks.filter((check) => check.severity === 'error').length;
        const warned = checks.filter((check) => check.severity === 'warn').length;
        return {
          ok: failed === 0,
          checks,
          summary: `${checks.length} 项检查：error ${failed} · warn ${warned} · ok ${checks.length - failed - warned}`,
        };
      },
    }),
  );
}

/** Resolve a selector to a normalised workspace path, or undefined. */
function resolveWorkspacePath(snapshot, selector) {
  const direct = snapshot.discovery.workspaces.find((workspace) => normalizePath(workspace.path) === normalizePath(selector));
  if (direct !== undefined) return normalizePath(direct.path);
  const fuzzy = snapshot.discovery.workspaces.find((workspace) => matchesSelector(workspace, selector));
  return fuzzy === undefined ? undefined : normalizePath(fuzzy.path);
}

/** Human summary of one repair application. */
function summarize(applied) {
  if (applied.errors.length > 0) return `失败：${applied.errors.length} 个错误`;
  if (applied.changes.length === 0) return '无需改动';
  return `${applied.dryRun ? '预演出' : '应用了'} ${applied.changes.length} 处改动，备份 ${applied.backups.length} 个文件`;
}

/** Whether a directory exists. */
async function existsDir(target) {
  try {
    return (await fs.stat(target)).isDirectory();
  } catch {
    return false;
  }
}

/** Re-exported for tests. */
export { hasIndex };
