# dsh-fold-delete

[中文](README.md) · DeepSeek Harness plugin · MIT

Collapse older messages in long chats, and permanently delete sessions.

## Fold

Long conversations show only the latest N messages (default 20, 5–200). A floating
button at the top of the conversation reveals one more batch, or everything.

- Thinking blocks and tool calls are not counted
- Folding only hides messages: it toggles a `data-dsh-fold-delete` attribute, the
  nodes stay in the DOM and can be expanded at any time
- Recalculated when switching sessions or when new messages arrive

## Delete

The entry point follows the DSH version; one build covers both UIs:

- **0.2.3+**: hover a session row in the sidebar — a trash button appears at the end of
  the row (the new sidebar has no "..." menu at all)
- **0.2.2 and earlier**: session context menu → "删除会话"

Click it, tick the confirmation in the dialog, then "确认删除". Deletion does this:

1. stop a running agent and flush its buffered events
2. detach the session from the host in-memory store, which emits `session/disposed`;
   the official session controller turns that into `api-session/removed` — **skip this
   step and the session comes back on the next reload**
3. remove the session directory (both `session-<uuid>` and bare `<uuid>` layouts). The
   persistence writer closes asynchronously, so the plugin waits for it to go quiet and
   deletes a second time when needed
4. drop the projection cache at `storages/session_projcache/sessions/<id>.json`
5. drop it from `workspace.json`: archived, pinned and every workspace's `sessionIds`
6. prune parent directories that became empty

Nothing is recoverable, which is why the API requires `confirm: true` and the UI asks
twice.

## Theming

The dialog, the row button and the settings panel use Harness theme tokens
(`--dsw-alias-bg-layer-2`, `--dsw-alias-label-primary/secondary/tertiary`,
`--dsw-alias-border-l`, `--dsw-alias-bg-mask-1`, `--dsw-mask-blur`,
`--dsw-elevation-prominent`, `--dsw-radius-*`, `--dsw-alias-state-error-primary`), so
light, dark and system themes all follow automatically — no hard-coded palettes.

## Compatibility

| DSH | Delete entry | Slot used |
| --- | --- | --- |
| 0.2.3+ | Trash button on row hover | `sidebar.workspaces.session.row.action` |
| 0.2.0 – 0.2.2 | Session context menu | `sidebar.workspaces.session.menu.item` |

Both slots are registered and a missing one is skipped safely (`engines.dsh: >=0.2.0`).

## Install

### Plugin marketplace

Search for `dsh-fold-delete` in the Harness plugin marketplace and install it.

### Release tarball

```bash
dsh plugin --profile web add ./dsh-fold-delete-1.2.0.tgz
```

### Manual

```bash
cp -r dsh-fold-delete ~/.dsh/profiles/web/vendor/
# add to ~/.dsh/profiles/web/package.json
#   "dependencies": { "dsh-fold-delete": "file:./vendor/dsh-fold-delete" }
cd ~/.dsh/profiles/web && pnpm install && dsh web
```

Restart the instance after installing.

## Uninstall

Remove it from `dsh.profile.bundles` and `dependencies`, run `pnpm install` and
restart. No data is left behind.

## License

MIT © 2026 困困

---

## About AIGC

> This project contains AIGC (AI-generated) content. AI shortened development time; every line of code was carefully reviewed.
