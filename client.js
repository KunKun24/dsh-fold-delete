window.__ModuleLoader__.load({
  id: 'dsh-fold-delete',
  factory: (require) => {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback, useRef } = React;

    const NS = 'dsh-fold-delete';
    const STORAGE_KEY = 'dsh-fold-delete';
    const MIN_COUNT = 5;
    const MAX_COUNT = 200;
    const DEFAULT_COUNT = 20;

    const MUTED = 'var(--dsw-alias-text-secondary, #8b93a7)';
    const LINE = 'var(--dsw-alias-border-secondary, rgba(128,128,128,.22))';
    const BRAND = 'var(--dsw-alias-brand-primary, #4d6bfe)';

    /* ------------------------------------------------------------------ *
     * settings store (localStorage: dsh-fold-delete)
     * ------------------------------------------------------------------ */

    function clampCount(value) {
      const n = Math.round(Number(value));
      if (!Number.isFinite(n)) return DEFAULT_COUNT;
      return Math.min(MAX_COUNT, Math.max(MIN_COUNT, n));
    }

    function readSettings() {
      let raw = null;
      try {
        raw = window.localStorage.getItem(STORAGE_KEY);
      } catch (error) {
        raw = null;
      }
      let value = {};
      if (raw) {
        try {
          value = JSON.parse(raw) || {};
        } catch (error) {
          value = {};
        }
      }
      return {
        foldEnabled: value.foldEnabled !== false,
        foldCount: value.foldCount === undefined ? DEFAULT_COUNT : clampCount(value.foldCount),
      };
    }

    let settings = readSettings();
    const listeners = new Set();

    function persist() {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch (error) {
        /* private mode / quota — keep the in-memory value */
      }
    }

    function updateSettings(patch) {
      settings = Object.assign({}, settings, patch);
      persist();
      listeners.forEach((fn) => {
        try {
          fn(settings);
        } catch (error) {
          /* ignore a broken subscriber */
        }
      });
      scheduleApply();
    }

    /* ------------------------------------------------------------------ *
     * shared plumbing
     * ------------------------------------------------------------------ */

    const STYLE_ID = 'dsh-fold-delete-style';
    const FOLD_ATTR = 'data-dsh-fold-delete';
    const FLOW_SELECTOR = '[data-slot="conversation.chat.flow"]';

    function ensureStyle() {
      if (document.getElementById(STYLE_ID) !== null) return;
      const el = document.createElement('style');
      el.id = STYLE_ID;
      /* Hiding only ever touches an attribute we own: React never renders it,
         and no node is inserted, moved or removed. */
      el.textContent = '[' + FOLD_ATTR + ']{display:none!important}';
      document.head.appendChild(el);
    }

    let rafId = 0;
    function scheduleApply() {
      if (rafId !== 0) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        applyFold();
      });
    }

    /* ------------------------------------------------------------------ *
     * feature 2 — fold older messages
     * ------------------------------------------------------------------ */

    /* Extra messages revealed by the floating control, on top of foldCount. */
    let revealed = 0;
    let revealedSession = null;

    /*
     * A row counts toward N when it is a real transcript message.
     * Reasoning never counts: `turn-process` rows carry the thinking block,
     * and data-chat-group-part="reasoning" marks reasoning rows that live
     * outside one. Turn tails are footers and step-process group seats
     * (data-chat-group-key) are collapsed tool groups, so neither of them
     * eats the budget either.
     */
    function isMessageRow(row) {
      if (!(row instanceof HTMLElement)) return false;
      const kind = row.getAttribute('data-chat-flow-kind');
      if (kind === null) return false;
      if (kind === 'turn-process') return false;
      if (kind === 'turn-tail') return false;
      if (kind === 'turn-max-tokens') return false;
      if (row.getAttribute('data-chat-group-part') === 'reasoning') return false;
      if (row.hasAttribute('data-chat-group-key')) return false;
      if (row.hasAttribute('hidden')) return false;
      if (row.childElementCount === 0) return false;
      return true;
    }

    function sessionKeyOf(flow) {
      const host = flow.closest('[data-conversation-session]');
      if (host === null) return '';
      return host.getAttribute('data-conversation-session') || '';
    }

    let hiddenTotal = 0;
    let messageTotal = 0;
    let hasFlow = false;

    function applyFold() {
      const flows = document.querySelectorAll(FLOW_SELECTOR);
      hiddenTotal = 0;
      messageTotal = 0;
      hasFlow = false;

      if (flows.length > 0) {
        const key = sessionKeyOf(flows[0]);
        if (key !== revealedSession) {
          revealedSession = key;
          revealed = 0;
        }
      }

      for (const flow of flows) {
        if (!(flow instanceof HTMLElement)) continue;
        hasFlow = true;

        const scroller = flow.closest('[data-conversation-scroll]');
        const atBottom =
          scroller === null
            ? false
            : scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;

        const rows = Array.from(flow.children);
        const countable = rows.filter(isMessageRow);
        if (countable.length > messageTotal) messageTotal = countable.length;

        const budget = settings.foldCount + revealed;
        let boundary = -1;
        if (settings.foldEnabled && countable.length > budget) {
          const anchor = countable[countable.length - budget];
          boundary = rows.indexOf(anchor);
        }

        for (let index = 0; index < rows.length; index += 1) {
          const row = rows[index];
          const hide = boundary > 0 && index < boundary;
          const marked = row.hasAttribute(FOLD_ATTR);
          if (hide) {
            if (!marked) row.setAttribute(FOLD_ATTR, '');
            hiddenTotal += 1;
          } else if (marked) {
            row.removeAttribute(FOLD_ATTR);
          }
        }

        if (atBottom && scroller !== null) scroller.scrollTop = scroller.scrollHeight;
      }

      renderPill();
    }

    /* ------------------------------------------------------------------ *
     * floating "expand older" control (plain DOM, never inside React's tree)
     * ------------------------------------------------------------------ */

    let pill = null;
    let pillSignature = '';

    function ensurePill() {
      if (pill !== null && pill.isConnected) return pill;
      pill = document.createElement('div');
      pill.id = 'dsh-fold-delete-pill';
      pill.setAttribute('data-dsh-fold-delete', 'pill');
      pill.style.cssText = [
        'display:none',
        'justify-content:center',
        'align-items:center',
        'margin:12px auto 4px',
        'user-select:none',
      ].join(';');
      /* Never steal focus from the composer. */
      pill.addEventListener('mousedown', (event) => event.preventDefault());
      return pill;
    }

    function pillButton(label, title, onClick) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      if (title) button.title = title;
      button.style.cssText = [
        'border:0',
        'border-radius:999px',
        'padding:4px 10px',
        'font-size:12px',
        'line-height:1.3',
        'cursor:pointer',
        'font-family:inherit',
        'color:var(--dsw-alias-text-primary, #e7e9ee)',
        'background:rgba(128,128,128,.18)',
      ].join(';');
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      });
      return button;
    }

    function buildPillContent(hidden) {
      const el = ensurePill();
      el.textContent = '';

      const text = document.createElement('span');
      text.textContent = hidden > 0 ? '更早的 ' + hidden + ' 条已折叠' : '已展开全部较早消息';
      el.appendChild(text);

      if (hidden > 0) {
        const batch = Math.max(1, settings.foldCount);
        el.appendChild(
          pillButton('展开 ' + batch + ' 条', '再多显示 ' + batch + ' 条更早的消息', () => {
            revealed += settings.foldCount;
            applyFold();
          }),
        );
        el.appendChild(
          pillButton('全部展开', '显示本对话所有已加载的消息', () => {
            revealed = Math.max(messageTotal, revealed) + 1;
            applyFold();
          }),
        );
      } else if (revealed > 0) {
        el.appendChild(
          pillButton('收起', '重新只显示最近 ' + settings.foldCount + ' 条', () => {
            revealed = 0;
            applyFold();
          }),
        );
      }
    }

    /* 把展开控件内联到消息流顶部，避免浮动遮挡内容。 */
    function positionPill() {
      if (pill === null || pill.style.display === 'none') return;
      const flow = document.querySelector('[data-slot="conversation.chat.flow"]');
      if (flow === null) return;
      if (pill.parentElement === flow && flow.firstElementChild === pill) return;
      try {
        flow.insertBefore(pill, flow.firstChild);
      } catch (error) {}
    }

    function renderPill() {
      const active = hasFlow && settings.foldEnabled && (hiddenTotal > 0 || revealed > 0);
      if (!active) {
        if (pill !== null) pill.style.display = 'none';
        return;
      }
      const el = ensurePill();
      const signature = hiddenTotal + ':' + revealed + ':' + settings.foldCount;
      if (signature !== pillSignature) {
        pillSignature = signature;
        buildPillContent(hiddenTotal);
      }
      el.style.display = 'flex';
      positionPill();
    }


    /* ------------------------------------------------------------------ *
     * 删除会话（来自 dsh-session-tools）
     * ------------------------------------------------------------------ */

    const DANGER = 'var(--dsw-alias-state-error-primary, #ff5c5c)';

    /* 主题探测：dsh 没有 --dsw-alias-bg-primary 这个变量，原来的写法永远落到深色兜底，
       导致浅色模式下弹窗是黑一块。这里直接看页面真实背景亮度来选配色。 */
    function theme() {
      let dark = true;
      try {
        const bg = getComputedStyle(document.body).backgroundColor;
        const m = bg && bg.match(/\d+(\.\d+)?/g);
        if (m && m.length >= 3) {
          const lum = 0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2];
          dark = lum < 140;
        } else {
          dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
      } catch (e) {}
      return dark
        ? { card: '#1b2029', text: '#e9eef8', muted: '#9aa4b8', line: 'rgba(255,255,255,.12)', mask: 'rgba(0,0,0,.55)', shadow: '0 24px 60px rgba(0,0,0,.55)' }
        : { card: '#ffffff', text: '#1a2332', muted: '#5b6678', line: 'rgba(16,24,40,.12)', mask: 'rgba(16,24,40,.30)', shadow: '0 18px 48px rgba(16,24,40,.18)' };
    }

    const dialogListeners = new Set();
    let dialog = null;
    let toastText = '';
    let toastTimer = null;
    const toastListeners = new Set();

    function openDialog(next) {
      dialog = next;
      dialogListeners.forEach((fn) => fn(dialog));
    }
    function toast(text) {
      toastText = text;
      toastListeners.forEach((fn) => fn(toastText));
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toastText = '';
        toastListeners.forEach((fn) => fn(''));
      }, 2600);
    }

    function sessionIdOf(props) {
      return (
        (props && props.sessionId) ||
        (props && props.id) ||
        (props && props.session && props.session.id) ||
        ''
      );
    }


    const itemStyle = {
      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
      minHeight: 34, padding: '6px 8px', borderRadius: 8, border: 0,
      background: 'transparent', color: 'inherit', cursor: 'pointer',
      fontSize: 13, lineHeight: '20px', textAlign: 'left', font: 'inherit',
    };
    const dangerStyle = { ...itemStyle, color: DANGER };

    function icon(paths, size) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
        style: { flex: 'none', opacity: 0.9 },
      }, paths.map((d, i) => h('path', { key: i, d })));
    }

    function ExportItem(props) {
      const [, setMenuOpen] = props.useMenuOpenState();
      const id = sessionIdOf(props);
      return h('button', {
        type: 'button', role: 'menuitem', className: 'item', style: itemStyle,
        onMouseEnter: (e) => { e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12))'; },
        onMouseLeave: (e) => { e.currentTarget.style.background = 'transparent'; },
        onClick: () => {
          setMenuOpen(false);
          void downloadMarkdown(id, props.displayTitle);
        },
      },
        icon(['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'], 14),
        h('span', null, '导出对话（Markdown）')
      );
    }

    function DeleteItem(props) {
      const [, setMenuOpen] = props.useMenuOpenState();
      const id = sessionIdOf(props);
      return h('button', {
        type: 'button', role: 'menuitem', style: dangerStyle,
        onMouseEnter: (e) => { e.currentTarget.style.background = 'rgba(255,92,92,.1)'; },
        onMouseLeave: (e) => { e.currentTarget.style.background = 'transparent'; },
        onClick: () => {
          setMenuOpen(false);
          openDialog({ id, title: props.displayTitle || id });
        },
      },
        icon(['M3 6h18', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'], 14),
        h('span', null, '删除会话')
      );
    }


    function Dialog() {
      const [target, setTarget] = useState(dialog);
      const [ack, setAck] = useState(false);
      const [busy, setBusy] = useState(false);

      useEffect(() => {
        const fn = (next) => {
          setTarget(next);
          setAck(false);
          setBusy(false);
        };
        dialogListeners.add(fn);
        return () => dialogListeners.delete(fn);
      }, []);

      if (!target) return null;

      const close = () => openDialog(null);

      const confirm = async () => {
        if (!ack || busy) return;
        setBusy(true);
        try {
          const r = await fetch('/api/fold-delete/delete', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: target.id, confirm: true }),
          });
          const d = await r.json().catch(() => ({}));
          if (r.ok && d.ok) {
            toast('会话已删除');
            close();
          } else {
            toast(d.error || '删除失败');
            setBusy(false);
          }
        } catch (e) {
          toast('删除失败');
          setBusy(false);
        }
      };

      const th = theme();
      const stop = (e) => e.stopPropagation();

      return h('div', {
        style: {
          position: 'fixed', inset: 0, zIndex: 2147483001,
          background: th.mask, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 20,
        },
        onClick: close,
      },
        h('div', {
          onClick: stop,
          style: {
            width: '100%', maxWidth: 420, borderRadius: 18, padding: '24px 24px 20px',
            background: th.card,
            border: '1px solid ' + th.line, color: th.text,
            boxShadow: th.shadow,
            fontFamily: '-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif',
          },
        },
          h('div', { style: { fontSize: 16.5, fontWeight: 600, marginBottom: 10, color: DANGER, letterSpacing: '.2px' } }, '删除会话'),
          h('div', { style: { fontSize: 13, lineHeight: 1.75, color: th.muted, marginBottom: 16 } },
            '将永久删除「' + (target.title || target.id) + '」的全部内容，包括消息、思考过程与附件记录。',
            h('br'),
            h('strong', { style: { color: DANGER } }, '此操作不可恢复，无法撤销。')
          ),
          h('label', {
            style: { display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, cursor: 'pointer', lineHeight: 1.6 },
          },
            h('input', {
              type: 'checkbox', checked: ack,
              onChange: (e) => setAck(e.target.checked),
              style: { marginTop: 2, width: 16, height: 16, accentColor: DANGER, cursor: 'pointer' },
            }),
            h('span', null, '我已了解，确认永久删除')
          ),
          h('div', { style: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 } },
            h('button', {
              type: 'button', onClick: close,
              style: {
                height: 36, padding: '0 18px', borderRadius: 10, cursor: 'pointer',
                border: '1px solid ' + th.line, background: 'transparent', color: th.text, fontSize: 13,
              },
            }, '取消'),
            h('button', {
              type: 'button', onClick: confirm, disabled: !ack || busy,
              style: {
                height: 36, padding: '0 18px', borderRadius: 10, border: 0, fontSize: 13,
                cursor: ack && !busy ? 'pointer' : 'not-allowed',
                background: DANGER, color: '#fff', fontWeight: 600,
                opacity: ack && !busy ? 1 : 0.45,
              },
            }, busy ? '删除中…' : '确认删除')
          )
        )
      );
    }

    function Toaster() {
      const [text, setText] = useState('');
      useEffect(() => {
        const fn = (t) => setText(t);
        toastListeners.add(fn);
        return () => toastListeners.delete(fn);
      }, []);
      if (!text) return null;
      return h('div', {
        style: {
          position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)',
          padding: '10px 18px', borderRadius: 10, fontSize: 13, zIndex: 2147483002,
          background: theme().card, color: theme().text,
          border: '1px solid ' + theme().line, boxShadow: theme().shadow,
        },
      }, text);
    }

    /* ------------------------------------------------------------------ *
     * runtime wiring
     * ------------------------------------------------------------------ */

    let started = false;

    function startRuntime() {
      if (started) return;
      started = true;
      ensureStyle();

      window.addEventListener('resize', positionPill);
      window.addEventListener('scroll', positionPill, true);

      let applyTimer = null;
      const observer = new MutationObserver(() => {
        if (document.hidden) return;
        if (applyTimer !== null) return;
        applyTimer = setTimeout(() => {
          applyTimer = null;
          scheduleApply();
        }, 250);
      });
      observer.observe(document.body, { childList: true, subtree: true });

      scheduleApply();
    }

    /* ------------------------------------------------------------------ *
     * panel UI
     * ------------------------------------------------------------------ */

    function Icon({ size = 16 }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        },
        h('line', { key: 'l1', x1: 4, y1: 7, x2: 20, y2: 7 }),
        h('circle', { key: 'c1', cx: 9, cy: 7, r: 2.2, fill: 'currentColor', stroke: 'none' }),
        h('line', { key: 'l2', x1: 4, y1: 12, x2: 20, y2: 12 }),
        h('circle', { key: 'c2', cx: 15, cy: 12, r: 2.2, fill: 'currentColor', stroke: 'none' }),
        h('line', { key: 'l3', x1: 4, y1: 17, x2: 20, y2: 17 }),
        h('circle', { key: 'c3', cx: 7, cy: 17, r: 2.2, fill: 'currentColor', stroke: 'none' }),
      );
    }

    function Switch({ checked, onChange }) {
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': checked,
          onClick: () => onChange(!checked),
          style: {
            width: 46,
            height: 26,
            borderRadius: 13,
            border: 0,
            flex: 'none',
            cursor: 'pointer',
            padding: 0,
            background: checked ? BRAND : 'rgba(128,128,128,.35)',
            position: 'relative',
            transition: 'background .18s',
          },
        },
        h('span', {
          style: {
            position: 'absolute',
            top: 3,
            left: checked ? 23 : 3,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left .18s',
            boxShadow: '0 1px 3px rgba(0,0,0,.3)',
          },
        }),
      );
    }

    function Row({ title, desc, checked, onChange, children }) {
      return h(
        'div',
        {
          style: {
            border: '1px solid ' + LINE,
            borderRadius: 12,
            padding: '14px 16px',
            marginBottom: 12,
            background: 'var(--dsw-alias-bg-secondary, transparent)',
          },
        },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 14 } },
          h(
            'div',
            { style: { flex: 1, minWidth: 0 } },
            h('div', { style: { fontSize: 14, fontWeight: 500 } }, title),
            desc
              ? h(
                  'div',
                  { style: { fontSize: 12, color: MUTED, marginTop: 3, lineHeight: 1.5 } },
                  desc,
                )
              : null,
          ),
          h(Switch, { checked: checked, onChange: onChange }),
        ),
        checked && children ? h('div', { style: { marginTop: 12 } }, children) : null,
      );
    }

    const inputStyle = {
      width: 96,
      boxSizing: 'border-box',
      padding: '8px 10px',
      fontSize: 13,
      borderRadius: 9,
      border: '1px solid ' + LINE,
      background: 'var(--dsw-alias-bg-primary, rgba(0,0,0,.15))',
      color: 'inherit',
      fontFamily: 'inherit',
      outline: 'none',
    };

    /** 「觉得好用点个 Star」：所有插件设置页统一的仓库入口。 */
    function RepoInvite() {
      return h('div', {
        style: {
          marginTop: 18, paddingTop: 14, borderTop: '1px solid ' + LINE,
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          fontSize: 12.5, color: MUTED,
        },
      },
        h('span', { style: { color: '#f5a623' } }, '\u2605'),
        h('span', null, '觉得好用的话，点个 Star 吧'),
        h('a', {
          href: 'https://github.com/KunKun24/dsh-fold-delete',
          target: '_blank',
          rel: 'noopener noreferrer',
          style: { color: BRAND, textDecoration: 'none' },
        }, 'GitHub 仓库')
      );
    }

    function Panel() {
      const [view, setView] = useState(() => Object.assign({}, settings));
      const [countText, setCountText] = useState(String(settings.foldCount));
      const [notice, setNotice] = useState('');
      const timer = useRef(null);

      useEffect(() => {
        const fn = (next) => {
          setView(Object.assign({}, next));
          setCountText(String(next.foldCount));
        };
        listeners.add(fn);
        return () => {
          listeners.delete(fn);
        };
      }, []);

      useEffect(
        () => () => {
          if (timer.current !== null) clearTimeout(timer.current);
        },
        [],
      );

      const flash = useCallback((text) => {
        setNotice(text);
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = setTimeout(() => setNotice(''), 1600);
      }, []);

      const commitCount = useCallback(() => {
        const raw = String(countText).trim();
        const parsed = Number(raw);
        if (raw === '' || !Number.isFinite(parsed)) {
          setCountText(String(settings.foldCount));
          return;
        }
        const next = clampCount(parsed);
        setCountText(String(next));
        if (next !== settings.foldCount) {
          updateSettings({ foldCount: next });
          flash('已保存：折叠 ' + next + ' 条');
        }
      }, [countText, flash]);

      return h(
        'div',
        { style: { padding: '20px 22px', maxWidth: 760, margin: '0 auto' } },

        h(
          'div',
          { style: { marginBottom: 18 } },
          h('div', { style: { fontSize: 17, fontWeight: 600, marginBottom: 4 } }, '界面设置'),
          h(
            'div',
            { style: { fontSize: 12.5, color: MUTED, lineHeight: 1.6 } },
            '这些设置只影响你自己的浏览器，不会影响其他成员。',
          ),
        ),

        h(
          Row,
          {
            title: '折叠较早消息',
            desc: '打开对话时只显示最近的若干条消息，更早的收起来；思考过程不计入条数。',
            checked: view.foldEnabled,
            onChange: (value) => updateSettings({ foldEnabled: value }),
          },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
            h('span', { style: { fontSize: 13 } }, '显示最近'),
            h('input', {
              type: 'number',
              min: MIN_COUNT,
              max: MAX_COUNT,
              step: 1,
              inputMode: 'numeric',
              value: countText,
              'aria-label': '折叠条数',
              style: inputStyle,
              onChange: (event) => setCountText(event.target.value),
              onBlur: commitCount,
              onKeyDown: (event) => {
                event.stopPropagation();
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitCount();
                  event.currentTarget.blur();
                }
              },
            }),
            h('span', { style: { fontSize: 13, color: MUTED } }, '条消息（5–200）'),
          ),
          h(
            'div',
            { style: { marginTop: 10, fontSize: 12, color: MUTED, lineHeight: 1.6 } },
            '折叠后，对话顶部会出现一个浮动的「展开」按钮，点一次多显示一批；也可以点「全部展开」。',
          ),
        ),

        h(
          'div',
          {
            style: {
              marginTop: 16,
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px dashed ' + LINE,
              fontSize: 12.5,
              lineHeight: 1.7,
              color: MUTED,
            },
          },
          h('div', { style: { fontWeight: 600, color: 'inherit', marginBottom: 6 } }, '说明'),
          '设置保存在本机浏览器（localStorage），刷新或重启后保持。' +
            '折叠只隐藏 DOM 上我们自己加的属性，不删除任何消息；' +
            '删除会话不可恢复，操作前需要勾选确认。',
        ),

        h(RepoInvite, { key: 'repo' }),

        notice ? h('div', { style: { marginTop: 10, fontSize: 12, color: MUTED } }, notice) : null,
      );
    }

    /* ------------------------------------------------------------------ *
     * plugin entry
     * ------------------------------------------------------------------ */

    function apply(ctx) {
      startRuntime();

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          { name: 'sidebar.panellist', id: NS, order: 16, locale: NS, label: () => '对话设置' },
          Icon,
        ),
      );
      ctx.slots.inject('main', () =>
        ctx.slots.register({ name: 'main', key: NS, locale: NS }, Panel),
      );

      ctx.slots.inject('sidebar.workspaces.session.menu.item', () =>
        ctx.slots.register(
          { name: 'sidebar.workspaces.session.menu.item', id: 'fold-delete-session', order: 510 },
          DeleteItem,
        ),
      );
      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register({ name: 'shell.overlay', id: 'fold-delete-dialog' }, () =>
          h(React.Fragment, null, h(Dialog), h(Toaster)),
        ),
      );
    }

    return { apply, inject: ['slots'] };
  },
});
