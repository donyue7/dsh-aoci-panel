/**
 * The bootstrap prompt returned by `aoci_project_init`.
 *
 * It is deliberately a *prompt*, not a tool call: a Host-side registration only
 * takes effect after a restart, so the caller needs something to paste into the
 * Session that will actually use the tools — including the two facts a fresh
 * Session cannot infer (the tool prefix and the root self-check).
 *
 * @module dsh-aoci-bind/prompt
 */

/**
 * Render the bootstrap prompt for one freshly bound workspace.
 *
 * @param {{title: string, path: string, serverName: string, project?: string|null}} input - binding facts.
 * @returns {string} the prompt text.
 */
export function bootstrapPrompt({ title, path, serverName, project }) {
  const prefix = `mcp__${serverName}__`;
  const projectLine = project ? `索引里的 #Project 是 ${project}（目录名 ${title}）。` : '';
  return [
    `这个工作区（${title}）已经接入 AOCI：MCP serverName = ${serverName}，工具前缀 ${prefix}。`,
    projectLine,
    '',
    '请按以下顺序自检，再开始用索引：',
    `1. 调 ${prefix}aoci_header，确认返回的 Root/Meta 身份属于本仓库；`,
    `2. 调 ${prefix}aoci_status 或 ${prefix}aoci_overview（若存在），确认 runtime_repository_root == ${path}；`,
    '3. 如果 runtime root 不是本仓库，说明绑定指错目录：不要继续用该工具，先调用 aoci_bind_status 诊断、aoci_bind_repair 修复；',
    '4. 只有确认 root 一致后，才把该索引当成本仓库的认知来源使用。',
    '',
    `工具名清单：${prefix}aoci_overview / aoci_header / aoci_maintain / aoci_search / aoci_get_entries / aoci_update_entry / aoci_remove_entry / aoci_report / aoci_rules`,
    '注意：Host 侧新增的 MCP 行需要重启 DSH 才会出现在会话工具表里（本插件不会自行重启）。',
  ]
    .filter((line) => line !== undefined)
    .join('\n');
}
