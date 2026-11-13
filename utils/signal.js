const ble = require('./ble.js')

const MAX_SAMPLES = 90
const MIN_INTERVAL = 500
const RSSI_MIN = -110
const RSSI_MAX = -30

const histories = {}
const listeners = []
let lastPrune = 0

function notify() {
  for (let i = 0; i < listeners.length; i++) {
    try { listeners[i]() } catch (e) { /* ignore */ }
  }
}

// 全局只订阅一次，页面切换不会丢采样
ble.on('devices', function (devices) {
  const now = Date.now()
  let changed = false
  for (let i = 0; i < devices.length; i++) {
    const d = devices[i]
    if (!d || !d.deviceId || typeof d.RSSI !== 'number') continue
    const arr = histories[d.deviceId] || (histories[d.deviceId] = [])
    const last = arr[arr.length - 1]
    if (last && now - last.t < MIN_INTERVAL) {
      last.v = d.RSSI
    } else {
      arr.push({ t: now, v: d.RSSI })
      if (arr.length > MAX_SAMPLES) arr.shift()
    }
    changed = true
  }
  // 长时间扫描时设备数会不断累积，每分钟清理一次过期历史
  if (now - lastPrune > 60000) {
    lastPrune = now
    prune()
  }
  if (changed) notify()
})

function history(deviceId) {
  return (histories[deviceId] || []).slice()
}

function stats(deviceId) {
  const arr = histories[deviceId] || []
  if (!arr.length) {
    return { count: 0, current: 0, min: 0, max: 0, avg: 0, span: 0 }
  }
  let min = arr[0].v
  let max = arr[0].v
  let sum = 0
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].v < min) min = arr[i].v
    if (arr[i].v > max) max = arr[i].v
    sum += arr[i].v
  }
  return {
    count: arr.length,
    current: arr[arr.length - 1].v,
    min: min,
    max: max,
    avg: Math.round(sum / arr.length),
    span: arr.length > 1 ? Math.round((arr[arr.length - 1].t - arr[0].t) / 1000) : 0
  }
}

// 供列表内迷你趋势图使用：把 RSSI 映射到 0-100 的高度百分比
function spark(deviceId, count) {
  const arr = histories[deviceId] || []
  const n = count || 24
  const samples = arr.slice(-n)
  return samples.map(function (s) {
    const ratio = (s.v - RSSI_MIN) / (RSSI_MAX - RSSI_MIN)
    return { v: s.v, h: Math.max(8, Math.min(100, Math.round(ratio * 100))) }
  })
}

function clear(deviceId) {
  delete histories[deviceId]
  notify()
}

function clearAll() {
  Object.keys(histories).forEach(function (k) { delete histories[k] })
  notify()
}

function prune(maxAge) {
  const now = Date.now()
  const age = maxAge || 300000
  Object.keys(histories).forEach(function (id) {
    const arr = histories[id]
    if (!arr.length || now - arr[arr.length - 1].t > age) delete histories[id]
  })
}

module.exports = {
  RSSI_MIN: RSSI_MIN,
  RSSI_MAX: RSSI_MAX,
  history: history,
  stats: stats,
  spark: spark,
  clear: clear,
  clearAll: clearAll,
  prune: prune,
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
