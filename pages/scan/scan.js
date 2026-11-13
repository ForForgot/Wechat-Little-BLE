const app = getApp()
const ble = require('../../utils/ble.js')
const adv = require('../../utils/adv.js')
const signal = require('../../utils/signal.js')
const privacy = require('../../utils/privacy.js')

const REFRESH_INTERVAL = 600

function signalLevel(rssi) {
  if (rssi >= -55) return 4
  if (rssi >= -70) return 3
  if (rssi >= -85) return 2
  return 1
}

function buildBars(rssi) {
  const level = signalLevel(rssi)
  return [1, 2, 3, 4].map(function (n) {
    return { on: n <= level, h: 10 + n * 5 }
  })
}

function buildSubtitle(info) {
  const parts = []
  if (info.serviceLabels.length) parts.push(info.serviceLabels.slice(0, 2).join('、'))
  if (info.manufacturer) parts.push('厂商 ' + info.manufacturer)
  if (!info.connectable) parts.push('不可连接')
  if (!parts.length) parts.push('无广播服务信息')
  return parts.join(' · ')
}

function ensureLocation() {
  return new Promise(function (resolve) {
    // 演示模式不调用任何真实蓝牙 / 隐私接口，无需定位授权
    if (app.getSettings().demoMode) {
      resolve()
      return
    }
    let platform = ''
    try {
      platform = (wx.getSystemInfoSync().platform || '').toLowerCase()
    } catch (e) {
      platform = ''
    }
    if (platform !== 'android') {
      resolve()
      return
    }
    wx.getSetting({
      success: function (res) {
        const setting = (res.authSetting || {})['scope.userLocation']
        if (setting !== true) {
          wx.authorize({ scope: 'scope.userLocation', complete: function () { resolve() } })
        } else {
          resolve()
        }
      },
      fail: function () { resolve() }
    })
  })
}

Page({
  data: {
    devices: [],
    scanning: false,
    keyword: '',
    rssiThreshold: -95,
    onlyConnectable: false,
    favoritesOnly: false,
    notice: '',
    noticeKind: '',
    demoMode: false,
    expandedId: '',
    total: 0
  },

  onLoad: function () {
    this._raw = {}
    this._dirty = false
    this._unsub = []
    this._unsub.push(ble.on('devices', this.onDevicesFound.bind(this)))
    this._unsub.push(ble.on('state', this.onStateChange.bind(this)))
    this._unsub.push(ble.on('adapter', this.onAdapterChange.bind(this)))
    this._timer = setInterval(this.flush.bind(this), REFRESH_INTERVAL)
    const s = app.getSettings()
    this.setData({
      rssiThreshold: s.rssiThreshold,
      onlyConnectable: s.onlyConnectable,
      favoritesOnly: s.favoritesOnly
    })
  },

  onShow: function () {
    this._keepScanning = false
    this._dirty = true
    this.setData({ demoMode: !!app.getSettings().demoMode })
    this.startScan()
  },

  onHide: function () {
    this.clearScanTimer()
    // 跳到信号曲线页时保持扫描，否则曲线会停止更新
    if (!this._keepScanning) ble.stopScan()
  },

  onUnload: function () {
    if (this._timer) clearInterval(this._timer)
    this.clearScanTimer()
    this._unsub.forEach(function (fn) { fn() })
    this._unsub = []
    ble.release()
  },

  onPullDownRefresh: function () {
    this.startScan(true)
    wx.stopPullDownRefresh()
  },

  clearScanTimer: function () {
    if (this._scanTimer) {
      clearTimeout(this._scanTimer)
      this._scanTimer = null
    }
  },

  onStateChange: function (state) {
    this.setData({ scanning: state.scanning })
  },

  onAdapterChange: function (res) {
    if (!res.available) {
      this.setData({ notice: '系统蓝牙已关闭，请打开蓝牙后重试' })
    } else {
      this.setData({ notice: '' })
    }
  },

  onDevicesFound: function (devices) {
    const now = Date.now()
    for (let i = 0; i < devices.length; i++) {
      const d = devices[i]
      const prev = this._raw[d.deviceId] || {}
      this._raw[d.deviceId] = {
        deviceId: d.deviceId,
        name: d.name || prev.name || '',
        RSSI: typeof d.RSSI === 'number' ? d.RSSI : (prev.RSSI || -127),
        connectable: d.connectable !== false,
        advertisData: d.advertisData || prev.advertisData,
        localName: d.localName || prev.localName,
        advertisServiceUUIDs: d.advertisServiceUUIDs || prev.advertisServiceUUIDs || [],
        serviceData: d.serviceData || prev.serviceData,
        manufacturerData: d.manufacturerData || prev.manufacturerData,
        lastSeen: now
      }
    }
    this._dirty = true
  },

  flush: function () {
    if (!this._dirty) return
    this._dirty = false
    const keyword = (this.data.keyword || '').trim().toLowerCase()
    const threshold = this.data.rssiThreshold
    const onlyConnectable = this.data.onlyConnectable
    const favoritesOnly = this.data.favoritesOnly
    const expandedId = this.data.expandedId
    const now = Date.now()
    const list = []

    // 清理超过 60 秒未再广播的设备，避免列表无限增长
    Object.keys(this._raw).forEach(function (id) {
      if (now - this._raw[id].lastSeen > 60000) delete this._raw[id]
    }, this)

    Object.keys(this._raw).forEach(function (id) {
      const raw = this._raw[id]
      // 超过 30 秒未再收到广播的设备不再展示
      if (now - raw.lastSeen > 30000) return
      const info = adv.summarize(raw)
      if (keyword) {
        const haystack = (info.name + ' ' + id + ' ' + info.manufacturer).toLowerCase()
        if (haystack.indexOf(keyword) < 0) return
      }
      if (raw.RSSI < threshold) return
      if (onlyConnectable && !info.connectable) return
      if (favoritesOnly && !app.isFavorite(id)) return

      // 广播明细与趋势图只在展开的设备上渲染，
      // 避免几十台设备时每次刷新都推送大量无用数据
      const expanded = id === expandedId

      list.push({
        deviceId: id,
        name: info.name,
        rssi: raw.RSSI,
        rssiText: raw.RSSI + ' dBm',
        bars: buildBars(raw.RSSI),
        favorite: app.isFavorite(id),
        connectable: info.connectable,
        subtitle: buildSubtitle(info),
        serviceLabels: info.serviceLabels,
        manufacturer: info.manufacturer,
        localName: info.localName,
        txPower: info.txPower,
        rawHex: expanded ? info.rawHex : '',
        adv: expanded ? info.adv : [],
        serviceData: expanded ? info.serviceData : [],
        spark: expanded ? signal.spark(id, 24) : []
      })
    }, this)

    list.sort(function (a, b) { return b.rssi - a.rssi })
    this.setData({
      devices: list,
      total: Object.keys(this._raw).length
    })
  },

  startScan: function (force) {
    const that = this
    // 隐私接口（蓝牙 / 定位 / 剪贴板）必须先同步用户同意状态，
    // 否则首次 openBluetoothAdapter 会直接失败且不会自动重试
    const gatePromise = app.getSettings().demoMode
      ? Promise.resolve({ ok: true, kind: '', message: '' })
      : privacy.ensure()
    gatePromise.then(function (gate) {
      if (!gate.ok) {
        that.setData({ notice: gate.message, noticeKind: gate.kind, scanning: false })
        return null
      }
      return ensureLocation().then(function () {
        const s = app.getSettings()
        return ble.startScan({ allowDuplicates: s.allowDuplicates })
      }).then(function () {
        if (force) {
          that._raw = {}
          that._dirty = true
          that.flush()
        }
        that.setData({ notice: '', noticeKind: '', scanning: true })
        that.clearScanTimer()
        const timeout = Number(app.getSettings().scanTimeout) || 0
        if (timeout > 0) {
          that._scanTimer = setTimeout(function () {
            ble.stopScan()
            wx.showToast({ title: '扫描已自动停止', icon: 'none' })
          }, timeout * 1000)
        }
        return null
      })
    }).catch(function (err) {
      const privacyHint = privacy.describe(err)
      let hint = privacyHint || ble.describeError(err)
      let kind = 'permission'
      if (privacyHint) {
        kind = 'config'
      } else if (err.errCode === 10001) {
        hint = '系统蓝牙未开启或设备不支持 BLE，请打开蓝牙后重试'
      } else if (/location|定位/i.test(hint)) {
        hint = 'Android 需要定位权限与定位开关，请授权后重试'
      }
      that.setData({ notice: hint, noticeKind: kind, scanning: false })
    })
  },

  onNoticeAction: function () {
    // 只有系统权限类问题才跳小程序设置页；隐私与蓝牙关闭都靠重试解决
    if (this.data.noticeKind === 'permission') {
      this.openSystemSettings()
    } else {
      this.setData({ notice: '', noticeKind: '' })
      this.startScan()
    }
  },

  toggleScan: function () {
    if (this.data.scanning) {
      this.clearScanTimer()
      ble.stopScan()
    } else {
      this.startScan()
    }
  },

  onSearch: function (e) {
    this.setData({ keyword: e.detail.value })
    this._dirty = true
    this.flush()
  },

  resetFilters: function () {
    app.saveSettings({ rssiThreshold: -95, onlyConnectable: false, favoritesOnly: false })
    this.setData({ rssiThreshold: -95, onlyConnectable: false, favoritesOnly: false })
    this._dirty = true
    this.flush()
  },

  toggleFavorites: function () {
    const next = !this.data.favoritesOnly
    app.saveSettings({ favoritesOnly: next })
    this.setData({ favoritesOnly: next })
    this._dirty = true
    this.flush()
  },

  toggleConnectable: function () {
    const next = !this.data.onlyConnectable
    app.saveSettings({ onlyConnectable: next })
    this.setData({ onlyConnectable: next })
    this._dirty = true
    this.flush()
  },

  toggleStrong: function () {
    const next = this.data.rssiThreshold <= -95 ? -70 : -95
    app.saveSettings({ rssiThreshold: next })
    this.setData({ rssiThreshold: next })
    this._dirty = true
    this.flush()
  },

  toggleFavorite: function (e) {
    const id = e.currentTarget.dataset.deviceid
    app.toggleFavorite(id)
    this._dirty = true
    this.flush()
  },

  toggleExpand: function (e) {
    const id = e.currentTarget.dataset.deviceid
    this.setData({ expandedId: this.data.expandedId === id ? '' : id })
    // 明细字段只在展开时下发，展开后需要立刻补一次数据
    this._dirty = true
    this.flush()
  },

  openDevice: function (e) {
    const id = e.currentTarget.dataset.deviceid
    const device = this.data.devices.filter(function (d) { return d.deviceId === id })[0]
    if (!device) return
    app.setActiveDevice(device)
    wx.navigateTo({ url: '/pages/conn/conn?deviceId=' + encodeURIComponent(id) })
  },

  openSignal: function (e) {
    const id = e.currentTarget.dataset.deviceid
    const device = this.data.devices.filter(function (d) { return d.deviceId === id })[0]
    if (!device) return
    app.setActiveDevice(device)
    this._keepScanning = true
    wx.navigateTo({ url: '/pages/signal/signal?deviceId=' + encodeURIComponent(id) })
  },

  noop: function () {},

  openSystemSettings: function () {
    if (wx.openSetting) {
      wx.openSetting({ complete: function () {} })
    } else {
      wx.showToast({ title: '请在系统设置中开启蓝牙与定位', icon: 'none' })
    }
  }
})
