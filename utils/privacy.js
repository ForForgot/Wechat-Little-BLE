const DECLARATION_HINT = '隐私协议未配置：请在小程序后台「设置 → 服务内容声明 → 用户隐私保护指引」中声明蓝牙、位置信息与剪贴板'
const REJECT_HINT = '需同意隐私协议后才能使用蓝牙功能'

function messageOf(err) {
  return String((err && (err.errMsg || (err.raw && err.raw.errMsg) || err.message)) || '')
}

function codeOf(err) {
  if (!err) return 0
  return err.errno || err.errCode || 0
}

function isPrivacyError(err) {
  return /privacy|隐私|api scope|112|103|104/i.test(messageOf(err))
}

// 基础库 2.32.3 起，隐私接口调用前必须同步用户的同意状态。
// 未处理 onNeedPrivacyAuthorization 时，微信会自行弹出官方授权弹窗。
function ensure() {
  return new Promise(function (resolve) {
    if (typeof wx === 'undefined' || typeof wx.requirePrivacyAuthorize !== 'function') {
      // 低版本基础库未集成隐私拦截，直接放行
      resolve({ ok: true, kind: '', message: '' })
      return
    }
    wx.requirePrivacyAuthorize({
      success: function () {
        resolve({ ok: true, kind: '', message: '' })
      },
      fail: function (err) {
        const msg = messageOf(err)
        const code = codeOf(err)
        if (code === 112 || /not declared|privacy api banned|未声明/i.test(msg)) {
          resolve({ ok: false, kind: 'config', message: DECLARATION_HINT })
        } else if (code === 103 || code === 104 || /reject|deny|auth|拒绝/i.test(msg)) {
          resolve({
            ok: false,
            kind: 'privacy',
            message: REJECT_HINT + '；微信对拒绝后的弹窗有 10 秒冷却，请稍后点击重新授权'
          })
        } else {
          resolve({ ok: false, kind: 'privacy', message: REJECT_HINT + '（' + (msg || '授权未完成') + '）' })
        }
      }
    })
  })
}

// 真实 BLE 调用仍可能因声明缺失而失败，用于把错误翻译成可操作的提示
function describe(err) {
  if (!isPrivacyError(err)) return ''
  const msg = messageOf(err)
  if (/not declared|privacy api banned|未声明|112/i.test(msg)) return DECLARATION_HINT
  if (codeOf(err) === 103 || codeOf(err) === 104 || /reject|deny|拒绝/i.test(msg)) {
    return REJECT_HINT + '，请稍后点击重新授权'
  }
  return REJECT_HINT
}

module.exports = {
  ensure: ensure,
  describe: describe,
  isPrivacyError: isPrivacyError
}
