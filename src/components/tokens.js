// Colours that JavaScript needs directly (SVG fills, inline bars). Keep in sync with :root in index.css.
export const TONE = {
  ok: '#1b8a47',
  caution: '#e3a008',
  over: '#c8231e',
  serious: '#c4560f',
  info: '#1f5fad',
  track: '#dde3e8',
}

// Status / severity → visual tone class used by chips, bands and borders.
export const STATUS_TONE = { ok: 'ok', caution: 'caution', over: 'over' }
export const SEVERITY_TONE = { critical: 'over', serious: 'serious', warning: 'caution' }

// Icon names (see Icon in ui.jsx) that go with each status, so meaning never depends on colour alone.
export const STATUS_ICON = { ok: 'check', caution: 'alert', over: 'stop' }
export const SEVERITY_ICON = { critical: 'stop', serious: 'alert', warning: 'alert' }
