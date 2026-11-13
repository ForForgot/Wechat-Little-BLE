const format = require('./format.js')

const SIG_SUFFIX = '00001000800000805F9B34FB'

const NAMES = {
  '1800': '通用访问',
  '1801': '通用属性',
  '180A': '设备信息',
  '180D': '心率',
  '180F': '电池服务',
  '1810': '血压',
  '1812': '人机接口',
  '1816': '骑行速度与踏频',
  '1818': '骑行功率',
  '181A': '环境传感',
  '1826': '健身器材',
  'FFE0': '串口透传 (HM-10)',
  'FFF0': '通用透传',
  '2A00': '设备名称',
  '2A01': '外观',
  '2A04': '首选连接参数',
  '2A19': '电池电量',
  '2A23': '系统 ID',
  '2A24': '型号',
  '2A25': '序列号',
  '2A26': '固件版本',
  '2A27': '硬件版本',
  '2A28': '软件版本',
  '2A29': '厂商名称',
  '2A37': '心率测量',
  '2A38': '传感器位置',
  '2A39': '心率控制点',
  '2A1C': '温度测量',
  '2A1D': '温度类型',
  '2A6E': '温度',
  'FFE1': '透传数据',
  'FFF1': '透传数据',
  'FFF2': '透传配置',
  '2902': '客户端特征配置'
}

const FULL_NAMES = {
  '6E400001B5A3F393E0A9E50E24DCCA9E': 'Nordic UART 服务',
  '6E400002B5A3F393E0A9E50E24DCCA9E': 'Nordic UART RX',
  '6E400003B5A3F393E0A9E50E24DCCA9E': 'Nordic UART TX'
}

const TEXT_CHARS = ['2A00', '2A24', '2A25', '2A26', '2A27', '2A28', '2A29']

function compact(uuid) {
  return String(uuid || '').toUpperCase().replace(/-/g, '')
}

function shortCode(uuid) {
  const s = compact(uuid)
  if (s.length === 4) return s
  if (s.length === 32 && s.slice(8) === SIG_SUFFIX) return s.slice(4, 8)
  return ''
}

// 把 16 位短 UUID 或去掉连字符的 128 位字符串展开成标准 128 位形式。
// 微信 iOS / Android 8.0.9+ 可直接用短 UUID，但补齐后跨平台最稳妥。
function expand(uuid) {
  const s = compact(uuid)
  if (s.length === 4) return '0000' + s + '-0000-1000-8000-00805F9B34FB'
  if (s.length === 32) {
    return s.slice(0, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16) +
      '-' + s.slice(16, 20) + '-' + s.slice(20)
  }
  return String(uuid || '')
}

function displayUuid(uuid) {
  const short = shortCode(uuid)
  if (short) return short
  const s = compact(uuid)
  if (s.length === 8) return s
  return s ? s.slice(0, 8) + '…' : '未知 UUID'
}

function nameOf(uuid) {
  const short = shortCode(uuid)
  if (short && NAMES[short]) return NAMES[short]
  const full = FULL_NAMES[compact(uuid)]
  if (full) return full
  return ''
}

function isSystemService(uuid) {
  const short = shortCode(uuid)
  return short === '1800' || short === '1801'
}

function decodeValue(uuid, buffer) {
  const short = shortCode(uuid)
  const bytes = new Uint8Array(buffer || new ArrayBuffer(0))
  if (!bytes.length) return ''

  if (short === '2A19') return bytes[0] + ' %'
  if (short === '2A37') {
    const flags = bytes[0]
    if (flags & 0x01) {
      if (bytes.length < 3) return ''
      return (bytes[1] + (bytes[2] << 8)) + ' bpm'
    }
    // 只有 flags 一个字节时没有测量值，不能把 flags 当心率
    if (bytes.length < 2) return ''
    return bytes[1] + ' bpm'
  }
  if (short === '2A6E' && bytes.length >= 2) {
    return (bytes[0] + (bytes[1] << 8)) / 100 + ' °C'
  }
  if (TEXT_CHARS.indexOf(short) >= 0) return format.utf8Decode(buffer)
  if (short === 'FFE1' || short === 'FFF1') return format.utf8Decode(buffer)
  return ''
}

module.exports = {
  compact: compact,
  shortCode: shortCode,
  expand: expand,
  displayUuid: displayUuid,
  nameOf: nameOf,
  isSystemService: isSystemService,
  decodeValue: decodeValue
}
