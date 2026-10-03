// Exposure limits and status bands. Sources: docs/MASTER.md section 1.
import SPEC from '../scan/podSpec.json'
import { hexToRgb, interp, labToRgb, rgbToHex, rgbToLab } from '../scan/color.js'

export const LIMITS = {
  shiftIndia: 80, // ppm·hr per 8-hour shift (Factories Act: 10 ppm TWA × 8 h)
  shiftAcgih: 8, // ppm·hr per 8-hour shift (ACGIH: 1 ppm TWA × 8 h, stricter)
  shiftHours: 8,
}

export const CAPACITY = SPEC.capacity_ppmh
export const RETIRE_AT = SPEC.retire_fraction
export const IN_USE_DAYS = SPEC.in_use_days
export const SHELF_DAYS = SPEC.shelf_days

// Status of one shift dose. Colours are the fixed status palette; always shown with icon + label.
export const STATUS = {
  ok: { label: 'Safe', icon: '✓', color: '#0ca30c' },
  caution: { label: 'Caution', icon: '!', color: '#fab219' },
  over: { label: 'Over limit', icon: '✕', color: '#d03b3b' },
}

export function shiftStatus(dose) {
  if (dose > LIMITS.shiftIndia) return 'over'
  if (dose >= LIMITS.shiftIndia / 2) return 'caution'
  return 'ok'
}

// Placeholder ink colour after `dose` ppm·hr (straight lines in Lab between the spec anchors).
const INK_LABS = SPEC.ink.colors.map((c) => rgbToLab(hexToRgb(c)))
export function inkHex(dose) {
  const d = Math.max(0, Math.min(dose, SPEC.ink.doses[SPEC.ink.doses.length - 1]))
  const lab = [0, 1, 2].map((k) => interp(d, SPEC.ink.doses, INK_LABS.map((l) => l[k])))
  return rgbToHex(labToRgb(lab))
}
