const app = getApp()
const ble = require('../../utils/ble.js')
const logger = require('../../utils/logger.js')
const format = require('../../utils/format.js')
const uuids = require('../../utils/uuids.js')

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
    writeTypeSupported: false
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

    if (!this.data.deviceId) {
      this.setData({ loading: false, error: '缺少设备 ID，请返回扫描页重新选择设备' })
      return
    }
    this.connectAndDiscover()
  },

  onUnload: function () {
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
    this.setData({ recentLogs: entries.slice(0, 4) })
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
    this.setData({
      showWritePanel: true,
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

  gotoLogs: function () {
    wx.switchTab({ url: '/pages/logs/logs' })
  }
})
