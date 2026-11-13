const logger = require('../../utils/logger.js')

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'in', label: '接收' },
  { key: 'out', label: '发送' },
  { key: 'system', label: '系统' },
  { key: 'error', label: '错误' }
]

function view(entry) {
  return {
    id: entry.id,
    time: entry.time,
    dir: entry.dir,
    dirLabel: entry.dir === 'in' ? '收' : (entry.dir === 'out' ? '发' : '系'),
    dirClass: entry.dir === 'in' ? 'log-in' : (entry.dir === 'out' ? 'log-out' : 'log-sys'),
    type: entry.type,
    title: entry.title,
    data: entry.data,
    ok: entry.ok
  }
}

Page({
  data: {
    filters: FILTERS,
    filter: 'all',
    keyword: '',
    logs: [],
    total: 0
  },

  onLoad: function () {
    this._unsub = logger.subscribe(this.scheduleRefresh.bind(this))
    this.refresh(logger.list())
  },

  onShow: function () {
    this.refresh(logger.list())
  },

  onUnload: function () {
    if (this._unsub) this._unsub()
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
  },

  // 高频日志时合并刷新，避免每条日志都全量重筛并 setData
  scheduleRefresh: function () {
    if (this._timer) return
    const that = this
    this._timer = setTimeout(function () {
      that._timer = null
      that.refresh(logger.list())
    }, 500)
  },

  refresh: function (entries) {
    const filter = this.data.filter
    const keyword = (this.data.keyword || '').trim().toLowerCase()
    const list = []
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      if (filter === 'error' && e.ok !== false) continue
      if (filter !== 'all' && filter !== 'error' && e.dir !== filter) continue
      if (keyword) {
        const hay = (e.title + ' ' + e.data).toLowerCase()
        if (hay.indexOf(keyword) < 0) continue
      }
      list.push(view(e))
    }
    this.setData({ logs: list, total: entries.length })
  },

  setFilter: function (e) {
    this.setData({ filter: e.currentTarget.dataset.key })
    this.refresh(logger.list())
  },

  onSearch: function (e) {
    this.setData({ keyword: e.detail.value })
    this.refresh(logger.list())
  },

  clearLogs: function () {
    const that = this
    wx.showModal({
      title: '清空日志',
      content: '将删除全部本地通信日志，此操作不可撤销。',
      success: function (res) {
        if (!res.confirm) return
        logger.clear()
        that.refresh(logger.list())
        wx.showToast({ title: '已清空', icon: 'success' })
      }
    })
  },

  copyLogs: function () {
    const lines = this.data.logs.map(function (e) {
      return e.time + ' [' + e.dirLabel + '] ' + e.title + (e.data ? ' | ' + e.data : '')
    })
    if (!lines.length) {
      wx.showToast({ title: '没有可复制的日志', icon: 'none' })
      return
    }
    // setClipboardData 自带「内容已复制」提示，无需再加 toast
    wx.setClipboardData({ data: lines.join('\n') })
  },

  bindItem: function (e) {
    const data = e.currentTarget.dataset.data
    if (!data) return
    wx.setClipboardData({ data: data })
  }
})
