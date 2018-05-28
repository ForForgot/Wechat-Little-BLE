var app = getApp()
Page({
  data: {
    motto: 'Hello World'
  },
  onLoad: function () {
    var that = this;
    that.setData({
      motto: 'Start BLE Demo'
    })
  },
  bindViewTap: function () {
    wx.navigateTo({
      url: '../scan/scan'
    })
  }
})
