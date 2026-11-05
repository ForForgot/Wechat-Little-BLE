const KEY = 'ble_logs'
const MAX = 400

function pad(n) {
  return n < 10 ? '0' + n : String(n)
}

function timestamp() {
  const d = new Date()
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) +
    '.' + ('00' + d.getMilliseconds()).slice(-3)
}

let entries = []
try {
  entries = wx.getStorageSync(KEY) || []
} catch (e) {
  entries = []
}

const listeners = []
let persistTimer = null

function persist() {
  if (persistTimer) return
  persistTimer = setTimeout(function () {
    persistTimer = null
    try {
      wx.setStorageSync(KEY, entries.slice(0, MAX))
    } catch (e) {
      // 存储配额不足时只保留内存日志
    }
  }, 800)
}

function notify() {
  const copy = entries.slice()
  for (let i = 0; i < listeners.length; i++) {
    try {
      listeners[i](copy)
    } catch (e) {
      // 单个订阅者异常不影响其他订阅者
    }
  }
}

function add(entry) {
  const item = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    time: timestamp(),
    dir: entry.dir || 'system',
    type: entry.type || 'info',
    title: entry.title || '',
    data: entry.data || '',
    ok: entry.ok !== false
  }
  entries.unshift(item)
  if (entries.length > MAX) entries.length = MAX
  persist()
  notify()
  return item
}

module.exports = {
  add: add,

  info: function (tag, title, data) {
    return add({ dir: 'system', type: 'info', title: '[' + tag + '] ' + title, data: data || '' })
  },

  warn: function (tag, title, data) {
    return add({ dir: 'system', type: 'state', title: '[' + tag + '] ' + title, data: data || '' })
  },

  error: function (tag, title, data) {
    return add({ dir: 'system', type: 'error', title: '[' + tag + '] ' + title, data: data || '', ok: false })
  },

  tx: function (title, data) {
    return add({ dir: 'out', type: 'write', title: title, data: data || '' })
  },

  rx: function (title, data) {
    return add({ dir: 'in', type: 'notify', title: title, data: data || '' })
  },

  list: function () {
    return entries.slice()
  },

  clear: function () {
    entries = []
    try {
      wx.setStorageSync(KEY, [])
    } catch (e) {
      // ignore
    }
    notify()
  },

  subscribe: function (fn) {
    if (listeners.indexOf(fn) < 0) listeners.push(fn)
    return function () {
      const i = listeners.indexOf(fn)
      if (i >= 0) listeners.splice(i, 1)
    }
  },

  unsubscribe: function (fn) {
    const i = listeners.indexOf(fn)
    if (i >= 0) listeners.splice(i, 1)
  }
}
