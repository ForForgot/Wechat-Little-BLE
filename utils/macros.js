const KEY = 'ble_macros'

function uid() {
  return Date.now() + '-' + Math.random().toString(36).slice(2, 7)
}

function persist() {
  try { wx.setStorageSync(KEY, items) } catch (e) { /* ignore */ }
}

let items = []
try { items = wx.getStorageSync(KEY) || [] } catch (e) { items = [] }

function stepLabel(step) {
  switch (step.type) {
    case 'write': return step.name ? '写入 · ' + step.name : '写入'
    case 'delay': return '延时'
    case 'read': return '读取'
    case 'notify': return '订阅开关'
    default: return '未知步骤'
  }
}

function describeStep(step) {
  switch (step.type) {
    case 'write': return String(step.value || '').slice(0, 40) + '  [' + (step.format || 'HEX') + ']'
    case 'delay': return (step.ms || 0) + ' ms'
    case 'read': return '读取 ' + (step.characteristicUuid || '运行目标')
    case 'notify': return (step.enable === false ? '关闭 ' : '开启 ') + (step.characteristicUuid || '运行目标')
    default: return ''
  }
}

function decorate(step) {
  return Object.assign({}, step, {
    label: stepLabel(step),
    detail: describeStep(step)
  })
}

function list() {
  return items.slice()
}

function get(id) {
  return items.filter(function (m) { return m.id === id })[0] || null
}

function add(name) {
  const item = { id: uid(), name: String(name || '').trim() || '未命名宏', steps: [], createdAt: Date.now() }
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
  items = items.filter(function (m) { return m.id !== id })
  persist()
}

function addStep(id, step) {
  const macro = get(id)
  if (!macro) return null
  macro.steps.push(Object.assign({}, step))
  persist()
  return macro
}

function removeStep(id, index) {
  const macro = get(id)
  if (!macro) return null
  macro.steps.splice(index, 1)
  persist()
  return macro
}

function moveStep(id, index, direction) {
  const macro = get(id)
  if (!macro) return null
  const next = index + direction
  if (next < 0 || next >= macro.steps.length) return null
  const tmp = macro.steps[index]
  macro.steps[index] = macro.steps[next]
  macro.steps[next] = tmp
  persist()
  return macro
}

function clearSteps(id) {
  const macro = get(id)
  if (!macro) return null
  macro.steps = []
  persist()
  return macro
}

function clear() {
  items = []
  persist()
}

module.exports = {
  list: list,
  get: get,
  add: add,
  update: update,
  remove: remove,
  addStep: addStep,
  removeStep: removeStep,
  moveStep: moveStep,
  clearSteps: clearSteps,
  clear: clear,
  decorate: decorate,
  stepLabel: stepLabel,
  describeStep: describeStep
}
