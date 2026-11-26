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
  // 当前布局是 tables.workspaces[wsId]；老布局直接把工作区放在 tables 下面，两种都走一遍
  const buckets = [tables];
  if (tables.workspaces && typeof tables.workspaces === 'object') buckets.push(tables.workspaces);
  for (const bucket of buckets) {
    for (const wsId of Object.keys(bucket)) {
      const ws = bucket[wsId];
      if (ws && Array.isArray(ws.sessionIds) && ws.sessionIds.includes(id)) {
        ws.sessionIds = ws.sessionIds.filter((x) => x !== id);
        changed = true;
      }
    }
  }
  if (changed) {
    try {
      fs.writeFileSync(file, JSON.stringify(doc, null, 2));
    } catch {}
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* 会话在 host 内存里时，只删磁盘上的文件没用：会话列表优先列出 live 会话，
   刷新后它还会出现。这里拿 store 条目自带的 detach 闭包，既移出内存 store，
   也派发 session/disposed —— 官方的 api-session/removed 就挂在这个事件上。 */
function liveEntryOf(sessions, id) {
  try {
    const store = sessions && sessions.store;
    if (!store || typeof store.get !== 'function') return null;
    const entry = store.get(id);
    if (entry && typeof entry.detach === 'function') return entry;
  } catch {}
  return null;
}

async function detachLive(ctx, id) {
  const sessions = ctx.get('sessions');
  if (!sessions || typeof sessions.get !== 'function') return false;
  let session;
  try {
    session = sessions.get(id);
  } catch {}
  const entry = liveEntryOf(sessions, id);
  if (!session && !entry) return false;

  // 正在跑的 agent 先停下，避免 detach 之后它继续往日志里写
  try {
    const agents = ctx.get('agents');
    const agent = agents && typeof agents.get === 'function' ? agents.get(id) : undefined;
    if (agent && typeof agent.cancel === 'function') {
      agent.cancel({ kind: 'user' });
      if (typeof agent.whenIdle === 'function') {
        await Promise.race([agent.whenIdle(), sleep(600)]);
      }
    }
  } catch {}

  // 先让缓冲的事件落盘，避免 detach 之后 writer 关闭时又补写一遍
  if (session && typeof sessions.flush === 'function') {
    try {
      await sessions.flush(session);
    } catch {}
  }
  if (entry) {
    try {
      entry.detach();
      return true;
    } catch {}
  }
  // 老版本 DSH 在会话对象上暴露 dispose()
  if (session && typeof session.dispose === 'function') {
    try {
      await session.dispose();
      return true;
    } catch {}
  }
  return false;
}

/**
 * 等持久化 writer 关闭：session/disposed 的 close() 是异步的，
 * 立刻删目录会跟它抢，文件可能被写回来。轮询 mtime 直到稳定。
 */
async function waitQuiet(dirs, timeout = 1500) {
  const deadline = Date.now() + timeout;
  let last = '';
  let stable = 0;
  while (Date.now() < deadline) {
    let stamp = '';
    for (const dir of dirs) {
      try {
        stamp += dir + ':' + Math.round(fs.statSync(dir).mtimeMs) + ';';
      } catch {
        stamp += dir + ':missing;';
      }
    }
    if (stamp === last) {
      stable += 1;
      if (stable >= 2) return;
    } else {
      stable = 0;
      last = stamp;
    }
    await sleep(60);
  }
}

function removeDirs(dirs) {
  let removed = 0;
  let bytes = 0;
  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      bytes += dirSize(dir);
      fs.rmSync(dir, { recursive: true, force: true });
      removed += 1;
    } catch {}
  }
  return { removed, bytes };
}

async function deleteSession(ctx, id) {
  // 1. 把会话从 host 内存 store 里摘掉（这一步决定了刷新后会不会回来）
  const wasLive = await detachLive(ctx, id);

  // 2. 删除会话目录（兼容 session-<uuid> 与裸 <uuid> 两种命名）
  const bare = String(id).replace(/^session-/, '');
  const ids = [...new Set([String(id), bare, 'session-' + bare])];
  const dirs = [];
  for (const candidate of ids) {
    for (const d of findSessionDirs(path.join(home(), 'sessions'), candidate)) {
      if (!dirs.includes(d)) dirs.push(d);
    }
  }
  if (dirs.length) await waitQuiet(dirs);

  let { removed, bytes } = removeDirs(dirs);
  // writer 关闭可能晚一步把文件写回来，再补一刀并确认
  if (wasLive && dirs.length) {
    await sleep(180);
    const again = removeDirs(dirs);
    removed += again.removed;
    bytes += again.bytes;
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
  //    detach 已经派发过 session/disposed，新的 host 会自己广播 api-session/removed；
  //    老版本 / 纯冷会话没有这一步，这里补一次（前端把不存在的 id 移除是幂等的）。
  if (!wasLive) {
    try {
      ctx.emit('api-session/removed', id);
    } catch {}
  }

  // 6. 顺手清掉被删空的父级目录（工作区 slug 目录）
  for (const dir of dirs) pruneEmptyParents(dir);

  return { removed, bytes, live: wasLive };
}

function pruneEmptyParents(dir) {
  let parent = path.dirname(dir);
  const root = path.join(home(), 'sessions');
  while (parent.startsWith(root) && parent !== root) {
    try {
      if (fs.readdirSync(parent).length > 0) return;
      fs.rmdirSync(parent);
    } catch {
      return;
    }
    parent = path.dirname(parent);
  }
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
  // Older or stripped-down hosts may not expose the fetch bridge at all; keep
  // the sidebar (fold/menu) features working instead of aborting the whole plugin.
  if (!ctx.connection || typeof ctx.connection.fetch?.register !== 'function') return;
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
