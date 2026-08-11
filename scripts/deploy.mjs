#!/usr/bin/env node
/**
 * Builds and publishes the PWA to GitHub Pages.
 *
 *     pnpm deploy
 *
 * Pushes the built output to a `gh-pages` branch rather than running a GitHub
 * Actions workflow, because the current `gh` token has no `workflow` scope and
 * asking for one is a browser round-trip the owner does not need to make. If a
 * workflow is ever wanted, `gh auth refresh -s workflow` first.
 *
 * The build is committed to an orphan branch each time — no history, because the
 * history of a build directory is noise, and a shallow force-push keeps the repo
 * from growing a megabyte of bundles per deploy.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const REPO = process.env.PAGES_REPO ?? 'twoends';
const BASE = `/${REPO}/`;

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: ROOT,
    ...opts,
  });

const capture = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    cwd: ROOT,
    ...opts,
  }).trim();

console.log(`\nBuilding with base ${BASE}\n`);
run('pnpm', ['--filter', '@twoends/web', 'build'], { env: { ...process.env, VITE_BASE: BASE } });

const dist = join(ROOT, 'apps', 'web', 'dist');
const staging = mkdtempSync(join(tmpdir(), 'twoends-pages-'));

try {
  cpSync(dist, staging, { recursive: true });

  /*
    GitHub Pages runs everything through Jekyll unless told not to, and Jekyll
    ignores files and folders beginning with an underscore — which is exactly
    what a bundler emits. One empty file avoids a very confusing 404.
  */
  writeFileSync(join(staging, '.nojekyll'), '');

  // The app renders by status rather than by route, but an invite link carries
  // `?invite=` on the root path, and a refresh on any deep path should still
  // land somewhere sane rather than on a Pages 404.
  cpSync(join(staging, 'index.html'), join(staging, '404.html'));

  const remote = capture('git', ['remote', 'get-url', 'origin']);

  run('git', ['init', '-q'], { cwd: staging });
  run('git', ['checkout', '-q', '-b', 'gh-pages'], { cwd: staging });
  run('git', ['add', '-A'], { cwd: staging });
  run(
    'git',
    ['-c', 'user.name=deploy', '-c', 'user.email=deploy@local', 'commit', '-q', '-m', 'Deploy'],
    { cwd: staging },
  );
  run('git', ['push', '-q', '--force', remote, 'gh-pages'], { cwd: staging });

  const owner = /github\.com[/:]([^/]+)\//.exec(remote)?.[1] ?? '<owner>';
  console.log(`\nDeployed. https://${owner}.github.io/${REPO}/\n`);
  console.log('First deploy only: Settings → Pages → Source = gh-pages branch, / (root).\n');
} finally {
  rmSync(staging, { recursive: true, force: true });
}
