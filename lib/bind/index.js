/**
 * dsh-aoci-bind — Host-side AOCI integration for DSH.
 *
 * Every workspace that carries an AOCI index needs one MCP row in the Cordis
 * patch files, and every one of those rows is hand-written today: a workspace
 * silently ends up with an index but no tools, a row can point at the wrong
 * repository, and two rows can collide on the same `serverName`. This plugin
 * discovers the workspaces, diagnoses the bindings, and applies the minimal
 * edits that fix them, behind timestamped backups and a YAML validity gate.
 *
 * The plugin imports nothing but `node:*` and its own files: a profile plugin
 * is loaded by plain Node resolution, so bare `@deepseek-ai/...` specifiers
 * would not resolve from its directory (see `toolkit.js`).
 *
 * @module dsh-aoci-bind
 */

import { DEFAULT_CONFIG, normalizeConfig } from './config.js';
import { registerTools } from './tools.js';

/** Cordis plugin name. */
export const name = 'aoci-bind';

/** Services required before the plugin can contribute tools. */
export const inject = ['tools'];

/** Short system-prompt section; off by default, opt in with `promptSection: true`. */
const PROMPT_SECTION = [
  'AOCI 绑定：本 Host 可能同时挂载多个 AOCI MCP 服务器（每个仓库一个 serverName）。',
  '调用任何 AOCI 工具前，先确认工具前缀 mcp__<serverName>__ 对应的仓库就是你当前的工作区；',
  '根不一致（runtime_repository_root 不是当前仓库）时不要使用该索引，改用 aoci_bind_status 诊断。',
].join('\n');

/**
 * Mount the plugin.
 *
 * @param {object} ctx - plugin context.
 * @param {object} [config] - plugin configuration from the profile patch.
 * @returns {void}
 */
export function apply(ctx, config) {
  let settings;
  try {
    settings = normalizeConfig(config ?? {});
  } catch (error) {
    warn(ctx, `aoci-bind configuration rejected: ${error?.message ?? error}`);
    return;
  }
  if (!settings.enabled) {
    info(ctx, 'aoci-bind is disabled by configuration');
    return;
  }
  try {
    if (settings.tools) registerTools(ctx, settings);
  } catch (error) {
    warn(ctx, `aoci-bind failed to register tools: ${error?.message ?? error}`);
    return;
  }
  if (settings.promptSection) {
    try {
      ctx.inject(['systemPrompt'], (scoped) => {
        scoped.systemPrompt.section({
          name: 'aoci-bind',
          order: 60,
          interpolate: false,
          text: PROMPT_SECTION,
        });
      });
    } catch (error) {
      warn(ctx, `aoci-bind failed to add its prompt section: ${error?.message ?? error}`);
    }
  }
  info(
    ctx,
    `aoci-bind ready (home=${settings.home}, patchFiles=${settings.patchFiles.map((entry) => entry.role).join('+')}, legacy=${settings.legacyHome})`,
  );
}

/** The configuration an operator can set, exported for documentation and tests. */
export { DEFAULT_CONFIG };

/** Log one informational line without depending on a logger shape. */
function info(ctx, message) {
  if (typeof ctx.logger?.info === 'function') ctx.logger.info(message);
}

/** Log one warning line without depending on a logger shape. */
function warn(ctx, message) {
  if (typeof ctx.logger?.warn === 'function') ctx.logger.warn(message);
  else if (typeof ctx.logger?.info === 'function') ctx.logger.info(message);
}
