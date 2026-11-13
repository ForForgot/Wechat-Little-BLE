const format = require('./format.js')

function sig(short) {
  return '0000' + short + '-0000-1000-8000-00805F9B34FB'
}

const UART_SERVICE = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E'
const UART_RX = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E'
const UART_TX = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'

function ad(type, bytes) {
  const arr = new Uint8Array(2 + bytes.length)
  arr[0] = 1 + bytes.length
  arr[1] = type
  arr.set(bytes, 2)
  return arr
}

function ascii(str) {
  const arr = []
  for (let i = 0; i < str.length; i++) arr.push(str.charCodeAt(i) & 0xff)
  return arr
}

function uuid16le(short) {
  const n = parseInt(short, 16)
  return [n & 0xff, (n >> 8) & 0xff]
}

function concat(list) {
  let len = 0
  list.forEach(function (a) { len += a.length })
  const out = new Uint8Array(len)
  let pos = 0
  list.forEach(function (a) {
    out.set(a, pos)
    pos += a.length
  })
  return out
}

function adv(parts) {
  return concat(parts.map(function (p) { return ad(p[0], p[1]) })).buffer
}

const DEVICES = [
  {
    deviceId: 'DEMO-AA-BB-CC-DD-EE-01',
    name: 'Nordic_HRM',
    rssi: -52,
    connectable: true,
    localName: 'Nordic_HRM',
    advertisServiceUUIDs: [sig('180D')],
    advertisData: adv([
      [0x01, [0x06]],
      [0x03, uuid16le('180D')],
      [0x09, ascii('Nordic_HRM')],
      [0x0A, [0xF6]]
    ])
  },
  {
    deviceId: 'DEMO-AA-BB-CC-DD-EE-02',
    name: 'Thermo_01',
    rssi: -74,
    connectable: true,
    localName: 'Thermo_01',
    advertisServiceUUIDs: [sig('181A')],
    advertisData: adv([
      [0x01, [0x06]],
      [0x03, uuid16le('181A')],
      [0x09, ascii('Thermo_01')],
      [0x04, [0xFF, 0x59, 0x00, 0xAA]]
    ])
  },
  {
    deviceId: 'DEMO-AA-BB-CC-DD-EE-03',
    name: 'UART_Board',
    rssi: -63,
    connectable: true,
    localName: 'UART_Board',
    advertisServiceUUIDs: [UART_SERVICE],
    advertisData: adv([
      [0x01, [0x06]],
      [0x07, [0x9E, 0xDC, 0x24, 0x0E, 0xE5, 0xA9, 0xE0, 0x93, 0xF3, 0xA5, 0xB3, 0x01, 0x00, 0x40, 0x6E, 0x00]],
      [0x09, ascii('UART_Board')]
    ])
  },
  {
    deviceId: 'DEMO-AA-BB-CC-DD-EE-04',
    name: 'Beacon_04',
    rssi: -88,
    connectable: false,
    localName: 'Beacon_04',
    advertisServiceUUIDs: [],
    advertisData: adv([
      [0x01, [0x04]],
      [0x09, ascii('Beacon_04')],
      [0xFF, [0x4C, 0x00, 0x02, 0x15]]
    ])
  }
]

const SERVICE_MAP = {
  'DEMO-AA-BB-CC-DD-EE-01': [sig('180F'), sig('180D')],
  'DEMO-AA-BB-CC-DD-EE-02': [sig('180F'), sig('181A')],
  'DEMO-AA-BB-CC-DD-EE-03': [UART_SERVICE],
  'DEMO-AA-BB-CC-DD-EE-04': []
}

const CHARACTERISTIC_MAP = {}
CHARACTERISTIC_MAP[sig('180F')] = [
  { uuid: sig('2A19'), properties: { read: true, notify: true } }
]
CHARACTERISTIC_MAP[sig('180D')] = [
  { uuid: sig('2A37'), properties: { notify: true } },
  { uuid: sig('2A38'), properties: { read: true } }
]
CHARACTERISTIC_MAP[sig('181A')] = [
  { uuid: sig('2A6E'), properties: { read: true, notify: true } }
]
CHARACTERISTIC_MAP[UART_SERVICE] = [
  { uuid: UART_RX, properties: { write: true, writeNoResponse: true } },
  { uuid: UART_TX, properties: { notify: true } }
]

let timer = null
let emitDevices = null
const notifyTimers = {}

function snapshot() {
  return DEVICES.map(function (d) {
    return {
      deviceId: d.deviceId,
      name: d.name,
      RSSI: d.rssi + Math.round((Math.random() - 0.5) * 6),
      connectable: d.connectable,
      localName: d.localName,
      advertisServiceUUIDs: d.advertisServiceUUIDs,
      advertisData: d.advertisData
    }
  })
}

function tick() {
  if (emitDevices) emitDevices(snapshot())
}

function start(emit) {
  stop()
  emitDevices = emit
  tick()
  timer = setInterval(tick, 800)
}

function stopBroadcast() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  emitDevices = null
}

function stop() {
  stopBroadcast()
  Object.keys(notifyTimers).forEach(function (key) {
    clearInterval(notifyTimers[key])
    delete notifyTimers[key]
  })
}

function services(deviceId) {
  return (SERVICE_MAP[deviceId] || []).map(function (uuid) {
    return { uuid: uuid, isPrimary: true }
  })
}

function characteristics(serviceId) {
  return (CHARACTERISTIC_MAP[serviceId] || []).map(function (c) {
    return { uuid: c.uuid, properties: Object.assign({}, c.properties) }
  })
}

function valueFor(characteristicId) {
  const short = String(characteristicId).slice(4, 8)
  if (short === '2A19') return new Uint8Array([85]).buffer
  if (short === '2A37') return new Uint8Array([0x00, 72]).buffer
  if (short === '2A38') return new Uint8Array([0x01]).buffer
  if (short === '2A6E') return new Uint8Array([0x92, 0x09]).buffer
  if (String(characteristicId).indexOf('6E400003') === 0) {
    return format.utf8Encode('PING 123')
  }
  return new Uint8Array([0x01, 0x02]).buffer
}

function setNotify(characteristicId, enable, emitValue) {
  if (!enable) {
    if (notifyTimers[characteristicId]) {
      clearInterval(notifyTimers[characteristicId])
      delete notifyTimers[characteristicId]
    }
    return
  }
  if (notifyTimers[characteristicId]) return
  emitValue(valueFor(characteristicId))
  notifyTimers[characteristicId] = setInterval(function () {
    emitValue(valueFor(characteristicId))
  }, 1500)
}

module.exports = {
  start: start,
  stop: stop,
  stopBroadcast: stopBroadcast,
  services: services,
  characteristics: characteristics,
  valueFor: valueFor,
  setNotify: setNotify,
  isDemoDevice: function (deviceId) {
    return String(deviceId).indexOf('DEMO-') === 0
  }
}
