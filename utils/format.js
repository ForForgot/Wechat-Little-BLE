function toHex(buffer, sep) {
  if (!buffer) return ''
  const bytes = new Uint8Array(buffer)
  const arr = []
  for (let i = 0; i < bytes.length; i++) {
    arr.push(('0' + bytes[i].toString(16)).slice(-2).toUpperCase())
  }
  return arr.join(sep === undefined ? ' ' : sep)
}

function normalizeHex(str) {
  return String(str || '')
    .replace(/0x/gi, '')
    .replace(/[\s,\-_:]/g, '')
}

function hexToArrayBuffer(str) {
  const hex = normalizeHex(str)
  if (!hex) return { ok: false, error: '请输入内容' }
  if (!/^[0-9a-fA-F]+$/.test(hex)) return { ok: false, error: '仅允许 0-9、A-F 的十六进制字符' }
  if (hex.length % 2 !== 0) return { ok: false, error: '十六进制长度必须为偶数' }
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return { ok: true, buffer: bytes.buffer, length: bytes.length }
}

function utf8Decode(buffer) {
  const bytes = new Uint8Array(buffer || new ArrayBuffer(0))
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    if (b < 0x80) {
      out += String.fromCharCode(b)
    } else if (b >= 0xC0 && b < 0xE0 && i + 1 < bytes.length) {
      out += String.fromCharCode(((b & 0x1F) << 6) | (bytes[i + 1] & 0x3F))
      i++
    } else if (b >= 0xE0 && b < 0xF0 && i + 2 < bytes.length) {
      out += String.fromCharCode(((b & 0x0F) << 12) | ((bytes[i + 1] & 0x3F) << 6) | (bytes[i + 2] & 0x3F))
      i += 2
    } else {
      out += '\\x' + ('0' + b.toString(16)).slice(-2).toUpperCase()
    }
  }
  return out
}

function utf8Encode(str) {
  const bytes = []
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    if (c < 0x80) {
      bytes.push(c)
    } else if (c < 0x800) {
      bytes.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F))
    } else {
      bytes.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F))
    }
  }
  return new Uint8Array(bytes).buffer
}

function toDecimal(buffer) {
  const bytes = new Uint8Array(buffer || new ArrayBuffer(0))
  return Array.prototype.map.call(bytes, function (b) { return b }).join(' ')
}

function toBinary(buffer) {
  const bytes = new Uint8Array(buffer || new ArrayBuffer(0))
  return Array.prototype.map.call(bytes, function (b) {
    return ('00000000' + b.toString(2)).slice(-8)
  }).join(' ')
}

function decimalToArrayBuffer(str) {
  const parts = String(str || '').trim().split(/[\s,]+/).filter(function (s) { return s.length > 0 })
  if (!parts.length) return { ok: false, error: '请输入内容' }
  const bytes = []
  for (let i = 0; i < parts.length; i++) {
    if (!/^\d+$/.test(parts[i])) return { ok: false, error: '十进制格式仅允许 0-255 的整数' }
    const n = parseInt(parts[i], 10)
    if (n < 0 || n > 255) return { ok: false, error: '每个字节必须在 0-255 之间' }
    bytes.push(n)
  }
  return { ok: true, buffer: new Uint8Array(bytes).buffer, length: bytes.length }
}

function binaryToArrayBuffer(str) {
  const bits = String(str || '').replace(/[^01]/g, '')
  if (!bits) return { ok: false, error: '请输入内容' }
  if (bits.length % 8 !== 0) return { ok: false, error: '二进制长度必须为 8 的倍数' }
  const bytes = new Uint8Array(bits.length / 8)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.substr(i * 8, 8), 2)
  }
  return { ok: true, buffer: bytes.buffer, length: bytes.length }
}

function formatValue(buffer, format) {
  switch (format) {
    case 'UTF8': return utf8Decode(buffer)
    case 'DEC': return toDecimal(buffer)
    case 'BIN': return toBinary(buffer)
    default: return toHex(buffer)
  }
}

function parseValue(str, format) {
  switch (format) {
    case 'UTF8': {
      if (!String(str || '').length) return { ok: false, error: '请输入内容' }
      const buffer = utf8Encode(str)
      return { ok: true, buffer: buffer, length: new Uint8Array(buffer).length }
    }
    case 'DEC': return decimalToArrayBuffer(str)
    case 'BIN': return binaryToArrayBuffer(str)
    default: return hexToArrayBuffer(str)
  }
}

function chunkBuffer(buffer, size) {
  const bytes = new Uint8Array(buffer)
  const step = Math.max(1, size)
  const chunks = []
  for (let i = 0; i < bytes.length; i += step) {
    chunks.push(bytes.slice(i, Math.min(i + step, bytes.length)).buffer)
  }
  if (!chunks.length) chunks.push(new ArrayBuffer(0))
  return chunks
}

module.exports = {
  toHex: toHex,
  normalizeHex: normalizeHex,
  hexToArrayBuffer: hexToArrayBuffer,
  utf8Decode: utf8Decode,
  utf8Encode: utf8Encode,
  formatValue: formatValue,
  parseValue: parseValue,
  chunkBuffer: chunkBuffer
}
