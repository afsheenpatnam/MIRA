// Creates (or resets the password of) a MIRA platform admin.
// Admins are created only from the terminal, never through the website.
//
// Usage: npm run create-admin -- --email you@example.com --name "Your Name" --password "at-least-8-chars"
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDb } from './db.js';
import { Admin } from './models/Admin.js';
import { audit, asSystem } from './services/audit.js';

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1];
}
const { email, name = 'MIRA Admin', password } = args;
if (!email || !password) {
  console.log('Usage: npm run create-admin -- --email you@example.com --name "Your Name" --password "at-least-8-chars"');
  process.exit(1);
}
if (password.length < 8) {
  console.log('Use an admin password of at least 8 characters.');
  process.exit(1);
}

await connectDb();
const existed = await Admin.exists({ email: email.toLowerCase() });
await Admin.findOneAndUpdate(
  { email: email.toLowerCase() },
  { name, passwordHash: await bcrypt.hash(password, 12) },
  { upsert: true }
);
// Creating an admin or resetting a password is always recorded in the audit ledger.
await audit({ category: 'admin', action: 'admin.created', actor: asSystem('Terminal (create-admin)'), target: email.toLowerCase(), detail: { reset: Boolean(existed) } });
console.log(`${existed ? 'Updated' : 'Created'} admin ${email.toLowerCase()}. Log in on the normal login page; it opens the admin dashboard.`);
await mongoose.disconnect();
