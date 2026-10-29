import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * PostgreSQL rejects a prepared statement when a bound parameter is never referenced
 * ("could not determine data type of parameter $N"). This broke Employee Profile save on
 * 29 Oct 2026 (salary_structures UPDATE passed $8 but never used it). This guard fails the
 * build if any backend SQL literal skips a parameter number.
 */
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });

describe('SQL parameter integrity', () => {
  it('every backend SQL statement references a contiguous set of parameters $1..$N', () => {
    const problems: string[] = [];
    for (const file of walk(join(__dirname, '..', 'src'))) {
      const src = readFileSync(file, 'utf-8');
      for (const m of src.matchAll(/`([^`]*)`/g)) {
        const sql = m[1];
        if (!/\b(SELECT|UPDATE|INSERT|DELETE)\b/.test(sql)) continue;
        const used = new Set([...sql.matchAll(/\$(\d+)/g)].map((x) => Number(x[1])));
        if (used.size === 0) continue;
        const max = Math.max(...used);
        const missing = Array.from({ length: max }, (_, i) => i + 1).filter((i) => !used.has(i));
        if (missing.length) {
          const line = src.slice(0, m.index).split('\n').length;
          problems.push(`${file}:${line} missing ${missing.map((n) => `$${n}`).join(', ')}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

