import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { Admin } from '../models/Admin.js';

// Admin tokens carry scope "admin". Company user tokens don't, so they can never reach admin routes,
// and admin tokens can't open company workspaces (requireAuth only accepts company users).
export function signAdminToken(admin) {
  return jwt.sign({ sub: admin._id.toString(), scope: 'admin' }, config.jwtSecret, { expiresIn: '8h' });
}

export async function requireAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Log in as a MIRA admin.' });
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return res.status(401).json({ error: 'Your admin session has ended. Log in again.' });
  }
  if (payload.scope !== 'admin') return res.status(403).json({ error: 'This page is for MIRA admins only.' });
  const admin = await Admin.findById(payload.sub);
  if (!admin) return res.status(401).json({ error: 'Your admin session has ended. Log in again.' });
  req.admin = admin;
  next();
}
