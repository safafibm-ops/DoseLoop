// Draws the app icons (no extra libraries): orange square + 4 dose-coloured dots.
// Run: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td))
  return Buffer.concat([len, td, c])
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const bg = hex('#ff6a13')
const dots = ['#9fd3c7', '#7a7d3a', '#6b3f1d', '#1b1b1b'].map(hex)

function icon(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1))
  const r = size * 0.11
  const cy = size / 2
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      let px = bg
      dots.forEach((col, i) => {
        const cx = size * (0.2 + i * 0.2)
        if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) px = col
      })
      raw.set(px, y * (size * 3 + 1) + 1 + x * 3)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const s of [192, 512]) writeFileSync(`public/icon-${s}.png`, icon(s))
writeFileSync('public/apple-touch-icon.png', icon(180))
console.log('icons written')
