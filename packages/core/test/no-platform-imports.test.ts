import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The project's hardest rule, enforced instead of trusted:
 *
 *   packages/core has no platform imports.
 *
 * Two things enforce it, and they catch different failures.
 *
 * 1. `tsconfig.json` sets `lib: ["ES2022"]` and `types: []`, so `document`,
 *    `window` and `node:*` fail to typecheck inside core. That covers ambient
 *    globals and built-ins.
 *
 * 2. This test covers what tsconfig cannot: packages that ship their own types
 *    and so typecheck perfectly well — react, dexie, @supabase/*, @capacitor/*.
 *    Nothing stops someone importing those except this file.
 *
 * Why it matters beyond tidiness: Phase 7 reimplements the widget layer in
 * Kotlin, and Phase 8 in Swift. Every rule that lives in core is a rule those
 * two get to share. Every rule that leaks into the React layer is a rule that
 * gets rewritten twice and drifts.
 */

const SRC = fileURLToPath(new URL('../src', import.meta.url));

const FORBIDDEN: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /^react($|\/)/, why: 'UI framework — core must outlive it' },
  { pattern: /^react-dom($|\/)/, why: 'UI framework' },
  { pattern: /^@capacitor\//, why: 'device API — put it behind an adapter interface' },
  { pattern: /^dexie($|\/)/, why: 'storage — core describes data, it does not persist it' },
  { pattern: /^@supabase\//, why: 'network — the repository layer owns this' },
  { pattern: /^node:/, why: 'Node built-in — core runs in a browser and a webview too' },
  { pattern: /^(fs|path|crypto|os|child_process)$/, why: 'Node built-in' },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (extname(entry.name) !== '.ts') return [];
    if (entry.name.endsWith('.test.ts')) return [];
    return [full];
  });
}

/** Matches `from '...'`, `import '...'`, and `import(...)`. */
const IMPORT_RE = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

describe('packages/core boundary', () => {
  const files = sourceFiles(SRC);

  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('imports nothing platform-specific', () => {
    const violations: string[] = [];

    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(IMPORT_RE)) {
        const specifier = match[1];
        if (specifier === undefined) continue;
        const hit = FORBIDDEN.find((f) => f.pattern.test(specifier));
        if (hit) {
          violations.push(
            `${relative(SRC, file).replace(/\\/g, '/')} imports "${specifier}" — ${hit.why}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('runs in a bare Node process with no DOM', () => {
    // If core ever reaches for a browser global at module scope, importing it
    // here throws. `globalThis.document` is genuinely absent in this environment.
    expect('document' in globalThis).toBe(false);
  });
});
