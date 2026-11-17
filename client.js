window.__ModuleLoader__.load({
  id: 'dsh-plugin-updater',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dshPluginUpdater'

    const DICT = {
      zh: {
        tab: '更新',
        title: '批量更新插件',
        intro: '只更新从 npm 安装的插件。Git 副本和随 DSH 发布的插件不在此列。',
        checking: '正在检查更新…',
        available: '{count} 个插件可更新',
        upToDate: '所有插件均为最新版本',
        updateAll: '全部更新 {count} 个',
        updating: '正在更新…',
        summary: '完成：{done} 个成功，{failed} 个失败',
        installed: '已安装 {version}',
        noCandidate: '没有可直接安装的新版本',
        git: 'Git 副本，请在插件页逐个更新',
        idle: '待更新',
        running: '更新中…',
        done: '已更新',
        restart: '已安装，重启 DSH 后生效',
        failed: '更新失败：{reason}',
        empty: '没有已安装的插件。',
      },
      en: {
        tab: 'Updates',
        title: 'Bulk plugin updates',
        intro: 'Updates plugins installed from npm only. Git copies and plugins shipped with DSH are left alone.',
        checking: 'Checking for updates…',
        available: '{count} plugin(s) can be updated',
        upToDate: 'All plugins are up to date',
        updateAll: 'Update all {count}',
        updating: 'Updating…',
        summary: 'Done: {done} succeeded, {failed} failed',
        installed: 'installed {version}',
        noCandidate: 'No newer version can be installed',
        git: 'Git copy; update it from the Plugins page',
        idle: 'Pending',
        running: 'Updating…',
        done: 'Updated',
        restart: 'Installed; takes effect after a DSH restart',
        failed: 'Update failed: {reason}',
        empty: 'No plugins are installed.',
      },
    }

    // Same rule the Plugins page applies to one bundle (ui-plugin-manager `updateCandidate`):
    // the newest listed version that declares a bundle, fits this DSH, is not deprecated and is not a prerelease.
    function updateCandidate(list) {
      if (list === undefined || list.status !== 'listed') return undefined
      return list.versions.find(version => version.bundle
        && version.incompatible === undefined
        && version.deprecated === undefined
        && !version.prerelease)
    }

    /** Remote reads and one update step; the component owns all rendered state. */
    function createUpdater(ctx) {
      return {
        /** Installed bundles the Host can replace, each with its target version when one exists. */
        async scan(onProgress) {
          const answer = await ctx.remote.pluginManager.listBundles()
          if (!answer.ok) throw new Error(answer.error.message)
          const rows = answer.value
            .filter(bundle => bundle.installed && bundle.update !== undefined)
            .map(bundle => ({
              name: bundle.name,
              from: bundle.version ?? '',
              kind: bundle.update === 'git' ? 'git' : 'none',
              status: 'idle',
            }))
          onProgress(rows.slice())
          for (const row of rows) {
            if (row.kind === 'git') continue
            const list = await ctx.remote.pluginManager.listVersions(row.name, {})
            const target = list.ok ? updateCandidate(list.value) : undefined
            row.kind = target === undefined ? 'none' : 'registry'
            row.to = target?.version
            onProgress(rows.slice())
          }
          return rows
        },
        /** Replace one bundle; the Host keeps the old version when the new one fails to install. */
        async update(name, version) {
          const answer = await ctx.remote.pluginManager.updateBundle(name, version, {})
          if (!answer.ok) return { status: 'failed', reason: answer.error.message }
          const result = answer.value.result
          if (result.application === 'applied') return { status: 'done', to: answer.value.to }
          if (result.application === 'restart-required') return { status: 'restart', to: answer.value.to }
          return { status: 'failed', reason: result.error?.code ?? result.application }
        },
      }
    }

    const ROW = {
      display: 'flex',
      alignItems: 'baseline',
      gap: '12px',
      padding: '12px 0',
      borderBottom: '0.5px solid var(--dsw-alias-border-l1)',
    }
    const NAME = {
      flex: '1 1 auto',
      minWidth: '0',
      fontSize: '14px',
      lineHeight: '22px',
      color: 'var(--dsw-alias-label-primary)',
      overflowWrap: 'anywhere',
    }
    const META = {
      flex: '0 0 auto',
      fontSize: '12px',
      lineHeight: '20px',
      color: 'var(--dsw-alias-label-secondary)',
      fontVariantNumeric: 'tabular-nums',
    }
    const STATUS_COLOR = {
      idle: 'var(--dsw-alias-label-secondary)',
      running: 'var(--dsw-alias-label-secondary)',
      done: 'var(--dsw-alias-state-success-primary)',
      restart: 'var(--dsw-alias-state-warn-primary)',
      failed: 'var(--dsw-alias-state-error-primary)',
    }

    function Status({ row, t }) {
      const key = row.status === 'failed' ? 'failed' : row.status
      const text = key === 'failed'
        ? t('failed', { reason: row.reason ?? '' })
        : t(key)
      return h('span', { style: { ...META, color: STATUS_COLOR[row.status] } }, text)
    }

    function Row({ row, t }) {
      const settled = row.status === 'done' || row.status === 'restart'
      const detail = row.kind !== 'registry'
        ? t(row.kind === 'git' ? 'git' : 'noCandidate')
        : settled
          ? t('installed', { version: row.from })
          : `${row.from} → ${row.to}`
      return h('div', { style: ROW }, [
        h('span', { key: 'name', style: NAME }, row.name),
        h('span', { key: 'detail', style: META }, detail),
        row.kind === 'registry' ? h(Status, { key: 'status', row, t }) : null,
      ])
    }

    function UpdateAllSection(props) {
      const { t, updater } = props
      const [rows, setRows] = React.useState([])
      const [phase, setPhase] = React.useState('checking')
      const [error, setError] = React.useState('')
      const [summary, setSummary] = React.useState('')

      const scan = React.useCallback(() => {
        let alive = true
        setPhase('checking')
        setError('')
        setSummary('')
        updater.scan(next => { if (alive) setRows(next) })
          .then(next => { if (alive) { setRows(next); setPhase('ready') } })
          .catch(err => { if (alive) { setError(String(err?.message ?? err)); setPhase('ready') } })
        return () => { alive = false }
      }, [updater])

      React.useEffect(scan, [scan])

      const targets = rows.filter(row => row.kind === 'registry')
      const busy = phase === 'checking' || phase === 'updating'

      const updateAll = async () => {
        if (busy || targets.length === 0) return
        setPhase('updating')
        setSummary('')
        let done = 0
        let failed = 0
        for (const target of targets) {
          setRows(prev => prev.map(row => (row.name === target.name ? { ...row, status: 'running' } : row)))
          const outcome = await updater.update(target.name, target.to)
          setRows(prev => prev.map(row => (row.name === target.name
            ? { ...row, status: outcome.status, reason: outcome.reason, from: outcome.to ?? row.from }
            : row)))
          if (outcome.status === 'failed') failed += 1
          else done += 1
        }
        setSummary(t('summary', { done: String(done), failed: String(failed) }))
        setPhase('ready')
      }

      const note = error !== ''
        ? { text: error, color: 'var(--dsw-alias-state-error-primary)' }
        : phase === 'checking'
          ? { text: t('checking'), color: 'var(--dsw-alias-label-secondary)' }
          : phase === 'updating'
            ? { text: t('updating'), color: 'var(--dsw-alias-label-secondary)' }
            : summary !== ''
              ? { text: summary, color: 'var(--dsw-alias-label-primary)' }
              : targets.length > 0
                ? { text: t('available', { count: String(targets.length) }), color: 'var(--dsw-alias-label-primary)' }
                : { text: t('upToDate'), color: 'var(--dsw-alias-label-secondary)' }

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px 0' } }, [
        h('div', { key: 'head', style: { display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '12px' } }, [
          h('div', { key: 'text', style: { flex: '1 1 auto', minWidth: '0' } }, [
            h('div', {
              key: 'title',
              style: { fontSize: '15px', lineHeight: '22px', fontWeight: '600', color: 'var(--dsw-alias-label-primary)' },
            }, t('title')),
            h('div', {
              key: 'note',
              style: { fontSize: '13px', lineHeight: '20px', color: note.color },
            }, note.text),
            h('div', {
              key: 'intro',
              style: { fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' },
            }, t('intro')),
          ]),
          h('button', {
            key: 'action',
            type: 'button',
            disabled: busy || targets.length === 0,
            onClick: () => { void updateAll() },
            style: {
              flex: '0 0 auto',
              height: '32px',
              padding: '0 16px',
              font: 'inherit',
              fontSize: '14px',
              lineHeight: '22px',
              borderRadius: '8px',
              border: '1px solid var(--dsw-alias-brand-primary)',
              background: 'transparent',
              color: targets.length === 0 || busy
                ? 'var(--dsw-alias-label-secondary)'
                : 'var(--dsw-alias-brand-primary)',
              borderColor: targets.length === 0 || busy
                ? 'var(--dsw-alias-border-l2)'
                : 'var(--dsw-alias-brand-primary)',
              cursor: targets.length === 0 || busy ? 'default' : 'pointer',
            },
          }, t('updateAll', { count: String(targets.length) })),
        ]),
        rows.length === 0
          ? h('div', { key: 'empty', style: { ...META, padding: '8px 0' } }, t('empty'))
          : rows.map(row => h(Row, { key: row.name, row, t })),
      ])
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.pluginManager'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        const updater = createUpdater(ctx)
        ctx.effect(() => ctx.locale.register(NS, DICT), 'plugin-updater: dictionaries')
        ctx.slots.inject('plugins.tab', () => ctx.slots.register({
          name: 'plugins.tab',
          id: 'update-all',
          order: 1,
          label: () => t('tab'),
          locale: NS,
          inject: () => ({ updater }),
        }, UpdateAllSection))
      },
    }
  },
})
