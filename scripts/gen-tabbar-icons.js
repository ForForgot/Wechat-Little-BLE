const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

const W = 81
const H = 81

let crcTable = null
function makeCrcTable() {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
}
function crc32(buf) {
  if (!crcTable) crcTable = makeCrcTable()
  let c = -1
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([len, t, data, crc])
}
function encode(rgba) {
  const stride = W * 4 + 1
  const raw = Buffer.alloc(stride * H)
  for (let y = 0; y < H; y++) {
    raw[y * stride] = 0
    rgba.copy(raw, y * stride + 1, y * W * 4, (y + 1) * W * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function createCanvas() {
  const buf = Buffer.alloc(W * H * 4)
  function set(x, y, col) {
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= W || y >= H) return
    const i = (y * W + x) * 4
    buf[i] = col[0]
    buf[i + 1] = col[1]
    buf[i + 2] = col[2]
    buf[i + 3] = 255
  }
  function disc(cx, cy, r, col) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) set(x, y, col)
      }
    }
  }
  function ring(cx, cy, r, t, col) {
    const inner = r - t / 2
    const outer = r + t / 2
    for (let y = cy - outer; y <= cy + outer; y++) {
      for (let x = cx - outer; x <= cx + outer; x++) {
        const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy)
        if (d2 >= inner * inner && d2 <= outer * outer) set(x, y, col)
      }
    }
  }
  function roundRect(x0, y0, w, h, r, col) {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const dx = Math.min(x - x0, x0 + w - 1 - x)
        const dy = Math.min(y - y0, y0 + h - 1 - y)
        if (dx < r && dy < r) {
          const d = Math.hypot(r - dx, r - dy)
          if (d > r) continue
        }
        set(x, y, col)
      }
    }
  }
  function hline(x0, x1, y, t, col) {
    for (let x = x0; x <= x1; x++) {
      for (let k = -Math.floor(t / 2); k <= Math.ceil(t / 2); k++) set(x, y + k, col)
    }
  }
  return { buf, set, disc, ring, roundRect, hline }
}

const ICONS = {
  scan: function (c, col) {
    c.ring(40, 40, 30, 6, col)
    c.ring(40, 40, 19, 6, col)
    c.disc(40, 40, 5, col)
  },
  library: function (c, col) {
    c.roundRect(14, 14, 22, 22, 5, col)
    c.roundRect(45, 14, 22, 22, 5, col)
    c.roundRect(14, 45, 22, 22, 5, col)
    c.roundRect(45, 45, 22, 22, 5, col)
  },
  logs: function (c, col) {
    ;[24, 40, 56].forEach(function (y) {
      c.disc(17, y, 4, col)
      c.hline(30, 66, y, 5, col)
    })
  },
  settings: function (c, col) {
    c.hline(14, 66, 24, 4, col)
    c.hline(14, 66, 40, 4, col)
    c.hline(14, 66, 56, 4, col)
    c.disc(30, 24, 7, col)
    c.disc(52, 40, 7, col)
    c.disc(38, 56, 7, col)
  }
}

const COLORS = {
  normal: [138, 144, 153],
  activeLight: [24, 95, 165],
  activeDark: [106, 169, 233]
}

const outDir = path.join(process.cwd(), 'images', 'tabbar')
fs.mkdirSync(outDir, { recursive: true })

Object.keys(ICONS).forEach(function (name) {
  const variants = [
    { file: name + '.png', color: COLORS.normal },
    { file: name + '-active.png', color: COLORS.activeLight },
    { file: name + '-active-dark.png', color: COLORS.activeDark }
  ]
  variants.forEach(function (v) {
    const c = createCanvas()
    ICONS[name](c, v.color)
    const png = encode(c.buf)
    fs.writeFileSync(path.join(outDir, v.file), png)
    console.log(v.file, png.length + ' bytes')
  })
})
