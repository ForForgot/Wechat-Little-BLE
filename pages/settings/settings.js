const app = getApp()
const ble = require('../../utils/ble.js')
const logger = require('../../utils/logger.js')
const commandStore = require('../../utils/commands.js')
const macroStore = require('../../utils/macros.js')

const FORMATS = ['HEX', 'UTF8', 'DEC', 'BIN']

Page({
  data: {
    formats: FORMATS,
    settings: {},
    logCount: 0,
    favoriteCount: 0,
    commandCount: 0,
    macroCount: 0
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
      favoriteCount: app.getFavorites().length,
      commandCount: commandStore.count(),
      macroCount: macroStore.list().length
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

  onDemoMode: function (e) {
    const value = !!e.detail.value
    // 切换前释放真实适配器 / 演示定时器，回到扫描页时会重新初始化
    ble.release()
    ble.setDemoMode(value)
    app.saveSettings({ demoMode: value })
    this.sync()
    wx.showToast({ title: value ? '演示模式已开启' : '演示模式已关闭', icon: 'none' })
  },

  gotoHelp: function () {
    wx.navigateTo({ url: '/pages/help/help' })
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

  clearLibrary: function () {
    const that = this
    wx.showModal({
      title: '清空调试库',
      content: '将删除全部常用命令与宏序列，此操作不可撤销。',
      success: function (res) {
        if (!res.confirm) return
        commandStore.clear()
        macroStore.clear()
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
