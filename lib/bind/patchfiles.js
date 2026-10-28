/**
 * Reading and writing `cordis.patch.yml` files with backups.
 *
 * Two safety rules: a file that does not parse is never written, and every
 * write is preceded by a timestamped copy under the configured backup
 * directory. Writes are atomic (temp file + replace) so an interrupted write
 * cannot leave a half patch file behind.
 *
 * @module dsh-aoci-bind/patchfiles
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { applyEdits, parsePatch } from './yamlpatch.js';

/** Read one patch file and parse it. */
export async function readPatchFile(file, role) {
  let text;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch {
    return { file, role, exists: false, text: '', parsed: { ok: true, errors: [], rows: [], lines: [] } };
  }
  return { file, role, exists: true, text, parsed: parsePatch(text) };
}

/** Timestamped backup of one file; returns the backup path. */
export async function backupFile(file, backupDir) {
  await fs.mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('-', '').replace(/\..*/, '');
  const target = path.join(backupDir, `${path.basename(file)}.${stamp}.bak`);
  await fs.copyFile(file, target);
  return target;
}

/** Replace a file's content atomically. */
export async function writeAtomic(file, text) {
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temp, text, 'utf8');
  try {
    await fs.rename(temp, file);
  } catch {
    // Windows may refuse a rename over an existing file.
    await fs.copyFile(temp, file);
    await fs.unlink(temp).catch(() => {});
  }
}

/**
 * Execute an edit plan. Nothing is written unless every touched file parses
 * both before and after the edit.
 *
 * @param {{edits: Array<{file: string, edits: object[]}>, changes: object[], errors: string[]}} plan - plan.
 * @param {object} config - resolved config.
 * @param {{dryRun?: boolean}} [options] - dry-run switch.
 * @returns {Promise<{ok: boolean, dryRun: boolean, changes: object[], backups: object[], errors: string[], previews: object[]}>}
 */
export async function applyPlan(plan, config, options = {}) {
  const dryRun = options.dryRun === true;
  const backups = [];
  const previews = [];
  const errors = [...plan.errors];

  for (const entry of plan.edits) {
    const role = config.patchFiles.find((target) => target.file === entry.file)?.role ?? 'unknown';
    const file = await readPatchFile(entry.file, role);
    if (file.exists && !file.parsed.ok) {
      errors.push(`${entry.file} 不是合法 YAML，已拒绝写入：${file.parsed.errors.join('; ')}`);
      continue;
    }
    let next;
    try {
      next = applyEdits(file.text, entry.edits);
    } catch (error) {
      errors.push(`${entry.file}: ${error.message}`);
      continue;
    }
    const verify = parsePatch(next);
    if (!verify.ok) {
      errors.push(`${entry.file}: 编辑后校验失败，已放弃写入：${verify.errors.join('; ')}`);
      continue;
    }
    previews.push({ file: entry.file, beforeBytes: Buffer.byteLength(file.text), afterBytes: Buffer.byteLength(next) });
    if (dryRun) continue;
    try {
      if (file.exists) backups.push({ file: entry.file, backup: await backupFile(entry.file, config.backupDir) });
      await fs.mkdir(path.dirname(entry.file), { recursive: true });
      await writeAtomic(entry.file, next);
    } catch (error) {
      errors.push(`${entry.file}: 写入失败：${error.message}`);
    }
  }

  return { ok: errors.length === 0, dryRun, changes: plan.changes, backups, errors, previews };
}
