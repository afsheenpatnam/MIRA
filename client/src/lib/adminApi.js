// Platform admin API. Uses its own token, separate from company logins.
const KEY = 'mira.adminToken';
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = (t) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* storage blocked */ } };

let token = read();

async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api/admin${path}`, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("MIRA's server didn't respond. Try again in a moment.");
  }
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) { token = null; write(null); }
    throw Object.assign(new Error(data.error || `Request failed (${res.status}).`), { status: res.status });
  }
  return data;
}

export const adminApi = {
  hasToken: () => Boolean(token),
  logout() { token = null; write(null); },
  // Admins log in on the normal login page; it hands the admin session over here.
  useSession(t) { token = t; write(t); },
  me: () => request('/me').then((d) => d.admin),
  companies: () => request('/companies').then((d) => d.companies),
  company: (id) => request(`/companies/${id}`),
  deleteCompany: (id, confirm) => request(`/companies/${id}`, { method: 'DELETE', body: { confirm } }),

  // Audit logs
  audit({ category, problems, before, limit } = {}) {
    const q = new URLSearchParams();
    if (category && category !== 'all') q.set('category', category);
    if (problems) q.set('problems', '1');
    if (before != null) q.set('before', before);
    if (limit) q.set('limit', limit);
    return request(`/audit${q.size ? `?${q}` : ''}`);
  },

  // MIRA for admins. The time zone lets MIRA say times as they appear on the admin's clock.
  ask: (text, recent) => request('/ask', {
    method: 'POST',
    body: { text, recent, tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
  }),
};
