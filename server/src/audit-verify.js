// Checks the whole audit ledger from the terminal: every block's link, fingerprint and seal.
//
// Usage: npm run audit-verify
import mongoose from 'mongoose';
import { connectDb } from './db.js';
import { verifyLedger } from './services/audit.js';

await connectDb();
const result = await verifyLedger();
if (result.total === 0) {
  console.log('The audit ledger is empty. It starts with the first login or sign-up.');
} else if (result.ok) {
  console.log(`Audit ledger intact: all ${result.checked} blocks verified in ${result.ms} ms.`);
  console.log(`Latest block #${result.head.index} at ${new Date(result.head.at).toISOString()}`);
  console.log(`Fingerprint ${result.head.hash}`);
} else {
  console.log(`AUDIT LEDGER BROKEN at block #${result.brokenAt}: ${result.reason}`);
  console.log(`Blocks before it (${result.checked}) are intact.`);
  process.exitCode = 2;
}
await mongoose.disconnect();
