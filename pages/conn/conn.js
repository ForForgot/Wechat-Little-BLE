Page({
  data: {
    deviceId: '',
    list: [],
    cmd: '',
  },
  onLoad: function (options) {
    var that = this;
    console.log(options)
    that.setData({
      deviceId: options.deviceId
    });
    wx.showLoading({
      title: '正在连接...',
    })
    that.onBLEConnectionStateChanged();
    that.createBLEConnection();
  },
  onUnload: function () {
    var that = this;
    that.closeBLEConnection();
  },
  onBLEConnectionStateChanged: function () {
    var that = this;
    wx.onBLEConnectionStateChanged(function (res) {
      console.log(`device ${res.deviceId} connection state has changed, connected: ${res.connected}`)
      console.log(res)
      var connected = res.connected;
      if (connected) {
        wx.hideLoading();
        wx.showLoading({
          title: '正在扫描服务...',
        })
      }
      else {
        wx.navigateBack({
        })
      }
    })
  },
  createBLEConnection: function () {
    var that = this;
    wx.createBLEConnection({
      deviceId: that.data.deviceId,
      success: function (res) {
        console.log('createBLEConnection: success');
        console.log(res);
        that.getBLEDeviceServices();
      },
      fail: function (res) {
        console.log('createBLEConnection: fail')
        console.log(res)
      },
      complete: function (res) {
        console.log('createBLEConnection: complete')
        console.log(res)
      }
    })
  },
  closeBLEConnection: function () {
    var that = this;
    wx.closeBLEConnection({
      deviceId: that.data.deviceId,
      success: function (res) {
        console.log('closeBLEConnection: success');
        console.log(res);
      },
      fail: function (res) {
        console.log('closeBLEConnection: fail');
        console.log(res);
      },
      complete: function (res) {
        console.log('closeBLEConnection: complete');
        console.log(res);
        wx.hideLoading();
      },
    })
  },
  getBLEDeviceServices: function () {
    var that = this;
    wx.getBLEDeviceServices({
      deviceId: that.data.deviceId,
      success: function (res) {
        console.log('getBLEDeviceServices: success')
        console.log(res)
        that.setData({
          list: res.services
        });
        for (var i = 0; i < that.data.list.length; i++) {
          that.data.list[i].serviceId = that.data.list[i].uuid;
          var key = "list[" + i + "].serviceId",
            value = that.data.list[i].serviceId;
          that.setData({
            [key]: value
          })
          that.getBLEDeviceCharacteristics(i)
        }
        wx.hideLoading();
      },
      fail: function (res) {
        console.log('getBLEDeviceServices: fail');
        console.log(res);
        wx.hideLoading();
      },
    })
  },
  getBLEDeviceCharacteristics: function (options) {
    var that = this;
    var index = options;
    console.log('FUNC: getBLEDeviceCharacteristics')
    console.log(options)
    wx.getBLEDeviceCharacteristics({
      deviceId: that.data.deviceId,
      serviceId: that.data.list[index].serviceId,
      success: function (res) {
        console.log('getBLEDeviceCharacteristics: success')
        console.log(res)
        that.data.list[index].characteristics = res.characteristics;
        var key = 'list[' + index + '].characteristics',
          value = that.data.list[index].characteristics;
        that.setData({
          [key]: value
        })
      },
      fail: function (res) {
        console.log('getBLEDeviceCharacteristics: fail')
        console.log(res);
      }
    })
  },
  readBLECharacteristicValue: function (options) {
    var that = this;
    console.log('FUNC: readBLECharacteristicValue')
    console.log(options)
    wx.readBLECharacteristicValue({
      deviceId: that.data.deviceId,
      serviceId: options.serviceId,
      characteristicId: options.characteristicsId,
      success: function (res) {
        console.log('readBLECharacteristicValue: success')
        console.log(res)
      },
    })
  },
  notifyBLECharacteristicValueChange: function (options) {
    var that = this;
    wx.notifyBLECharacteristicValueChange({
      deviceId: that.data.deviceId,
      serviceId: options.serviceId,
      characteristicId: options.characteristicsId,
      state: true,
      success: function (res) {
        console.log('notifyBLECharacteristicValueChange: success')
        console.log(res)
      },
    })
  },
  onBLECharacteristicValueChange: function () {
    var that = this;
    wx.onBLECharacteristicValueChange(function (res) {
      console.log("BLE Characteristic Value Changed")
      console.log(res)
      // console.log(`characteristic ${res.characteristicId} has changed, now is ${res.value}`)
      console.log(that.ab2hex(res.value))
      // console.log(that.ab2str(res.value))
      for (var i = 0; i < that.data.list.length; i++) {
        if (that.data.list[i].serviceId == res.serviceId) {
          for (var j = 0; j < that.data.list[i].characteristics.length; j++) {
            if (that.data.list[i].characteristics[j].uuid == res.characteristicId) {
              var key = 'list[' + i + '].characteristics[' + j + '].readValue';
              var key1 = 'list[' + i + '].characteristics[' + j + '].notifyValue';
              var value = that.ab2hex(res.value);
              that.setData({
                [key]: value,
                [key1]: value
              })
            }
          }
        }
      }
    })
  },
  writeBLECharacteristicValue: function (options) {
    var that = this;
    console.log('FUNC: writeBLECharacteristicValue')
    console.log(options)
    wx.writeBLECharacteristicValue({
      deviceId: that.data.deviceId,
      serviceId: options.serviceId,
      characteristicId: options.characteristicsId,
      value: options.buffer,
      success: function (res) {
        console.log('writeBLECharacteristicValue: success')
        console.log(res)
      },
    })
  },
  bindButtonRead: function (event) {
    console.log(event);
    var that = this;
    var serviceId = event.currentTarget.dataset.serviceid,
      characteristicsId = event.currentTarget.dataset.characteristicsid;
    var ids = {};
    ids.serviceId = serviceId;
    ids.characteristicsId = characteristicsId;
    that.onBLECharacteristicValueChange()
    that.readBLECharacteristicValue(ids)
  },
  bindButtonNotify: function (event) {
    console.log(event);
    var that = this;
    var serviceId = event.currentTarget.dataset.serviceid,
      characteristicsId = event.currentTarget.dataset.characteristicsid;
    var ids = {};
    ids.serviceId = serviceId;
    ids.characteristicsId = characteristicsId;
    that.onBLECharacteristicValueChange()
    that.notifyBLECharacteristicValueChange(ids)
  },
  bindButtonWrite: function (event) {
    console.log(event);
    var that = this;
    var serviceId = event.currentTarget.dataset.serviceid,
      characteristicsId = event.currentTarget.dataset.characteristicsid;
    var ids = {};
    ids.serviceId = serviceId;
    ids.characteristicsId = characteristicsId;
    ids.buffer = that.hex2ab(that.data.cmd)
    that.onBLECharacteristicValueChange()
    that.writeBLECharacteristicValue(ids)
  },
  cmdInput: function (event) {
    var that = this;
    that.data.cmd = event.detail.value;
  },
  ab2hex: function (buffer) {
    var hexArr = Array.prototype.map.call(
      new Uint8Array(buffer),
      function (bit) {
        return ('00' + bit.toString(16)).slice(-2).toUpperCase()
      }
    )
    return hexArr.join('');
  },
  hex2ab: function (str) {
    var typedArray = new Uint8Array(str.match(/[\da-f]{2}/gi).map(function (h) {
      return parseInt(h, 16)
    }))
    return typedArray.buffer
  },
  ab2str: function (buffer) {
    return String.fromCharCode.apply(null, new Uint8Array(buffer));
  },
  arrayBufferToHexString: function (buffer) {
    let bufferType = Object.prototype.toString.call(buffer)
    if (buffer != '[object ArrayBuffer]') {
      return
    }
    let dataView = new DataView(buffer)
    var hexStr = '';
    for (var i = 0; i < dataView.byteLength; i++) {
      var str = dataView.getUint8(i);
      var hex = (str & 0xff).toString(16);
      hex = (hex.length === 1) ? '0' + hex : hex;
      hexStr += hex;
    }
    return hexStr.toUpperCase();
  },
  hexStringToArrayBuffer: function (str) {
    if (!str) {
      return new ArrayBuffer(0);
    }
    var buffer = new ArrayBuffer((str.length + 1) / 2);
    let dataView = new DataView(buffer)
    let ind = 0;
    for (var i = 0, len = str.length; i < len; i += 2) {
      let code = parseInt(str.substr(i, 2), 16)
      dataView.setUint8(ind, code)
      ind++
    }
    return buffer;
  },
})
