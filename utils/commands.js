const KEY = 'ble_commands'

function uid() {
  return Date.now() + '-' + Math.random().toString(36).slice(2, 7)
}

function persist() {
  try { wx.setStorageSync(KEY, items) } catch (e) { /* 配额不足时仅保留内存 */ }
}

let items = []
try { items = wx.getStorageSync(KEY) || [] } catch (e) { items = [] }

function list() {
  return items.slice()
}

function get(id) {
  return items.filter(function (c) { return c.id === id })[0] || null
}

function add(cmd) {
  const item = {
    id: uid(),
    name: String(cmd.name || '').trim() || '未命名命令',
    format: cmd.format || 'HEX',
    value: cmd.value || '',
    writeNoResponse: !!cmd.writeNoResponse,
    serviceUuid: cmd.serviceUuid || '',
    characteristicUuid: cmd.characteristicUuid || '',
    createdAt: Date.now()
  }
  items.unshift(item)
  persist()
  return item
}

function update(id, patch) {
  for (let i = 0; i < items.length; i++) {
    if (items[i].id !== id) continue
    items[i] = Object.assign({}, items[i], patch, { id: id })
    persist()
    return items[i]
  }
  return null
}

function remove(id) {
  items = items.filter(function (c) { return c.id !== id })
  persist()
}

function clear() {
  items = []
  persist()
}

function count() {
  return items.length
}

module.exports = {
  list: list,
  get: get,
  add: add,
  update: update,
  remove: remove,
  clear: clear,
  count: count
}
