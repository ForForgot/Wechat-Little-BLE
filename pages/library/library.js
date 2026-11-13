const app = getApp()
const commandStore = require('../../utils/commands.js')
const macroStore = require('../../utils/macros.js')
const formatUtil = require('../../utils/format.js')

const FORMATS = ['HEX', 'UTF8', 'DEC', 'BIN']

function prompt(title, placeholder, value, cb) {
  wx.showModal({
    title: title,
    editable: true,
    placeholderText: placeholder,
    content: String(value === undefined ? '' : value),
    success: function (res) {
      if (res.confirm) cb(String(res.content || '').trim())
    }
  })
}

function parseUuidPair(input) {
  const text = String(input || '').trim()
  const last = app.getLastTarget()
  // 留空表示两个 UUID 都使用运行时选择的目标特征值
  if (!text) return { serviceUuid: '', characteristicUuid: '' }
  const parts = text.split('/')
  if (parts.length >= 2) {
    return { serviceUuid: parts[0].trim(), characteristicUuid: parts[1].trim() }
  }
  return {
    serviceUuid: last.serviceUuid || '',
    characteristicUuid: parts[0].trim()
  }
}

Page({
  data: {
    tab: 'commands',
    formats: FORMATS,
    commands: [],
    macros: [],
    showForm: false,
    formName: '',
    formFormat: 'HEX',
    formValue: '',
    formNoResponse: false,
    expandedMacroId: ''
  },

  onLoad: function () {
    this.refresh()
  },

  onShow: function () {
    this.refresh()
  },

  refresh: function () {
    const commands = commandStore.list().map(function (c) {
      return Object.assign({}, c, { preview: String(c.value || '').slice(0, 60) })
    })
    const macros = macroStore.list().map(function (m) {
      return {
        id: m.id,
        name: m.name,
        stepCount: m.steps.length,
        stepViews: m.steps.map(function (s, i) {
          return Object.assign({ index: i }, macroStore.decorate(s))
        })
      }
    })
    this.setData({ commands: commands, macros: macros })
  },

  switchTab: function (e) {
    this.setData({ tab: e.currentTarget.dataset.tab })
  },

  toggleForm: function () {
    this.setData({ showForm: !this.data.showForm })
  },

  onFormName: function (e) { this.setData({ formName: e.detail.value }) },
  onFormValue: function (e) { this.setData({ formValue: e.detail.value }) },
  onFormFormat: function (e) { this.setData({ formFormat: e.currentTarget.dataset.format }) },
  toggleFormNoResponse: function () { this.setData({ formNoResponse: !this.data.formNoResponse }) },

  saveCommand: function () {
    const name = (this.data.formName || '').trim()
    const value = (this.data.formValue || '').trim()
    if (!name) {
      wx.showToast({ title: '请填写命令名称', icon: 'none' })
      return
    }
    const parsed = formatUtil.parseValue(value, this.data.formFormat)
    if (!parsed.ok) {
      wx.showToast({ title: parsed.error, icon: 'none' })
      return
    }
    const target = app.getLastTarget()
    commandStore.add({
      name: name,
      format: this.data.formFormat,
      value: value,
      writeNoResponse: this.data.formNoResponse,
      serviceUuid: target.serviceUuid,
      characteristicUuid: target.characteristicUuid
    })
    this.setData({ formName: '', formValue: '', formNoResponse: false, showForm: false })
    this.refresh()
    wx.showToast({ title: '已保存', icon: 'success' })
  },

  deleteCommand: function (e) {
    const that = this
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除命令',
      content: '确定删除这条常用命令？',
      success: function (res) {
        if (!res.confirm) return
        commandStore.remove(id)
        that.refresh()
      }
    })
  },

  copyCommand: function (e) {
    const cmd = commandStore.get(e.currentTarget.dataset.id)
    if (!cmd) return
    wx.setClipboardData({ data: cmd.value })
  },

  createMacro: function () {
    const that = this
    prompt('新建宏', '宏名称，如 启动测量流程', '', function (name) {
      if (!name) {
        wx.showToast({ title: '请填写宏名称', icon: 'none' })
        return
      }
      const macro = macroStore.add(name)
      that.setData({ tab: 'macros', expandedMacroId: macro.id })
      that.refresh()
    })
  },

  deleteMacro: function (e) {
    const that = this
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除宏',
      content: '将删除该宏及其全部步骤，此操作不可撤销。',
      success: function (res) {
        if (!res.confirm) return
        macroStore.remove(id)
        that.setData({ expandedMacroId: '' })
        that.refresh()
      }
    })
  },

  toggleMacro: function (e) {
    const id = e.currentTarget.dataset.id
    this.setData({ expandedMacroId: this.data.expandedMacroId === id ? '' : id })
  },

  addCommandStep: function (e) {
    this._pickMacroId = e.currentTarget.dataset.id
    this._pickOffset = 0
    this.pickCommand()
  },

  // actionSheet 最多 6 项，命令多时分页，最后一项用于翻页
  pickCommand: function () {
    const that = this
    const all = commandStore.list()
    if (!all.length) {
      wx.showToast({ title: '请先在常用命令中添加命令', icon: 'none' })
      return
    }
    const offset = this._pickOffset || 0
    const page = all.slice(offset, offset + 5)
    const remain = all.length - offset - page.length
    const items = page.map(function (c) {
      return c.name + ' · ' + String(c.value).slice(0, 16)
    })
    if (remain > 0) items.push('更多命令…（还有 ' + remain + ' 条）')

    wx.showActionSheet({
      itemList: items,
      success: function (res) {
        if (remain > 0 && res.tapIndex === page.length) {
          that._pickOffset = offset + 5
          that.pickCommand()
          return
        }
        const c = page[res.tapIndex]
        if (!c) return
        macroStore.addStep(that._pickMacroId, {
          type: 'write',
          name: c.name,
          format: c.format,
          value: c.value,
          writeNoResponse: c.writeNoResponse,
          serviceUuid: c.serviceUuid,
          characteristicUuid: c.characteristicUuid
        })
        that.refresh()
      },
      fail: function () {}
    })
  },

  addDelayStep: function (e) {
    const that = this
    const macroId = e.currentTarget.dataset.id
    prompt('添加延时', '毫秒数，如 500', '500', function (text) {
      const ms = Number(text)
      if (!text || isNaN(ms) || ms < 0 || ms > 60000) {
        wx.showToast({ title: '请输入 0-60000 之间的毫秒数', icon: 'none' })
        return
      }
      macroStore.addStep(macroId, { type: 'delay', ms: Math.round(ms) })
      that.refresh()
    })
  },

  addReadStep: function (e) {
    const that = this
    const macroId = e.currentTarget.dataset.id
    const last = app.getLastTarget()
    const fallback = last.serviceUuid && last.characteristicUuid
      ? last.serviceUuid + '/' + last.characteristicUuid
      : ''
    prompt('添加读取', '服务/特征 UUID，如 180F/2A19；留空用运行目标', fallback, function (text) {
      const pair = parseUuidPair(text)
      macroStore.addStep(macroId, {
        type: 'read',
        serviceUuid: pair.serviceUuid,
        characteristicUuid: pair.characteristicUuid
      })
      that.refresh()
    })
  },

  addNotifyStep: function (e) {
    const that = this
    const macroId = e.currentTarget.dataset.id
    const last = app.getLastTarget()
    const fallback = last.serviceUuid && last.characteristicUuid
      ? last.serviceUuid + '/' + last.characteristicUuid
      : ''
    prompt('添加订阅开关', '服务/特征 UUID，如 180D/2A37；留空用运行目标', fallback, function (text) {
      const pair = parseUuidPair(text)
      macroStore.addStep(macroId, {
        type: 'notify',
        enable: true,
        serviceUuid: pair.serviceUuid,
        characteristicUuid: pair.characteristicUuid
      })
      that.refresh()
    })
  },

  toggleStepEnable: function (e) {
    const id = e.currentTarget.dataset.id
    const index = Number(e.currentTarget.dataset.index)
    const macro = macroStore.get(id)
    if (!macro || !macro.steps[index]) return
    if (macro.steps[index].type !== 'notify') {
      wx.showToast({ title: '仅订阅步骤可切换开关', icon: 'none' })
      return
    }
    macro.steps[index].enable = macro.steps[index].enable === false
    macroStore.update(id, { steps: macro.steps })
    this.refresh()
  },

  moveStep: function (e) {
    const id = e.currentTarget.dataset.id
    const index = Number(e.currentTarget.dataset.index)
    const dir = Number(e.currentTarget.dataset.dir)
    macroStore.moveStep(id, index, dir)
    this.refresh()
  },

  removeStep: function (e) {
    const id = e.currentTarget.dataset.id
    const index = Number(e.currentTarget.dataset.index)
    macroStore.removeStep(id, index)
    this.refresh()
  },

  clearSteps: function (e) {
    const that = this
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '清空步骤',
      content: '将移除该宏的全部步骤。',
      success: function (res) {
        if (!res.confirm) return
        macroStore.clearSteps(id)
        that.refresh()
      }
    })
  }
})
