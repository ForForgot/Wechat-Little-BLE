const format = require('./format.js')
const uuids = require('./uuids.js')

const AD_TYPES = {
  0x01: 'Flags',
  0x02: '16 位 UUID（部分）',
  0x03: '16 位 UUID（完整）',
  0x04: '32 位 UUID（部分）',
  0x05: '32 位 UUID（完整）',
  0x06: '128 位 UUID（部分）',
  0x07: '128 位 UUID（完整）',
  0x08: '短设备名',
  0x09: '完整设备名',
  0x0A: '发射功率',
  0x16: '服务数据 (16 位)',
  0x20: '服务数据 (32 位)',
  0x21: '服务数据 (128 位)',
  0xFF: '厂商自定义数据'
}

function typeName(type) {
  return AD_TYPES[type] || '0x' + ('0' + type.toString(16)).slice(-2).toUpperCase()
}

function hexByte(b) {
  return ('0' + b.toString(16)).slice(-2).toUpperCase()
}

function describe(type, data) {
  const bytes = new Uint8Array(data)
  if (!bytes.length) return ''
  switch (type) {
    case 0x08:
    case 0x09:
      // 部分设备会用 0x00 补齐广播名称，去掉尾部空字节
      return format.utf8Decode(data).replace(/\u0000+$/, '')
    case 0x0A: {
      const v = bytes[0] > 127 ? bytes[0] - 256 : bytes[0]
      return v + ' dBm'
    }
    case 0x01:
      return '0x' + hexByte(bytes[0])
    case 0x02:
    case 0x03: {
      const list = []
      for (let i = 0; i + 1 < bytes.length; i += 2) {
        const code = hexByte(bytes[i + 1]) + hexByte(bytes[i])
        list.push(code + (uuids.nameOf(code) ? ' ' + uuids.nameOf(code) : ''))
      }
      return list.join('、')
    }
    case 0x06:
    case 0x07: {
      const list = []
      for (let i = 0; i + 15 < bytes.length; i += 16) {
        const reversed = Array.prototype.slice.call(bytes, i, i + 16).reverse()
        list.push(format.toHex(new Uint8Array(reversed).buffer, ''))
      }
      return list.join('、')
    }
    case 0xFF: {
      const company = bytes.length >= 2
        ? '0x' + hexByte(bytes[1]) + hexByte(bytes[0])
        : ''
      return company + (bytes.length > 2 ? ' · ' + format.toHex(data.slice(2)) : '')
    }
    default:
      return format.toHex(data)
  }
}

function parseAdvertising(buffer) {
  const out = []
  if (!buffer) return out
  const bytes = new Uint8Array(buffer)
  let i = 0
  while (i < bytes.length) {
    const len = bytes[i]
    if (len === 0) {
      i++
      continue
    }
    if (i + 1 + len > bytes.length) break
    const type = bytes[i + 1]
    const data = bytes.slice(i + 2, i + 1 + len).buffer
    out.push({
      type: type,
      typeName: typeName(type),
      hex: format.toHex(data),
      text: describe(type, data)
    })
    i += 1 + len
  }
  return out
}

function serviceLabel(uuid) {
  const short = uuids.displayUuid(uuid)
  const name = uuids.nameOf(uuid)
  return name ? short + ' ' + name : short
}

function summarize(device) {
  const adv = parseAdvertising(device.advertisData)
  let localName = device.localName || ''
  let txPower = ''
  let manufacturer = ''
  const serviceLabels = []

  for (let i = 0; i < adv.length; i++) {
    const item = adv[i]
    if ((item.type === 0x08 || item.type === 0x09) && !localName) {
      localName = item.text
    } else if (item.type === 0x0A) {
      txPower = item.text
    } else if (item.type === 0xFF) {
      manufacturer = item.text
    } else if (item.type === 0x02 || item.type === 0x03 ||
               item.type === 0x06 || item.type === 0x07) {
      if (item.text) serviceLabels.push(item.text)
    }
  }

  const advertised = device.advertisServiceUUIDs || []
  for (let j = 0; j < advertised.length; j++) {
    serviceLabels.push(serviceLabel(advertised[j]))
  }

  if (!manufacturer && device.manufacturerData) {
    const bytes = new Uint8Array(device.manufacturerData)
    manufacturer = describe(0xFF, bytes.buffer)
  }

  const serviceData = []
  if (device.serviceData) {
    Object.keys(device.serviceData).forEach(function (key) {
      serviceData.push({
        uuid: serviceLabel(key),
        hex: format.toHex(device.serviceData[key])
      })
    })
  }

  const connectable = device.connectable !== false

  return {
    name: device.name || localName || '未命名设备',
    localName: localName,
    txPower: txPower,
    manufacturer: manufacturer,
    serviceLabels: serviceLabels,
    serviceData: serviceData,
    connectable: connectable,
    adv: adv,
    rawHex: format.toHex(device.advertisData)
  }
}

module.exports = {
  parseAdvertising: parseAdvertising,
  summarize: summarize,
  serviceLabel: serviceLabel,
  typeName: typeName
}
