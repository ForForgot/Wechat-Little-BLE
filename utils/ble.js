const logger = require('./logger.js')
const format = require('./format.js')
const uuids = require('./uuids.js')
const demo = require('./demo.js')

const ERROR_MESSAGES = {
  10000: '蓝牙适配器未初始化',
  10001: '系统蓝牙未开启或设备不支持 BLE',
  10002: '未找到指定设备',
  10003: '连接失败',
  10004: '未找到指定服务',
  10005: '未找到指定特征值',
  10006: '当前设备未连接',
  10007: '该特征值不支持此操作',
  10008: '系统上报异常',
  10009: '系统上报异常（Android 特有）',
  10010: '设备已连接',
  10011: '重复调用',
  10012: '操作已在进行中',
  10013: '参数错误或当前基础库不支持该参数'
}

const listeners = {}
const handlers = {}
const config = { mtu: 23 }
// 主动断开后，系统可能再抛一次断开回调；用它识别并忽略这次回声
let closingId = ''

const state = {
  initialized: false,
  adapterAvailable: false,
  scanning: false,
  connection: 'disconnected',
  deviceId: '',
  mtu: 23,
  demo: false
}

function on(evt, fn) {
  if (!listeners[evt]) listeners[evt] = []
  if (listeners[evt].indexOf(fn) < 0) listeners[evt].push(fn)
  return function () { off(evt, fn) }
}

function off(evt, fn) {
  const arr = listeners[evt]
  if (!arr) return
  if (!fn) {
    delete listeners[evt]
    return
  }
  const i = arr.indexOf(fn)
  if (i >= 0) arr.splice(i, 1)
}

function emit(evt, payload) {
  const arr = (listeners[evt] || []).slice()
  for (let i = 0; i < arr.length; i++) {
    try {
      arr[i](payload)
    } catch (e) {
      // 单个订阅者异常不影响广播
    }
  }
}

function snapshot() {
  return {
    initialized: state.initialized,
    adapterAvailable: state.adapterAvailable,
    scanning: state.scanning,
    connection: state.connection,
    deviceId: state.deviceId,
    mtu: state.mtu
  }
}

function normalizeError(api, err) {
  const raw = err || {}
  const error = new Error(ERROR_MESSAGES[raw.errCode] || raw.errMsg || '未知错误')
  error.errCode = raw.errCode
  error.api = api
  error.raw = raw
  return error
}

function emitValue(res) {
  const hex = format.toHex(res.value)
  logger.rx('NOTIFY ' + uuids.displayUuid(res.characteristicId), hex)
  emit('value', {
    deviceId: res.deviceId,
    serviceId: res.serviceId,
    characteristicId: res.characteristicId,
    value: res.value,
    hex: hex
  })
}

// 演示模式下完全不触碰 wx BLE / 隐私接口，所有页面沿用同一套数据流
function demoCall(api, options) {
  const opts = options || {}
  switch (api) {
    case 'setBLEMTU':
      return Promise.resolve({ mtu: 23 })
    case 'getBLEDeviceServices':
      return Promise.resolve({ services: demo.services(opts.deviceId || state.deviceId) })
    case 'getBLEDeviceCharacteristics':
      return Promise.resolve({ characteristics: demo.characteristics(opts.serviceId) })
    case 'readBLECharacteristicValue':
      setTimeout(function () {
        emitValue({
          deviceId: opts.deviceId || state.deviceId,
          serviceId: opts.serviceId,
          characteristicId: opts.characteristicId,
          value: demo.valueFor(opts.characteristicId)
        })
      }, 150)
      return Promise.resolve({})
    case 'notifyBLECharacteristicValueChange':
      demo.setNotify(opts.characteristicId, !!opts.state, function (buffer) {
        emitValue({
          deviceId: opts.deviceId || state.deviceId,
          serviceId: opts.serviceId,
          characteristicId: opts.characteristicId,
          value: buffer
        })
      })
      return Promise.resolve({})
    default:
      return Promise.resolve({})
  }
}

function call(api, options) {
  if (state.demo) return demoCall(api, options)
  return new Promise(function (resolve, reject) {
    if (typeof wx === 'undefined' || typeof wx[api] !== 'function') {
      reject(normalizeError(api, { errCode: -1, errMsg: '当前基础库不支持 ' + api }))
      return
    }
    wx[api](Object.assign({}, options || {}, {
      success: resolve,
      fail: function (err) { reject(normalizeError(api, err)) }
    }))
  })
}

function delay(ms) {
  if (!ms) return Promise.resolve()
  return new Promise(function (resolve) { setTimeout(resolve, ms) })
}

function registerHandlers() {
  if (handlers.registered) return

  handlers.adapter = function (res) {
    state.adapterAvailable = !!res.available
    if (!res.available) {
      state.scanning = false
      state.connection = 'disconnected'
    }
    logger.warn('adapter', res.available ? '系统蓝牙已开启' : '系统蓝牙已关闭')
    emit('adapter', res)
    emit('state', snapshot())
  }

  handlers.found = function (res) {
    emit('devices', res.devices || [])
  }

  handlers.connection = function (res) {
    if (closingId && res.deviceId === closingId) return
    if (state.deviceId && res.deviceId !== state.deviceId) return
    state.deviceId = res.deviceId
    state.connection = res.connected ? 'connected' : 'disconnected'
    logger.info('ble', res.connected ? '连接建立' : '连接断开')
    emit('connection', res)
    emit('state', snapshot())
  }

  handlers.value = function (res) {
    emitValue(res)
  }

  wx.onBluetoothAdapterStateChange(handlers.adapter)
  wx.onBluetoothDeviceFound(handlers.found)
  wx.onBLEConnectionStateChanged(handlers.connection)
  wx.onBLECharacteristicValueChange(handlers.value)
  handlers.registered = true
}

function unregisterHandlers() {
  const pairs = [
    ['offBluetoothAdapterStateChange', handlers.adapter],
    ['offBluetoothDeviceFound', handlers.found],
    ['offBLEConnectionStateChanged', handlers.connection],
    ['offBLECharacteristicValueChange', handlers.value]
  ]
  for (let i = 0; i < pairs.length; i++) {
    if (typeof wx[pairs[i][0]] === 'function' && pairs[i][1]) {
      try { wx[pairs[i][0]](pairs[i][1]) } catch (e) { /* ignore */ }
    }
  }
  handlers.registered = false
}

function init() {
  if (state.initialized) return Promise.resolve(snapshot())
  return call('openBluetoothAdapter', { mode: 'central' })
    .catch(function (err) {
      const raw = String((err.raw && err.raw.errMsg) || '')
      if (err.errCode === 10013 || /parameter|not support/i.test(raw)) {
        return call('openBluetoothAdapter', {})
      }
      throw err
    })
    .then(function () {
      state.initialized = true
      state.adapterAvailable = true
      // 演示模式不注册 wx 监听，也就不触发任何隐私接口
      if (!state.demo) registerHandlers()
      logger.info('ble', state.demo ? '演示模式已启用' : '蓝牙适配器已初始化')
      emit('state', snapshot())
      return snapshot()
    })
    .catch(function (err) {
      logger.error('ble', '初始化失败: ' + err.message)
      throw err
    })
}

function startScan(options) {
  const opts = options || {}
  return init().then(function () {
    // 重复调用时先停止，避免部分 Android 机型报「已在扫描中」
    if (!state.scanning) return null
    return call('stopBluetoothDevicesDiscovery').catch(function () { return null })
  }).then(function () {
    return call('startBluetoothDevicesDiscovery', {
      services: opts.services || [],
      allowDuplicatesKey: opts.allowDuplicates !== false,
      interval: 0,
      powerLevel: 'high'
    })
  }).then(function () {
    state.scanning = true
    if (state.demo) {
      demo.start(function (devices) { emit('devices', devices) })
    }
    logger.info('scan', '开始扫描')
    emit('state', snapshot())
    return snapshot()
  })
}

function stopScan() {
  if (!state.initialized) {
    state.scanning = false
    emit('state', snapshot())
    return Promise.resolve(snapshot())
  }
  return call('stopBluetoothDevicesDiscovery')
    .catch(function () { return null })
    .then(function () {
      state.scanning = false
      if (state.demo) demo.stopBroadcast()
      logger.info('scan', '停止扫描')
      emit('state', snapshot())
      return snapshot()
    })
}

function negotiateMtu() {
  const desired = Math.max(23, Math.min(517, config.mtu || 23))
  // 期望值就是默认值时无需协商，直接按 23 计算（有效载荷 20 字节）
  if (desired <= 23 || typeof wx.setBLEMTU !== 'function') {
    state.mtu = 23
    emit('state', snapshot())
    return Promise.resolve(state.mtu)
  }
  return call('setBLEMTU', {
    deviceId: state.deviceId,
    mtu: desired
  }).then(function (res) {
    state.mtu = (res && res.mtu) ? res.mtu : desired
    logger.info('ble', 'MTU 协商结果 ' + state.mtu)
    emit('state', snapshot())
    return state.mtu
  }).catch(function () {
    // iOS 通常不支持主动协商。此时真实 MTU 仍是 23，
    // 必须回落而不是沿用期望值，否则会按超大分片写入导致失败。
    state.mtu = 23
    logger.warn('ble', 'MTU 协商失败，回退到 23')
    emit('state', snapshot())
    return state.mtu
  })
}

function connect(deviceId) {
  if (!deviceId) return Promise.reject(new Error('缺少 deviceId'))
  closingId = ''
  return init()
    .then(function () {
      return state.scanning ? stopScan() : null
    })
    .then(function () {
      state.deviceId = deviceId
      state.connection = 'connecting'
      emit('state', snapshot())
      return call('createBLEConnection', { deviceId: deviceId, timeout: 10000 })
    })
    .then(function () {
      state.connection = 'connected'
      logger.info('ble', '已连接 ' + deviceId)
      if (state.demo) emit('connection', { deviceId: deviceId, connected: true })
      emit('state', snapshot())
      return negotiateMtu()
    })
    .catch(function (err) {
      state.connection = 'disconnected'
      logger.error('ble', '连接失败: ' + err.message)
      emit('state', snapshot())
      throw err
    })
}

function getServices(deviceId) {
  return call('getBLEDeviceServices', { deviceId: deviceId || state.deviceId })
    .then(function (res) { return res.services || [] })
}

function getCharacteristics(deviceId, serviceId) {
  return call('getBLEDeviceCharacteristics', {
    deviceId: deviceId || state.deviceId,
    serviceId: serviceId
  }).then(function (res) { return res.characteristics || [] })
}

function read(params) {
  return call('readBLECharacteristicValue', {
    deviceId: params.deviceId,
    serviceId: params.serviceId,
    characteristicId: params.characteristicId
  }).then(function (res) {
    logger.info('read', '读取 ' + uuids.displayUuid(params.characteristicId))
    return res
  })
}

function notify(params) {
  const options = {
    deviceId: params.deviceId,
    serviceId: params.serviceId,
    characteristicId: params.characteristicId,
    state: !!params.enable
  }
  if (params.indicate) options.type = 'indication'
  return call('notifyBLECharacteristicValueChange', options)
    .catch(function (err) {
      if (options.type) {
        const retry = Object.assign({}, options)
        delete retry.type
        return call('notifyBLECharacteristicValueChange', retry)
      }
      throw err
    })
    .then(function (res) {
      logger.info('notify', (params.enable ? '开启 ' : '关闭 ') + uuids.displayUuid(params.characteristicId))
      return res
    })
}

function write(params) {
  const maxChunk = Math.max(20, Math.min(512, state.mtu - 3))
  const chunks = format.chunkBuffer(params.buffer, maxChunk)
  const base = {
    deviceId: params.deviceId,
    serviceId: params.serviceId,
    characteristicId: params.characteristicId
  }
  if (params.writeType === 'writeNoResponse') base.writeType = 'writeNoResponse'

  let chain = Promise.resolve()
  chunks.forEach(function (chunk, index) {
    chain = chain.then(function () {
      return call('writeBLECharacteristicValue', Object.assign({}, base, { value: chunk }))
        .catch(function (err) {
          if (!base.writeType) throw err
          const retry = Object.assign({}, base)
          delete retry.writeType
          return call('writeBLECharacteristicValue', Object.assign({}, retry, { value: chunk }))
        })
    }).then(function () {
      const suffix = chunks.length > 1 ? ' (' + (index + 1) + '/' + chunks.length + ')' : ''
      logger.tx('WRITE ' + uuids.displayUuid(params.characteristicId) + suffix, format.toHex(chunk))
    }).then(function () {
      return delay(chunks.length > 1 ? 30 : 0)
    })
  })
  return chain
}

function closeConnection(deviceId) {
  const id = deviceId || state.deviceId
  if (!id || !state.initialized) {
    state.connection = 'disconnected'
    state.deviceId = ''
    emit('state', snapshot())
    return Promise.resolve(snapshot())
  }
  closingId = id
  return call('closeBLEConnection', { deviceId: id })
    .catch(function () { return null })
    .then(function () {
      state.connection = 'disconnected'
      state.deviceId = ''
      logger.info('ble', '连接已关闭')
      if (state.demo) emit('connection', { deviceId: id, connected: false })
      emit('state', snapshot())
      setTimeout(function () {
        if (closingId === id) closingId = ''
      }, 1500)
      return snapshot()
    })
}

function release() {
  const tasks = []
  if (state.initialized && state.scanning) {
    tasks.push(call('stopBluetoothDevicesDiscovery').catch(function () { return null }))
  }
  if (state.initialized && state.deviceId) {
    tasks.push(call('closeBLEConnection', { deviceId: state.deviceId }).catch(function () { return null }))
  }
  return Promise.all(tasks).then(function () {
    if (!state.initialized) return null
    return call('closeBluetoothAdapter').catch(function () { return null })
  }).then(function () {
    unregisterHandlers()
    demo.stop()
    closingId = ''
    state.initialized = false
    state.adapterAvailable = false
    state.scanning = false
    state.connection = 'disconnected'
    state.deviceId = ''
    emit('state', snapshot())
    return snapshot()
  })
}

module.exports = {
  on: on,
  off: off,
  setDemoMode: function (value) {
    state.demo = !!value
    if (!state.demo) demo.stop()
  },
  isDemoMode: function () { return state.demo },
  configure: function (opts) {
    // 只记录期望值，state.mtu 必须由协商结果决定
    if (opts && opts.mtu) config.mtu = opts.mtu
  },
  getState: snapshot,
  init: init,
  startScan: startScan,
  stopScan: stopScan,
  connect: connect,
  closeConnection: closeConnection,
  release: release,
  setMTU: negotiateMtu,
  getServices: getServices,
  getCharacteristics: getCharacteristics,
  read: read,
  write: write,
  notify: notify,
  describeError: function (err) {
    return (err && err.message) || String(err || '未知错误')
  }
}
