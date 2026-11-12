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

Session context menu → "删除会话" → tick the confirmation → the session is gone.

Four steps, in order:

1. stop a possibly running session (`flush` + `dispose`)
2. remove the session directory (both `session-<uuid>` and bare `<uuid>` layouts)
3. drop it from the workspace index (`workspace.json`: archived / pinned / per-workspace)
4. emit `api-session/removed` so the list refreshes

Nothing is recoverable, which is why the API requires `confirm: true` and the UI
asks twice.

## Theming

The dialog samples the real page background brightness instead of relying on
`--dsw-alias-bg-primary` (that variable does not exist in the Harness theme, and
referencing it silently falls back to the dark palette).

## Install

### Plugin marketplace

Search for `dsh-fold-delete` in the Harness plugin marketplace and install it.

### Release tarball

```bash
dsh plugin --profile web add ./dsh-fold-delete-1.0.0.tgz
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
