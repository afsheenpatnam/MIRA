// Adds a teammate to an existing company workspace (the first account is created by signing up).
// There is no way to join a company from the website, so this is how new teammates get access.
//
// Usage:
//   npm run add-user -- --email teammate@company.com --name "Their Name" --company "Company Name" --password "at-least-8-chars"
//   (optional) --role "Payments SRE"
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDb } from './db.js';
import { User } from './models/User.js';
import { Workspace } from './models/Workspace.js';
import { audit, asSystem, companyOf } from './services/audit.js';

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1];
}

const { email, name, company, password, role = 'On-call engineer' } = args;
if (!email || !name || !company || !password) {
  console.log('Usage: npm run add-user -- --email teammate@company.com --name "Their Name" --company "Company Name" --password "at-least-8-chars"');
  process.exit(1);
}
if (password.length < 8) {
  console.log('Use a password of at least 8 characters.');
  process.exit(1);
}

await connectDb();
const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24);
const workspace = await Workspace.findOne({ slug });
if (!workspace) {
  const all = await Workspace.find().select('name');
  console.log(`No company "${company}". Existing companies: ${all.map((w) => w.name).join(', ') || 'none yet (sign up first)'}.`);
  await mongoose.disconnect();
  process.exit(1);
}

const existed = await User.exists({ email: email.toLowerCase() });
await User.findOneAndUpdate(
  { email: email.toLowerCase() },
  { name, role, passwordHash: await bcrypt.hash(password, 10), workspace: workspace._id },
  { upsert: true }
);
await audit({ category: 'access', action: 'user.added', actor: asSystem('Terminal (add-user)'), company: companyOf(workspace),
  target: email.toLowerCase(), detail: { role, reset: Boolean(existed) } });
console.log(`${existed ? 'Updated' : 'Created'} ${email.toLowerCase()} → ${workspace.name} only.`);
await mongoose.disconnect();
