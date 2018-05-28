Page({
  data: {
    isNeedDiscover: false,
    devices: [],
  },
  onLoad: function () {
    console.log('onLoad scan')
    var that = this;
    that.isNeedDiscover = true;
    wx.openBluetoothAdapter({
      success: function (res) {
        console.log("openBluetoothAdapter: success");
        console.log(res);
        that.getBluetoothAdapterState();
      },
      fail: function (res) {
        console.log("openBluetoothAdapter: fail");
        console.log(res);
        wx.showModal({
          title: '蓝牙初始化失败',
          content: '请检查系统蓝牙是否打开',
          showCancel: false,
        });
        wx.showLoading({
          title: '检测系统蓝牙',
          mask: true,
        })
      },
      complete: function (res) {
        console.log("openBluetoothAdapter: complete");
        console.log(res);
        that.onBluetoothAdapterStateChange();
        //that.getBluetoothDevices();
        that.onBluetoothDeviceFound();
      }
    })
  },
  onUnload: function () {
    var that = this;
    that.stopBluetoothDevicesDiscovery();
    wx.closeBluetoothAdapter({
      success: function (res) {
        console.log("closeBluetoothAdapter: success");
        console.log(res);
      },
    })
  },
  onPullDownRefresh() {
    console.log('onPullDownRefresh scan')
    var that = this;
    that.isNeedDiscover = true;
    that.startBluetoothDevicesDiscovery();
    wx.stopPullDownRefresh();
  },
  onBluetoothAdapterStateChange: function () {
    var that = this;
    wx.onBluetoothAdapterStateChange(function (res) {
      console.log('bluetooth adapter state has changed')
      console.log(res)
      var available = res.available;
      if (available) {
        wx.hideLoading();
        if (that.isNeedDiscover) {
          that.getBluetoothAdapterState();
          }
      }
      else {
        // wx.showToast({
        //   title: '蓝牙已被关闭',
        //   icon: 'none',
        //   duration: 2000,
        // })
        // setTimeout(function () {
        //   wx.hideToast()
        // }, 2000)
        wx.showLoading({
          title: '检测系统蓝牙',
          mask: true,
        })
      }
    })
  },
  getBluetoothAdapterState: function () {
    var that = this;
    wx.getBluetoothAdapterState({
      success: function (res) {
        console.log("getBluetoothAdapterState: success");
        console.log(res);
        var discovering = res.discovering;
        var available = res.available;
        if (!available) {
        }
        else if (!discovering) {
          that.startBluetoothDevicesDiscovery();
        }
        else {
          wx.showToast({
            title: 'Scanning...',
            icon: 'loading',
            duration: 2000
          });
          setTimeout(function () {
            wx.hideToast()
          }, 2000)
        }
      },
    })
  },
  startBluetoothDevicesDiscovery: function () {
    var that = this;
    wx.startBluetoothDevicesDiscovery({
      services: [],//要搜索的UUID列表
      interval: 1,
      success: function (res) {
        console.log("startBluetoothDevicesDiscovery: success");
        console.log(res);
        wx.showToast({
          title: 'Scanning...',
          icon: 'loading',
          duration: 5000
        });
        setTimeout(function () {
          wx.hideToast()
        }, 5000)
        // that.getBluetoothDevices();
        // that.onBluetoothDeviceFound();
      },
      fail: function (res) {
        console.log("startBluetoothDevicesDiscovery: fail");
        console.log(res);
      },
      complete: function (res) {
      }
    })
  },
  stopBluetoothDevicesDiscovery: function () {
    var that = this;
    wx.stopBluetoothDevicesDiscovery({
      success: function (res) {
        console.log('stopBluetoothDevicesDiscovery: success')
        console.log(res)
      },
    })
  },
  getBluetoothDevices: function () {
    var that = this;
    wx.getBluetoothDevices({
      success: function (res) {
        console.log("getBluetoothDevices: success");
        console.log(res);
        that.setData({
          devices: res.devices
        });
      },
      fail: function (res) {
        console.log("getBluetoothDevices: fail");
        console.log(res);
      },
      complete: function (res) {
      }
    })
  },
  onBluetoothDeviceFound: function () {
    var that = this;
    wx.onBluetoothDeviceFound(function (res) {
      console.log(`${res.devices.length} new devices has found`)
      console.log(res)
      for (var i = 0; i < res.devices.length; i++) {
        that.data.devices.push(res.devices[i])
      }
      console.log(that.data.devices)
      that.setData({
        devices: that.data.devices
      })
    })
  },
  //点击事件处理
  bindViewTap: function (event) {
    console.log(event)
    var that = this;
    var deviceId = event.currentTarget.dataset.deviceid;
    var name = event.currentTarget.dataset.name;
    wx.navigateTo({
      url: '../conn/conn?deviceId=' + deviceId + '&name=' + name,
      success: function (res) {
        that.isNeedDiscover = false;
        that.stopBluetoothDevicesDiscovery();
      },
      fail: function (res) {
      },
      complete: function (res) {
      }
    })
  },
})
