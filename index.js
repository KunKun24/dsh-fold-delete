import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const name = 'fold-delete';
export const inject = ['connection'];

function home() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}


/* ------------------------- 删除会话 ------------------------- */

function findSessionDirs(root, id, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) {
      if (e.name === id) out.push(full);
      else if (!e.name.startsWith('.')) findSessionDirs(full, id, out);
    }
  }
  return out;
}

function dropFromWorkspace(id) {
  const file = path.join(home(), 'storages', 'workspace.json');
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return;
  }
  let changed = false;
  const g = doc.global || {};
  for (const key of ['archivedSessionIds', 'pinnedSessionIds']) {
    if (Array.isArray(g[key]) && g[key].includes(id)) {
      g[key] = g[key].filter((x) => x !== id);
      changed = true;
    }
  }
  const tables = doc.tables || {};
  for (const wsId of Object.keys(tables)) {
    const ws = tables[wsId];
    if (ws && Array.isArray(ws.sessionIds) && ws.sessionIds.includes(id)) {
      ws.sessionIds = ws.sessionIds.filter((x) => x !== id);
      changed = true;
    }
  }
  if (changed) {
    try {
      fs.writeFileSync(file, JSON.stringify(doc, null, 2));
    } catch {}
  }
}

async function deleteSession(ctx, id) {
  // 1. 停掉可能正在运行的会话
  try {
    const sessions = ctx.get('sessions');
    if (sessions && typeof sessions.get === 'function') {
      const live = sessions.get(id);
      if (live) {
        if (typeof sessions.flush === 'function') await sessions.flush(live).catch(() => {});
        if (typeof live.dispose === 'function') await live.dispose().catch(() => {});
      }
    }
  } catch {}

  // 2. 删除会话目录（兼容 session-<uuid> 与裸 <uuid> 两种命名）
  const bare = String(id).replace(/^session-/, '');
  const ids = [...new Set([String(id), bare, 'session-' + bare])];
  const dirs = [];
  for (const candidate of ids) {
    for (const d of findSessionDirs(path.join(home(), 'sessions'), candidate)) {
      if (!dirs.includes(d)) dirs.push(d);
    }
  }
  let removed = 0;
  let bytes = 0;
  for (const dir of dirs) {
    try {
      bytes += dirSize(dir);
      fs.rmSync(dir, { recursive: true, force: true });
      removed += 1;
    } catch {}
  }

  // 3. 删除投影缓存
  for (const candidate of ids) {
    const cache = path.join(home(), 'storages', 'session_projcache', 'sessions', candidate + '.json');
    try {
      if (fs.existsSync(cache)) {
        bytes += fs.statSync(cache).size;
        fs.rmSync(cache, { force: true });
        removed += 1;
      }
    } catch {}
  }

  // 4. 从工作区引用中移除
  for (const candidate of ids) dropFromWorkspace(candidate);

  // 5. 通知前端列表刷新
  try {
    ctx.emit('api-session/removed', id);
  } catch {}

  return { removed, bytes };
}

function dirSize(dir) {
  let total = 0;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) total += dirSize(full);
      else {
        try {
          total += fs.statSync(full).size;
        } catch {}
      }
    }
  } catch {}
  return total;
}


export function apply(ctx) {
  ctx.effect(() =>
    ctx.connection.fetch.register({
      path: '/api/fold-delete/delete',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        let body = {};
        try {
          body = await request.json();
        } catch {}
        const id = body.id;
        if (!id) return json({ ok: false, error: '缺少会话 ID' }, 400);
        // 会话 id 会拼进文件路径，只允许基本的 uuid/名字字符
        if (typeof id !== 'string' || !/^[A-Za-z0-9._-]{1,160}$/.test(id) || id.includes('..')) {
          return json({ ok: false, error: '会话 ID 不合法' }, 400);
        }
        if (body.confirm !== true) return json({ ok: false, error: '需要二次确认' }, 400);
        try {
          const result = await deleteSession(ctx, id);
          return json({ ok: true, ...result });
        } catch (err) {
          return json({ ok: false, error: String(err && err.message ? err.message : err) }, 500);
        }
      },
    }),
  );
}
