const app = getApp()
const signal = require('../../utils/signal.js')

function dBm(value, hasData) {
  return hasData ? String(value) : '--'
}

function currentTheme() {
  try {
    const info = wx.getAppBaseInfo ? wx.getAppBaseInfo() : wx.getSystemInfoSync()
    return info.theme === 'dark' ? 'dark' : 'light'
  } catch (e) {
    return 'light'
  }
}

Page({
  data: {
    deviceId: '',
    deviceName: 'BLE 设备',
    count: 0,
    current: '--',
    min: '--',
    max: '--',
    avg: '--',
    span: 0,
    hint: ''
  },

  onLoad: function (options) {
    const id = options.deviceId ? decodeURIComponent(options.deviceId) : ''
    const device = app.getActiveDevice() || {}
    this._ready = false
    this.setData({
      deviceId: id,
      deviceName: device.deviceId === id ? (device.name || '未命名设备') : 'BLE 设备'
    })
    signal.prune()
    this._refreshBound = this.refresh.bind(this)
    this._unsub = signal.subscribe(this._refreshBound)
    // 系统深浅色切换时重绘 canvas
    if (wx.onThemeChange) wx.onThemeChange(this._refreshBound)
  },

  onReady: function () {
    this._ready = true
    this.refresh()
  },

  onUnload: function () {
    if (this._unsub) this._unsub()
    if (wx.offThemeChange && this._refreshBound) wx.offThemeChange(this._refreshBound)
  },

  refresh: function () {
    const s = signal.stats(this.data.deviceId)
    const hasData = s.count > 0
    const settings = app.getSettings()
    this.setData({
      count: s.count,
      current: dBm(s.current, hasData),
      min: dBm(s.min, hasData),
      max: dBm(s.max, hasData),
      avg: dBm(s.avg, hasData),
      span: s.span,
      hint: settings.allowDuplicates
        ? ''
        : '已关闭「允许重复广播」，仅首次发现时会有采样，曲线无法连续更新'
    })
    this.draw()
  },

  draw: function () {
    if (!this._ready) return
    const that = this
    wx.createSelectorQuery().in(this).select('#rssiChart').fields({ node: true, size: true }).exec(function (res) {
      const item = res && res[0]
      if (!item || !item.node) return
      const canvas = item.node
      const ctx = canvas.getContext('2d')
      let dpr = 1
      try {
        dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 1
      } catch (e) {
        dpr = 1
      }
      const w = item.width
      const h = item.height
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, w, h)

      const dark = currentTheme() === 'dark'
      const gridColor = dark ? '#262D36' : '#EDF0F4'
      const labelColor = dark ? '#9AA3AE' : '#A6ADB8'
      const lineColor = dark ? '#6AA9E9' : '#185FA5'
      const fillColor = dark ? 'rgba(106, 169, 233, 0.18)' : 'rgba(24, 95, 165, 0.10)'

      const padL = 36
      const padR = 10
      const padT = 12
      const padB = 18
      const cw = Math.max(1, w - padL - padR)
      const ch = Math.max(1, h - padT - padB)

      const arr = signal.history(that.data.deviceId)

      // 纵轴按实际采样动态缩放，信号很强或很弱时不会贴边
      let lo = -100
      let hi = -40
      if (arr.length) {
        let min = arr[0].v
        let max = arr[0].v
        for (let i = 1; i < arr.length; i++) {
          if (arr[i].v < min) min = arr[i].v
          if (arr[i].v > max) max = arr[i].v
        }
        lo = Math.floor((min - 5) / 10) * 10
        hi = Math.ceil((max + 5) / 10) * 10
        if (hi - lo < 20) {
          const mid = (hi + lo) / 2
          lo = Math.floor((mid - 10) / 10) * 10
          hi = Math.ceil((mid + 10) / 10) * 10
        }
        lo = Math.max(-120, lo)
        hi = Math.min(0, hi)
        if (hi - lo < 10) hi = lo + 10
      }
      const range = Math.max(1, hi - lo)

      ctx.font = '10px sans-serif'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      for (let i = 0; i < 4; i++) {
        const v = Math.round(hi - (range * i) / 3)
        const y = padT + ((hi - v) / range) * ch
        ctx.strokeStyle = gridColor
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(padL, y)
        ctx.lineTo(w - padR, y)
        ctx.stroke()
        ctx.fillStyle = labelColor
        ctx.fillText(String(v), padL - 6, y)
      }

      if (arr.length < 2) {
        ctx.textAlign = 'center'
        ctx.fillStyle = labelColor
        ctx.font = '12px sans-serif'
        ctx.fillText(arr.length ? '等待更多采样…' : '暂无信号采样', w / 2, padT + ch / 2)
        return
      }

      const firstT = arr[0].t
      const spanT = Math.max(1, arr[arr.length - 1].t - firstT)
      function px(s) { return padL + ((s.t - firstT) / spanT) * cw }
      function py(s) {
        const ratio = Math.max(0, Math.min(1, (s.v - lo) / range))
        return padT + (1 - ratio) * ch
      }

      ctx.beginPath()
      ctx.moveTo(px(arr[0]), padT + ch)
      arr.forEach(function (s) { ctx.lineTo(px(s), py(s)) })
      ctx.lineTo(px(arr[arr.length - 1]), padT + ch)
      ctx.closePath()
      ctx.fillStyle = fillColor
      ctx.fill()

      ctx.beginPath()
      arr.forEach(function (s, i) {
        if (i === 0) ctx.moveTo(px(s), py(s))
        else ctx.lineTo(px(s), py(s))
      })
      ctx.strokeStyle = lineColor
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.stroke()

      const last = arr[arr.length - 1]
      ctx.beginPath()
      ctx.arc(px(last), py(last), 3, 0, Math.PI * 2)
      ctx.fillStyle = lineColor
      ctx.fill()

      ctx.fillStyle = labelColor
      ctx.font = '10px sans-serif'
      ctx.textBaseline = 'bottom'
      ctx.textAlign = 'left'
      ctx.fillText('-' + Math.round(spanT / 1000) + 's', padL, h - 2)
      ctx.textAlign = 'right'
      ctx.fillText('现在', w - padR, h - 2)
    })
  },

  clearHistory: function () {
    signal.clear(this.data.deviceId)
    this.refresh()
    wx.showToast({ title: '已清空采样', icon: 'success' })
  },

  gotoSettings: function () {
    wx.switchTab({ url: '/pages/settings/settings' })
  }
})
