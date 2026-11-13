const ble = require('./utils/ble.js')
const logger = require('./utils/logger.js')
const signal = require('./utils/signal.js')

const SETTINGS_KEY = 'ble_settings'
const FAVORITES_KEY = 'ble_favorites'

const DEFAULT_SETTINGS = {
  rssiThreshold: -95,
  onlyConnectable: false,
  favoritesOnly: false,
  allowDuplicates: true,
  defaultFormat: 'HEX',
  mtu: 23,
  scanTimeout: 12,
  demoMode: false
}

App({
  globalData: {
    ble: ble,
    logger: logger,
    signal: signal,
    settings: DEFAULT_SETTINGS,
    favorites: [],
    activeDevice: null,
    lastTarget: { serviceUuid: '', characteristicUuid: '' }
  },

  onLaunch: function () {
    const saved = wx.getStorageSync(SETTINGS_KEY) || {}
    this.globalData.settings = Object.assign({}, DEFAULT_SETTINGS, saved)
    this.globalData.favorites = wx.getStorageSync(FAVORITES_KEY) || []
    ble.configure({ mtu: this.globalData.settings.mtu })
    ble.setDemoMode(!!this.globalData.settings.demoMode)
    logger.info('system', '小程序启动')
  },

  getSettings: function () {
    return this.globalData.settings
  },

  saveSettings: function (patch) {
    this.globalData.settings = Object.assign({}, this.globalData.settings, patch)
    wx.setStorageSync(SETTINGS_KEY, this.globalData.settings)
    return this.globalData.settings
  },

  getFavorites: function () {
    return this.globalData.favorites
  },

  isFavorite: function (deviceId) {
    return this.globalData.favorites.indexOf(deviceId) >= 0
  },

  toggleFavorite: function (deviceId) {
    const list = this.globalData.favorites.slice()
    const index = list.indexOf(deviceId)
    if (index >= 0) {
      list.splice(index, 1)
    } else {
      list.push(deviceId)
    }
    this.globalData.favorites = list
    wx.setStorageSync(FAVORITES_KEY, list)
    return index < 0
  },

  resetSettings: function () {
    this.globalData.settings = Object.assign({}, DEFAULT_SETTINGS)
    wx.setStorageSync(SETTINGS_KEY, this.globalData.settings)
    return this.globalData.settings
  },

  clearFavorites: function () {
    this.globalData.favorites = []
    wx.setStorageSync(FAVORITES_KEY, [])
  },

  setLastTarget: function (serviceUuid, characteristicUuid) {
    this.globalData.lastTarget = {
      serviceUuid: serviceUuid || '',
      characteristicUuid: characteristicUuid || ''
    }
  },

  getLastTarget: function () {
    return this.globalData.lastTarget
  },

  setActiveDevice: function (device) {
    this.globalData.activeDevice = device
  },

  getActiveDevice: function () {
    return this.globalData.activeDevice
  }
})
