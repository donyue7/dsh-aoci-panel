/**
 * Subprocess seam for the AOCI CLI.
 *
 * The plugin never guesses: it runs the configured binary and reports what it
 * said. Every call is bounded, and a missing binary or a non-zero exit is a
 * normal result rather than a thrown error, because the doctor tool must be
 * able to report exactly that.
 *
 * @module dsh-aoci-bind/aoci
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Run the AOCI CLI once.
 *
 * @param {{binary: string, args: string[], cwd?: string, timeoutMs?: number}} request - invocation.
 * @returns {Promise<{ok: boolean, code: number|null, stdout: string, stderr: string, timedOut: boolean, error?: string}>}
 */
export function runAoci({ binary, args, cwd, timeoutMs = 20000 }) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(binary, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ ok: false, code: null, stdout: '', stderr: '', timedOut: false, error: String(error?.message ?? error) });
      return;
    }
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    }, timeoutMs);
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ ok: false, code: null, stdout, stderr, timedOut, error: String(error?.message ?? error) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0 && !timedOut, code, stdout, stderr, timedOut });
    });
  });
}

/** Parse `aoci version …` output. */
export function parseVersion(text) {
  const match = /version\s+(\S+)/i.exec(String(text ?? ''));
  return match ? match[1] : undefined;
}

/** Probe `<binary> --version`. */
export async function probeVersion(binary, timeoutMs = 20000) {
  const result = await runAoci({ binary, args: ['--version'], timeoutMs });
  const version = parseVersion(`${result.stdout}\n${result.stderr}`);
  return { ok: result.ok && version !== undefined, version, raw: `${result.stdout}${result.stderr}`.trim(), error: result.error };
}

/** Whether a repository already carries the formal index. */
export async function hasIndex(repo) {
  try {
    await fs.access(path.join(repo, 'aoci.txt'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Make a repository AOCI-ready: `init` when the skeleton is missing, then
 * `scan` to establish the Baseline fingerprints.
 *
 * @param {{binary: string, repo: string, timeoutMs?: number, scan?: boolean}} request - request.
 * @returns {Promise<{ok: boolean, created: boolean, scanned: boolean, steps: object[], error?: string}>}
 */
export async function ensureIndex({ binary, repo, timeoutMs = 180000, scan = true }) {
  const steps = [];
  let created = false;
  if (!(await hasIndex(repo))) {
    const init = await runAoci({ binary, args: ['--repo', repo, 'init'], timeoutMs });
    steps.push({ step: 'init', ok: init.ok, code: init.code, detail: tail(init) });
    if (!init.ok) return { ok: false, created, scanned: false, steps, error: init.error ?? tail(init) ?? 'aoci init failed' };
    created = true;
  }
  let scanned = false;
  if (scan) {
    const result = await runAoci({ binary, args: ['--repo', repo, 'scan'], timeoutMs });
    steps.push({ step: 'scan', ok: result.ok, code: result.code, detail: tail(result) });
    scanned = result.ok;
    if (!result.ok) return { ok: false, created, scanned, steps, error: result.error ?? tail(result) ?? 'aoci scan failed' };
  }
  return { ok: true, created, scanned, steps };
}

/** Compact tail of a subprocess result for reporting. */
export function tail(result, limit = 400) {
  const text = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (text === '') return undefined;
  return text.length <= limit ? text : `…${text.slice(-limit)}`;
}
