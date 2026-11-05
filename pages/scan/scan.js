const app = getApp()
const ble = require('../../utils/ble.js')
const adv = require('../../utils/adv.js')

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
    this.startScan()
  },

  onHide: function () {
    this.clearScanTimer()
    ble.stopScan()
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
        rawHex: info.rawHex,
        adv: info.adv,
        serviceData: info.serviceData
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
    ensureLocation().then(function () {
      const s = app.getSettings()
      return ble.startScan({ allowDuplicates: s.allowDuplicates })
    }).then(function () {
      if (force) {
        that._raw = {}
        that._dirty = true
        that.flush()
      }
      that.setData({ notice: '', scanning: true })
      that.clearScanTimer()
      const timeout = Number(app.getSettings().scanTimeout) || 0
      if (timeout > 0) {
        that._scanTimer = setTimeout(function () {
          ble.stopScan()
          wx.showToast({ title: '扫描已自动停止', icon: 'none' })
        }, timeout * 1000)
      }
    }).catch(function (err) {
      let hint = ble.describeError(err)
      if (err.errCode === 10001) {
        hint = '系统蓝牙未开启或设备不支持 BLE，请打开蓝牙后重试'
      } else if (/location|定位/i.test(hint)) {
        hint = 'Android 需要定位权限与定位开关，请授权后重试'
      }
      that.setData({ notice: hint, scanning: false })
    })
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
  },

  openDevice: function (e) {
    const id = e.currentTarget.dataset.deviceid
    const device = this.data.devices.filter(function (d) { return d.deviceId === id })[0]
    if (!device) return
    app.setActiveDevice(device)
    wx.navigateTo({ url: '/pages/conn/conn?deviceId=' + encodeURIComponent(id) })
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
