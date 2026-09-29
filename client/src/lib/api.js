const TOKEN_KEY = 'mira.token';

function readToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function writeToken(token) {
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ }
}

let token = readToken();

async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error("MIRA's server didn't respond. Check your connection and try again."), { retryable: true });
  }
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const noServer = res.status >= 500 && !data.error;
    const err = new Error(data.error || (noServer ? "MIRA's server didn't respond. It may be restarting; try again in a few seconds." : `Request failed (${res.status}).`));
    err.retryable = res.status >= 500 || res.status === 429;
    err.status = res.status;
    if (res.status === 401) api.logout();
    throw err;
  }
  return data;
}

export const api = {
  hasToken: () => Boolean(token),
  logout() { token = null; writeToken(null); },
  async login(email, password) {
    const data = await request('/auth/login', { method: 'POST', body: { email, password } });
    token = data.token;
    writeToken(token);
    return data;
  },
  async signup(details) {
    const data = await request('/auth/signup', { method: 'POST', body: details });
    token = data.token;
    writeToken(token);
    return data;
  },
  me: () => request('/auth/me'),
  workspace: () => request('/workspace').then((d) => d.workspace),
  suggestions: () => request('/workspace/suggestions'),
  investigate: (alert, followUpOf) => request('/workspace/investigate', { method: 'POST', body: { alert, followUpOf } }),
  message: (text, followUpOf, recent) => request('/workspace/message', { method: 'POST', body: { text, followUpOf, recent } }),
  history: () => request('/workspace/incidents'),
  thread: (id) => request(`/workspace/incidents/${id}/thread`).then((d) => d.thread),
  feedback: (id, worked) => request(`/workspace/incidents/${id}/feedback`, { method: 'POST', body: { worked } }),
  insights: () => request('/workspace/insights'),
  sources: () => request('/workspace/sources'),
  importData: (payload) => request('/workspace/import', { method: 'POST', body: payload }),
};
