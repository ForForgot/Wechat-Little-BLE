const app = getApp()
const ble = require('../../utils/ble.js')
const logger = require('../../utils/logger.js')
const format = require('../../utils/format.js')
const uuids = require('../../utils/uuids.js')
const commandStore = require('../../utils/commands.js')
const macroStore = require('../../utils/macros.js')
const runner = require('../../utils/macro-runner.js')

const FORMATS = ['HEX', 'UTF8', 'DEC', 'BIN']

function propertyBadges(props) {
  const out = []
  if (props.read) out.push({ text: 'Read', cls: 'badge-info' })
  if (props.write) out.push({ text: 'Write', cls: 'badge-success' })
  if (props.writeNoResponse) out.push({ text: 'WriteNR', cls: 'badge-success' })
  if (props.notify) out.push({ text: 'Notify', cls: 'badge-warn' })
  if (props.indicate) out.push({ text: 'Indicate', cls: 'badge-warn' })
  return out
}

function mapCharacteristic(c) {
  const props = c.properties || {}
  const short = uuids.displayUuid(c.uuid)
  const name = uuids.nameOf(c.uuid)
  return {
    uuid: c.uuid,
    short: short,
    name: name,
    label: name ? short + ' ' + name : short,
    props: {
      read: !!props.read,
      write: !!props.write,
      writeNoResponse: !!props.writeNoResponse,
      notify: !!props.notify,
      indicate: !!props.indicate
    },
    propBadges: propertyBadges(props),
    canWrite: !!(props.write || props.writeNoResponse),
    canNotify: !!(props.notify || props.indicate),
    notifying: false,
    valueHex: '',
    valueText: '',
    parsed: ''
  }
}

function mapService(s, index) {
  const short = uuids.displayUuid(s.uuid)
  const name = uuids.nameOf(s.uuid)
  return {
    index: index,
    uuid: s.uuid,
    short: short,
    name: name,
    label: name ? short + ' ' + name : short,
    isPrimary: !!s.isPrimary,
    system: uuids.isSystemService(s.uuid),
    expanded: true,
    loaded: false,
    error: '',
    chars: []
  }
}

Page({
  data: {
    deviceId: '',
    deviceName: '未命名设备',
    rssi: '',
    connection: 'disconnected',
    connectionText: '未连接',
    mtu: 23,
    loading: true,
    error: '',
    services: [],
    valueFormat: 'HEX',
    formats: FORMATS,
    recentLogs: [],
    showWritePanel: false,
    writeTargetLabel: '',
    writeFormat: 'HEX',
    writeText: '',
    writeNoResponse: false,
    writeTypeSupported: false,
    savedCommands: [],
    showMacroPanel: false,
    macroList: [],
    macroTargets: [],
    macroTargetLabels: [],
    macroTargetIndex: 0,
    macroTargetLabel: '',
    macroRunning: false,
    macroProgress: ''
  },

  onLoad: function (options) {
    const id = options.deviceId ? decodeURIComponent(options.deviceId) : ''
    const device = app.getActiveDevice() || {}
    this._target = { serviceId: '', characteristicId: '' }
    this._unsub = []
    this._unsub.push(ble.on('state', this.onState.bind(this)))
    this._unsub.push(ble.on('connection', this.onConnection.bind(this)))
    this._unsub.push(ble.on('value', this.onValue.bind(this)))
    this._unsub.push(logger.subscribe(this.onLogs.bind(this)))

    this.setData({
      deviceId: id || device.deviceId || '',
      deviceName: device.name || '未命名设备',
      rssi: typeof device.rssi === 'number' ? device.rssi + ' dBm' : '',
      valueFormat: app.getSettings().defaultFormat || 'HEX',
      recentLogs: logger.list().slice(0, 4)
    })
    this.refreshSavedCommands()

    if (!this.data.deviceId) {
      this.setData({ loading: false, error: '缺少设备 ID，请返回扫描页重新选择设备' })
      return
    }
    this.connectAndDiscover()
  },

  onUnload: function () {
    runner.stop()
    if (this._logTimer) {
      clearTimeout(this._logTimer)
      this._logTimer = null
    }
    this._unsub.forEach(function (fn) { fn() })
    this._unsub = []
    // 只断开连接，保留适配器与全局监听；扫描页 onShow 会直接继续扫描
    ble.closeConnection()
  },

  onState: function (state) {
    this.setData({
      connection: state.connection,
      connectionText: state.connection === 'connected' ? '已连接'
        : state.connection === 'connecting' ? '连接中' : '未连接',
      mtu: state.mtu
    })
  },

  onConnection: function (res) {
    if (!res.connected) {
      this.setData({ error: '连接已断开，可点击下方按钮重新连接' })
    } else {
      this.setData({ error: '' })
    }
  },

  onLogs: function (entries) {
    // 高频 notify 下每条都 setData 会拖慢界面，这里合并到 600ms 一次
    this._pendingLogs = entries
    if (this._logTimer) return
    const that = this
    this._logTimer = setTimeout(function () {
      that._logTimer = null
      if (that._pendingLogs) {
        that.setData({ recentLogs: that._pendingLogs.slice(0, 4) })
      }
    }, 600)
  },

  onValue: function (evt) {
    const services = this.data.services
    for (let i = 0; i < services.length; i++) {
      if (services[i].uuid !== evt.serviceId) continue
      for (let j = 0; j < services[i].chars.length; j++) {
        const c = services[i].chars[j]
        if (c.uuid !== evt.characteristicId) continue
        const patch = {}
        const key = 'services[' + i + '].chars[' + j + ']'
        patch[key + '.valueHex'] = evt.hex
        patch[key + '.valueText'] = format.formatValue(evt.value, this.data.valueFormat)
        patch[key + '.parsed'] = uuids.decodeValue(evt.characteristicId, evt.value)
        this.setData(patch)
        return
      }
    }
  },

  connectAndDiscover: function () {
    const that = this
    const id = this.data.deviceId
    this.setData({ loading: true, error: '', connection: 'connecting', connectionText: '连接中' })

    ble.connect(id)
      .then(function () {
        that.setData({ connection: 'connected', connectionText: '已连接', mtu: ble.getState().mtu })
        return ble.getServices(id)
      })
      .then(function (services) {
        const mapped = services.map(mapService)
        that.setData({ services: mapped })
        return that.loadCharacteristics(mapped)
      })
      .then(function () {
        that.buildMacroTargets()
        that.setData({ loading: false })
      })
      .catch(function (err) {
        that.setData({
          loading: false,
          connection: 'disconnected',
          connectionText: '未连接',
          error: ble.describeError(err)
        })
      })
  },

  loadCharacteristics: function (services) {
    const that = this
    const id = this.data.deviceId
    let chain = Promise.resolve()
    services.forEach(function (svc, index) {
      chain = chain.then(function () {
        return ble.getCharacteristics(id, svc.uuid)
          .then(function (chars) {
            const patch = {}
            patch['services[' + index + '].chars'] = chars.map(mapCharacteristic)
            patch['services[' + index + '].loaded'] = true
            that.setData(patch)
          })
          .catch(function (err) {
            const patch = {}
            patch['services[' + index + '].error'] = ble.describeError(err)
            patch['services[' + index + '].loaded'] = true
            that.setData(patch)
          })
      })
    })
    return chain
  },

  refreshSavedCommands: function () {
    this.setData({ savedCommands: commandStore.list() })
  },

  refreshMacros: function () {
    const list = macroStore.list().map(function (m) {
      return { id: m.id, name: m.name, stepCount: m.steps.length }
    })
    this.setData({ macroList: list })
  },

  buildMacroTargets: function () {
    const targets = []
    const labels = []
    this.data.services.forEach(function (svc) {
      svc.chars.forEach(function (c) {
        const label = svc.short + ' / ' + c.short + (c.name ? ' ' + c.name : '')
        targets.push({ serviceUuid: svc.uuid, characteristicUuid: c.uuid, label: label })
        labels.push(label)
      })
    })
    this.setData({
      macroTargets: targets,
      macroTargetLabels: labels,
      macroTargetIndex: 0,
      macroTargetLabel: labels[0] || ''
    })
  },

  bindServiceToggle: function (e) {
    const index = Number(e.currentTarget.dataset.index)
    const key = 'services[' + index + '].expanded'
    const patch = {}
    patch[key] = !this.data.services[index].expanded
    this.setData(patch)
  },

  bindValueFormat: function (e) {
    const valueFormat = e.currentTarget.dataset.format
    const that = this
    this.setData({ valueFormat: valueFormat })
    // 已收到的值按新格式重新渲染
    const patch = {}
    this.data.services.forEach(function (svc, i) {
      svc.chars.forEach(function (c, j) {
        if (!c.valueHex) return
        const buffer = format.hexToArrayBuffer(c.valueHex).buffer
        patch['services[' + i + '].chars[' + j + '].valueText'] = format.formatValue(buffer, valueFormat)
      })
    })
    if (Object.keys(patch).length) this.setData(patch)
    app.saveSettings({ defaultFormat: valueFormat })
  },

  bindRead: function (e) {
    const si = Number(e.currentTarget.dataset.si)
    const ci = Number(e.currentTarget.dataset.ci)
    const svc = this.data.services[si]
    const c = svc.chars[ci]
    ble.read({
      deviceId: this.data.deviceId,
      serviceId: svc.uuid,
      characteristicId: c.uuid
    }).catch(function (err) {
      wx.showToast({ title: ble.describeError(err), icon: 'none' })
    })
  },

  bindNotify: function (e) {
    const si = Number(e.currentTarget.dataset.si)
    const ci = Number(e.currentTarget.dataset.ci)
    const svc = this.data.services[si]
    const c = svc.chars[ci]
    const enable = !c.notifying
    const that = this
    ble.notify({
      deviceId: this.data.deviceId,
      serviceId: svc.uuid,
      characteristicId: c.uuid,
      enable: enable,
      indicate: !c.props.notify && c.props.indicate
    }).then(function () {
      const patch = {}
      patch['services[' + si + '].chars[' + ci + '].notifying'] = enable
      that.setData(patch)
      wx.showToast({ title: enable ? '已开启订阅' : '已关闭订阅', icon: 'none' })
    }).catch(function (err) {
      wx.showToast({ title: ble.describeError(err), icon: 'none' })
    })
  },

  bindWriteOpen: function (e) {
    const si = Number(e.currentTarget.dataset.si)
    const ci = Number(e.currentTarget.dataset.ci)
    const svc = this.data.services[si]
    const c = svc.chars[ci]
    this._target = { serviceId: svc.uuid, characteristicId: c.uuid }
    app.setLastTarget(
      uuids.shortCode(svc.uuid) || svc.uuid,
      uuids.shortCode(c.uuid) || c.uuid
    )
    this.refreshSavedCommands()
    this.setData({
      showWritePanel: true,
      showMacroPanel: false,
      writeTargetLabel: c.label,
      writeFormat: this.data.valueFormat,
      writeText: '',
      writeNoResponse: !c.props.write && c.props.writeNoResponse,
      writeTypeSupported: c.props.write && c.props.writeNoResponse
    })
  },

  bindWriteClose: function () {
    this.setData({ showWritePanel: false })
  },

  onWriteInput: function (e) {
    this.setData({ writeText: e.detail.value })
  },

  bindWriteFormat: function (e) {
    this.setData({ writeFormat: e.currentTarget.dataset.format })
  },

  toggleWriteNoResponse: function () {
    this.setData({ writeNoResponse: !this.data.writeNoResponse })
  },

  bindWriteSend: function () {
    const that = this
    const parsed = format.parseValue(this.data.writeText, this.data.writeFormat)
    if (!parsed.ok) {
      wx.showToast({ title: parsed.error, icon: 'none' })
      return
    }
    if (parsed.length > 512) {
      wx.showToast({ title: '单次写入请勿超过 512 字节', icon: 'none' })
      return
    }
    ble.write({
      deviceId: this.data.deviceId,
      serviceId: this._target.serviceId,
      characteristicId: this._target.characteristicId,
      buffer: parsed.buffer,
      writeType: this.data.writeNoResponse ? 'writeNoResponse' : 'write'
    }).then(function () {
      that.setData({ writeText: '', showWritePanel: false })
      wx.showToast({ title: '发送成功', icon: 'success' })
    }).catch(function (err) {
      wx.showToast({ title: ble.describeError(err), icon: 'none' })
    })
  },

  bindReconnect: function () {
    this.connectAndDiscover()
  },

  bindDisconnect: function () {
    const that = this
    ble.closeConnection().then(function () {
      that.setData({ error: '', services: [] })
      wx.showToast({ title: '已断开连接', icon: 'none' })
    })
  },

  bindUseCommand: function (e) {
    const cmd = commandStore.get(e.currentTarget.dataset.id)
    if (!cmd) return
    this.setData({
      writeText: cmd.value,
      writeFormat: cmd.format,
      writeNoResponse: !!cmd.writeNoResponse
    })
    wx.showToast({ title: '已填入 ' + cmd.name, icon: 'none' })
  },

  bindSaveCommand: function () {
    const that = this
    const parsed = format.parseValue(this.data.writeText, this.data.writeFormat)
    if (!parsed.ok) {
      wx.showToast({ title: parsed.error, icon: 'none' })
      return
    }
    wx.showModal({
      title: '存为常用命令',
      editable: true,
      placeholderText: '命令名称，如 启动测量',
      content: '',
      success: function (res) {
        if (!res.confirm) return
        const name = String(res.content || '').trim()
        if (!name) {
          wx.showToast({ title: '请填写命令名称', icon: 'none' })
          return
        }
        commandStore.add({
          name: name,
          format: that.data.writeFormat,
          value: that.data.writeText,
          writeNoResponse: that.data.writeNoResponse,
          serviceUuid: uuids.shortCode(that._target.serviceId) || that._target.serviceId,
          characteristicUuid: uuids.shortCode(that._target.characteristicId) || that._target.characteristicId
        })
        that.refreshSavedCommands()
        wx.showToast({ title: '已收藏', icon: 'success' })
      }
    })
  },

  bindMacroOpen: function () {
    this.refreshMacros()
    this.buildMacroTargets()
    this.setData({ showMacroPanel: true, showWritePanel: false, macroProgress: '' })
  },

  bindMacroClose: function () {
    this.setData({ showMacroPanel: false })
  },

  onMacroTargetChange: function (e) {
    const index = Number(e.detail.value)
    this.setData({
      macroTargetIndex: index,
      macroTargetLabel: this.data.macroTargetLabels[index] || ''
    })
  },

  bindMacroRun: function (e) {
    const that = this
    if (runner.isRunning() || this.data.macroRunning) {
      wx.showToast({ title: '已有宏在运行', icon: 'none' })
      return
    }
    if (this.data.connection !== 'connected') {
      wx.showToast({ title: '请先连接设备', icon: 'none' })
      return
    }
    const macro = macroStore.get(e.currentTarget.dataset.id)
    if (!macro || !macro.steps.length) {
      wx.showToast({ title: '该宏没有可执行步骤', icon: 'none' })
      return
    }
    const target = this.data.macroTargets[this.data.macroTargetIndex]
    if (!target) {
      wx.showToast({ title: '请先选择目标特征值', icon: 'none' })
      return
    }

    this.setData({ macroRunning: true, macroProgress: '准备执行…' })
    runner.run(macro, {
      deviceId: this.data.deviceId,
      serviceUuid: target.serviceUuid,
      characteristicUuid: target.characteristicUuid,
      onProgress: function (index, total, label) {
        that.setData({ macroProgress: '(' + (index + 1) + '/' + total + ') ' + label })
      },
      onDone: function (ok, message) {
        that.setData({ macroRunning: false, macroProgress: message })
        wx.showToast({ title: message, icon: ok ? 'success' : 'none' })
      }
    })
  },

  bindMacroStop: function () {
    if (!runner.isRunning()) {
      wx.showToast({ title: '当前没有运行的宏', icon: 'none' })
      return
    }
    runner.stop()
  },

  gotoLibrary: function () {
    wx.switchTab({ url: '/pages/library/library' })
  },

  gotoLogs: function () {
    wx.switchTab({ url: '/pages/logs/logs' })
  }
})
