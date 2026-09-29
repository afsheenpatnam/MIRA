import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User } from '../models/User.js';
import { Workspace } from '../models/Workspace.js';

export function signToken(user) {
  return jwt.sign({ sub: user._id.toString() }, config.jwtSecret, { expiresIn: '12h' });
}

/**
 * Verifies the JWT, then loads the user's one company. Routes use req.workspace
 * for the database and memory bank; nothing sent by the browser can change it.
 */
export async function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Log in to use MIRA.' });

  let sub;
  try {
    ({ sub } = jwt.verify(token, config.jwtSecret));
  } catch {
    return res.status(401).json({ error: 'Your session has ended. Log in again.' });
  }

  const user = await User.findById(sub);
  if (!user) return res.status(401).json({ error: 'Your session has ended. Log in again.' });
  const workspace = await Workspace.findById(user.workspace);
  if (!workspace) return res.status(403).json({ error: 'Your account is not linked to a company.' });

  req.user = user;
  req.workspace = workspace;
  next();
}
