# Wechat-Little-BLE

对标 nRF Connect 的微信小程序 BLE 调试工具。扫描周边低功耗蓝牙设备、解析广播数据、浏览 GATT 服务与特征值，并对特征值执行读取、写入与订阅。

## 功能

- **扫描页**：卡片式设备列表、实时 RSSI 信号条、名称/MAC/厂商搜索、已收藏 / 仅可连接 / 强信号筛选、下拉刷新、自动停止扫描；展开可查看广播原始数据与 AD Structure 解析结果（Flags、设备名、发射功率、服务 UUID、厂商数据、服务数据）。
- **设备页**：连接状态与 MTU 展示、可折叠服务树、Bluetooth SIG UUID 名称字典、特征值属性徽标、HEX / UTF-8 / DEC / BIN 格式切换、已知特征值语义解析（电池电量、心率等）、Read / Write / Notify / Indicate 操作、按 MTU-3 自动分包写入、writeNoResponse 支持。
- **通信日志**：结构化记录扫描、连接、读写与订阅事件，按方向和类型筛选、搜索、复制导出、清空。
- **设置页**：RSSI 阈值、重复广播、自动停止扫描、期望 MTU、默认数值格式、本地数据清理。

## 运行

1. 用微信开发者工具导入本目录。
2. 把 `project.config.json` 中的 `appid` 从 `touristappid` 换成自己的小程序 AppID（游客模式无法调用蓝牙接口）。
3. 基础库版本选择 2.10.3 及以上，配置里默认 3.5.0。
4. **必须用真机调试**，模拟器不支持 BLE。
5. 打开系统蓝牙；Android 6.0+ 还需授予定位权限并打开定位开关，否则无法搜索设备。

## 目录结构

```
app.js / app.json / app.wxss     全局状态、路由与 tabBar、设计 token
utils/ble.js                     wx BLE API 的 Promise 封装、连接状态机、事件监听统一管理
utils/logger.js                  结构化通信日志（内存环形缓冲 + 本地持久化）
utils/adv.js                     广播 AD Structure 解析
utils/uuids.js                   SIG UUID 名称字典与特征值语义解析
utils/format.js                  HEX / UTF-8 / DEC / BIN 转换、输入校验、MTU 分包
pages/scan                       设备扫描
pages/conn                       设备详情与特征值调试
pages/logs                       通信日志
pages/settings                   设置
```

## 平台限制

微信小程序 BLE 接口默认以手机为中心设备（Central），因此以下能力无法与 Android 版 nRF Connect 完全对齐：

- 无连接态 `readRSSI`，RSSI 只能来自扫描广播；
- `getBLEDeviceCharacteristics` 不返回 Descriptor / CCCD 列表；
- 不提供配对/绑定设备管理；
- `wx.setBLEMTU` 主要在 Android 生效，iOS 会忽略协商失败；MTU 未知时按 20 字节分包；
- 广播解析依赖 `advertisData` 等字段的实际下发情况，不同机型可能有差异；
- 后台运行时扫描会受系统限制。

## 许可

MIT，见 [LICENSE](LICENSE)。
