const app = getApp()
const ble = require('../../utils/ble.js')

Page({
  data: {
    demoMode: false
  },

  onShow: function () {
    this.setData({ demoMode: !!app.getSettings().demoMode })
  },

  enableDemo: function () {
    ble.release()
    ble.setDemoMode(true)
    app.saveSettings({ demoMode: true })
    this.setData({ demoMode: true })
    wx.showToast({ title: '演示模式已开启', icon: 'success' })
    setTimeout(function () {
      wx.switchTab({ url: '/pages/scan/scan' })
    }, 600)
  },

  gotoSettings: function () {
    wx.switchTab({ url: '/pages/settings/settings' })
  }
})
