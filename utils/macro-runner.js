const ble = require('./ble.js')
const logger = require('./logger.js')
const format = require('./format.js')
const uuids = require('./uuids.js')
const macros = require('./macros.js')

let running = false
let stopped = false
let pending = null

function wait(ms) {
  return new Promise(function (resolve) {
    const handle = setTimeout(function () {
      pending = null
      resolve()
    }, ms)
    pending = { handle: handle, resolve: resolve }
  })
}

function targetOf(step, ctx) {
  const serviceId = uuids.expand(step.serviceUuid || ctx.serviceUuid || '')
  const characteristicId = uuids.expand(step.characteristicUuid || ctx.characteristicUuid || '')
  if (!serviceId || !characteristicId) {
    throw new Error('未指定目标特征值，请在运行面板中选择')
  }
  return { serviceId: serviceId, characteristicId: characteristicId }
}

function runStep(step, ctx) {
  switch (step.type) {
    case 'delay':
      return wait(Math.max(0, Math.min(60000, Number(step.ms) || 0)))

    case 'write': {
      const t = targetOf(step, ctx)
      const parsed = format.parseValue(step.value, step.format || 'HEX')
      if (!parsed.ok) throw new Error('命令数据无效：' + parsed.error)
      return ble.write({
        deviceId: ctx.deviceId,
        serviceId: t.serviceId,
        characteristicId: t.characteristicId,
        buffer: parsed.buffer,
        writeType: step.writeNoResponse ? 'writeNoResponse' : 'write'
      })
    }

    case 'read': {
      const t = targetOf(step, ctx)
      return ble.read({
        deviceId: ctx.deviceId,
        serviceId: t.serviceId,
        characteristicId: t.characteristicId
      })
    }

    case 'notify': {
      const t = targetOf(step, ctx)
      return ble.notify({
        deviceId: ctx.deviceId,
        serviceId: t.serviceId,
        characteristicId: t.characteristicId,
        enable: step.enable !== false
      })
    }

    default:
      return Promise.resolve()
  }
}

function run(macro, ctx) {
  const options = ctx || {}
  if (running) return Promise.resolve({ ok: false, message: '已有宏在运行' })
  const steps = (macro.steps || []).slice()
  if (!steps.length) return Promise.resolve({ ok: false, message: '该宏没有步骤' })

  running = true
  stopped = false
  logger.info('macro', '开始执行宏「' + macro.name + '」，共 ' + steps.length + ' 步')

  let chain = Promise.resolve()
  steps.forEach(function (step, index) {
    chain = chain.then(function () {
      if (stopped) return null
      if (options.onProgress) options.onProgress(index, steps.length, macros.stepLabel(step))
      return runStep(step, options)
    })
  })

  return chain.then(function () {
    running = false
    const ok = !stopped
    const message = ok ? '宏执行完成' : '宏已停止'
    if (ok) logger.info('macro', message + '：' + macro.name)
    else logger.warn('macro', message + '：' + macro.name)
    if (options.onDone) options.onDone(ok, message)
    return { ok: ok, message: message }
  }).catch(function (err) {
    running = false
    const message = (err && err.message) || String(err)
    logger.error('macro', '宏中断：' + message)
    if (options.onDone) options.onDone(false, message)
    return { ok: false, message: message }
  })
}

function stop() {
  if (!running) return
  stopped = true
  if (pending) {
    clearTimeout(pending.handle)
    const resolve = pending.resolve
    pending = null
    resolve()
  }
}

module.exports = {
  run: run,
  stop: stop,
  isRunning: function () { return running }
}
