/** サーバー API の薄いラッパ。エラーは日本語メッセージのまま throw して画面のトーストに出す */

async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }
  }
  if (!res.ok) throw new Error(payload?.error ?? `通信に失敗しました (${res.status})`);
  return payload;
}

export const api = {
  getState: () => request('GET', '/state'),
  getOptions: () => request('GET', '/options'),

  createInteraction: (payload) => request('POST', '/interactions', payload),
  updateInteraction: (id, patch) => request('PATCH', `/interactions/${id}`, patch),
  deleteInteraction: (id) => request('DELETE', `/interactions/${id}`),

  createCommitment: (payload) => request('POST', '/commitments', payload),
  updateCommitment: (id, patch) => request('PATCH', `/commitments/${id}`, patch),
  deleteCommitment: (id) => request('DELETE', `/commitments/${id}`),

  createGoal: (payload) => request('POST', '/goals', payload),
  updateGoal: (id, patch) => request('PATCH', `/goals/${id}`, patch),
  deleteGoal: (id) => request('DELETE', `/goals/${id}`),

  updateSettings: (patch) => request('PATCH', '/settings', patch),
  importDb: (payload) => request('POST', '/import', payload),

  handoff: (params = {}) => {
    const q = new URLSearchParams();
    if (params.nextTalkDate) q.set('nextTalkDate', params.nextTalkDate);
    if (params.includeMine === false) q.set('includeMine', 'false');
    const suffix = q.toString() ? `?${q}` : '';
    return request('GET', `/handoff${suffix}`);
  },
  review: () => request('GET', '/review'),
};
