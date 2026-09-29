import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { User } from '../models/User.js';
import { Workspace } from '../models/Workspace.js';
import { Admin } from '../models/Admin.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { signAdminToken } from '../middleware/admin.js';
import { SECTORS, sectorLabel } from '../sectors.js';
import { bankIdFor, ensureBank } from '../services/hindsight.js';
import { audit, asAdmin, asUser, companyOf, hideEmail, ipOf } from '../services/audit.js';

const router = Router();

// Slows down password guessing and mass sign-ups.
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many login attempts. Wait 15 minutes and try again.' } });
const signupLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many sign-ups from this network. Try again in an hour.' } });

export const publicUser = (user) => ({ name: user.name, email: user.email, role: user.role });
export const publicWorkspace = (w) => ({
  name: w.name,
  sector: w.sector,
  sectorLabel: sectorLabel(w.sector),
  glyph: w.name.trim()[0]?.toUpperCase() || 'M',
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const toSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24);

/**
 * Creates a company workspace and its first account. Each company gets its own
 * MongoDB database (mira_<company>) and its own Hindsight memory bank (mira-<company>).
 */
router.post('/signup', signupLimiter, async (req, res) => {
  const company = String(req.body?.company || '').trim();
  const sector = String(req.body?.sector || '');
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!SECTORS[sector]) return res.status(400).json({ error: 'Choose your sector.' });
  if (company.length < 2) return res.status(400).json({ error: 'Enter your company name.' });
  if (!name) return res.status(400).json({ error: 'Enter your name.' });
  if (!EMAIL.test(email)) return res.status(400).json({ error: 'Enter a valid work email.' });
  if (password.length < 8) return res.status(400).json({ error: 'Use a password of at least 8 characters.' });

  const slug = toSlug(company);
  if (slug.length < 2) return res.status(400).json({ error: 'Use letters or numbers in the company name.' });
  if (await User.exists({ email })) return res.status(409).json({ error: 'An account with that email already exists. Log in instead.' });
  if (await Workspace.exists({ slug })) {
    return res.status(409).json({ error: `${company} already has a MIRA workspace. Ask its owner to add you.` });
  }

  const bankId = bankIdFor(slug);
  await ensureBank(bankId, { name: company, context: SECTORS[sector].context });
  const workspace = await Workspace.create({ slug, name: company, sector, dbName: `mira_${slug}`, bankId });
  let user;
  try {
    user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 10), role: 'Workspace owner', workspace: workspace._id });
  } catch (err) {
    await Workspace.deleteOne({ _id: workspace._id });
    throw err;
  }
  audit({ category: 'access', action: 'company.created', actor: asUser(user), company: companyOf(workspace), detail: { sector }, ip: ipOf(req) });
  res.status(201).json({ token: signToken(user), user: publicUser(user), workspace: publicWorkspace(workspace) });
});

// One login page for everyone. A MIRA admin's email opens the admin dashboard; a company email opens
// that company's workspace. Teammates are added by the owner with `npm run add-user`, admins with `npm run create-admin`.
router.post('/login', loginLimiter, async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const password = String(req.body?.password || '');

  const admin = email && (await Admin.findOne({ email }));
  if (admin && (await bcrypt.compare(password, admin.passwordHash))) {
    audit({ category: 'access', action: 'admin.login', actor: asAdmin(admin), ip: ipOf(req) });
    return res.json({ kind: 'admin', token: signAdminToken(admin), admin: { name: admin.name, email: admin.email } });
  }

  const user = email && (await User.findOne({ email }));
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    audit({ category: 'access', action: admin && !user ? 'admin.login' : 'user.login', outcome: 'failed',
      actor: { kind: 'anonymous', email: hideEmail(email) }, ip: ipOf(req) });
    return res.status(401).json({ error: 'That email and password don\'t match.' });
  }
  const workspace = await Workspace.findById(user.workspace);
  if (!workspace) return res.status(403).json({ error: 'Your account is not linked to a company.' });
  audit({ category: 'access', action: 'user.login', actor: asUser(user), company: companyOf(workspace), ip: ipOf(req) });
  res.json({ kind: 'company', token: signToken(user), user: publicUser(user), workspace: publicWorkspace(workspace) });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user), workspace: publicWorkspace(req.workspace) }));

export default router;
