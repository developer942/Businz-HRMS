import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * PostgreSQL rejects a prepared statement when:
 * 1. A bound parameter is never referenced ("could not determine data type of parameter $N").
 * 2. The same parameter number has conflicting type deduction or mixed explicit/implicit casts
 *    ("inconsistent types deduced for parameter $N").
 *
 * This guard fails the build if any backend SQL literal violates these invariants.
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

  it('no backend SQL statement has mixed or conflicting type casts for the same parameter', () => {
    const problems: string[] = [];
    for (const file of walk(join(__dirname, '..', 'src'))) {
      const src = readFileSync(file, 'utf-8');
      for (const m of src.matchAll(/`([^`]*)`/g)) {
        const sql = m[1];
        if (!/\b(SELECT|UPDATE|INSERT|DELETE)\b/.test(sql)) continue;

        // Extract occurrences of $N and $N::cast
        const tokens = [...sql.matchAll(/\$(\d+)(?:::([a-zA-Z0-9_]+))?/g)];
        const byNum: Record<string, Set<string>> = {};
        for (const t of tokens) {
          const num = t[1];
          const cast = t[2] || '<none>';
          if (!byNum[num]) byNum[num] = new Set();
          byNum[num].add(cast);
        }

        for (const [num, casts] of Object.entries(byNum)) {
          // If a parameter is used more than once, it must not mix <none> with explicit cast,
          // nor have two mutually incompatible casts
          if (casts.size > 1) {
            const line = src.slice(0, m.index).split('\n').length;
            problems.push(`${file}:${line} param $${num} has mixed type casts: [${[...casts].join(', ')}]`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
