const app = getApp()
const ble = require('../../utils/ble.js')
const logger = require('../../utils/logger.js')

const FORMATS = ['HEX', 'UTF8', 'DEC', 'BIN']

Page({
  data: {
    formats: FORMATS,
    settings: {},
    logCount: 0,
    favoriteCount: 0
  },

  onLoad: function () {
    this.sync()
  },

  onShow: function () {
    this.sync()
  },

  sync: function () {
    this.setData({
      settings: app.getSettings(),
      logCount: logger.list().length,
      favoriteCount: app.getFavorites().length
    })
  },

  update: function (patch) {
    const s = app.saveSettings(patch)
    this.setData({ settings: s })
  },

  onRssi: function (e) {
    this.update({ rssiThreshold: Number(e.detail.value) })
  },

  onTimeout: function (e) {
    this.update({ scanTimeout: Number(e.detail.value) })
  },

  onMtu: function (e) {
    const mtu = Number(e.detail.value)
    this.update({ mtu: mtu })
    ble.configure({ mtu: mtu })
  },

  onDuplicates: function (e) {
    this.update({ allowDuplicates: e.detail.value })
  },

  onFormat: function (e) {
    this.update({ defaultFormat: e.currentTarget.dataset.format })
  },

  clearLogs: function () {
    const that = this
    wx.showModal({
      title: '清空日志',
      content: '将删除全部本地通信日志，此操作不可撤销。',
      success: function (res) {
        if (!res.confirm) return
        logger.clear()
        that.sync()
        wx.showToast({ title: '已清空', icon: 'success' })
      }
    })
  },

  clearFavorites: function () {
    const that = this
    wx.showModal({
      title: '清空收藏',
      content: '将移除所有已收藏的设备，此操作不可撤销。',
      success: function (res) {
        if (!res.confirm) return
        app.clearFavorites()
        that.sync()
        wx.showToast({ title: '已清空', icon: 'success' })
      }
    })
  },

  reset: function () {
    const that = this
    wx.showModal({
      title: '恢复默认设置',
      content: '扫描阈值、MTU、格式等将恢复默认值。',
      success: function (res) {
        if (!res.confirm) return
        const s = app.resetSettings()
        ble.configure({ mtu: s.mtu })
        that.sync()
        wx.showToast({ title: '已恢复', icon: 'success' })
      }
    })
  }
})
