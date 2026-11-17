# dsh-plugin-updater

A DeepSeek Harness (DSH) plugin that adds an **Updates** tab to the Plugins page, with one button that updates every registry-installed plugin.

## What it does

- Lists every installed plugin the Host can replace, with its installed version and the version it would move to.
- **Update all** replaces them one by one through `pluginManager.updateBundle`, showing each row's state: pending, updating, updated, restart required, or the failure reason.
- Version selection follows the Plugins page's own rule: the newest listed version that declares a bundle, accepts the running DSH, is not deprecated, and is not a prerelease.

## What it leaves alone

- **Git copies** are listed but not updated: replacing one needs the target version's Git spec, which only the Plugins page's per-plugin update dialog collects.
- **Plugins shipped with DSH** and **local directory installs** (`link:`) carry no `update` field, so they never appear in the list. This also means the plugin never updates itself.

## Install

The repository root *is* the bundle directory. Install it either way:

- **Plugin Manager**: **Settings → Plugins → Add plugin**, type the absolute path of this checkout, then enable it.
- **Agent**: the `plugin_manager` tool's `install_bundle` action with that same absolute path.

Then open **Settings → Plugins → Updates**.

## Behaviour worth knowing

- Each update removes the installed version and installs the target, so that plugin stops briefly. When a target fails to install, the Host reinstalls the removed version; already-updated plugins are not rolled back.
- A successful update saves the dependency as an **exact version** in the profile (a `^` range becomes a pin), and the reinstalled bundle joins the end of the selection, which can change which bundle's configuration wins.
- Updates are sequential and offer no cancel: the list itself is the confirmation.

## Layout

| File | Role |
| --- | --- |
| `index.js` | Host half. Registers nothing: every action goes through the existing `pluginManager` Host service from the Client half. |
| `client.js` | Client half. Registers the `update-all` entry into the `plugins.tab` slot and renders the tab. |
| `cordis.patch.yml` | Bundle layer: inserts the one plugin row. |
| `locale/*.json` | Plugin title and description shown by the Plugin Manager before activation. |
