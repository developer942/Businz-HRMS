import {
  inspectPasswordMigrationState,
  executePasswordMigration,
  rollbackPasswordMigration,
} from '../src/services/passwordMigrationService.js';
import { closeDatabase } from '../src/config/database.js';

async function main() {
  const args = new Set(process.argv.slice(2));
  const mode = args.has('--rollback')
    ? 'rollback'
    : args.has('--execute')
    ? 'execute'
    : 'inspect';

  try {
    if (mode === 'inspect') {
      const report = await inspectPasswordMigrationState();
      console.log(JSON.stringify({ mode: 'inspect', ...report }, null, 2));
    } else if (mode === 'execute') {
      const report = await executePasswordMigration({ dryRun: false });
      console.log(JSON.stringify({ mode: 'execute', ...report }, null, 2));
    } else if (mode === 'rollback') {
      const report = await rollbackPasswordMigration();
      console.log(JSON.stringify({ mode: 'rollback', ...report }, null, 2));
    }
  } finally {
    await closeDatabase();
  }
}

main().catch((err) => {
  console.error('[PasswordMigration] Fatal error:', err instanceof Error ? err.message : 'Unknown error');
  process.exit(1);
});

