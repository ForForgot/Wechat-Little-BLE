# Wechat-Little-BLE

对标 nRF Connect 的微信小程序 BLE 调试工具。扫描周边低功耗蓝牙设备、解析广播数据、浏览 GATT 服务与特征值，并对特征值执行读取、写入与订阅；内置命令收藏、宏序列、RSSI 曲线和演示模式。

> **当前状态**：开发版本。静态检查与 mock `wx` 冒烟测试已通过，**尚未完成微信开发者工具 / 真机双端验证**；`project.config.json` 里的 `appid` 仍是 `touristappid` 占位值，不能直接发布。

## 目录

- [快速开始](#快速开始)
- [功能一览](#功能一览)
- [架构与数据流](#架构与数据流)
- [使用指南](#使用指南)
- [配置项](#配置项)
- [本地数据与隐私](#本地数据与隐私)
- [错误排查](#错误排查)
- [平台限制](#平台限制)
- [目录结构](#目录结构)
- [开发验证](#开发验证)
- [发布前清单](#发布前清单)
- [参考文档](#参考文档)
- [许可](#许可)

## 快速开始

**有 BLE 硬件（真机）**

1. 用微信开发者工具导入本目录。
2. 把 `project.config.json` 中的 `appid` 换成自己的小程序 AppID（游客模式无法调用蓝牙接口）。
3. 基础库版本建议 **2.32.3 及以上**：隐私授权接口从 2.32.3 起生效，信号曲线用 canvas 2d，命令/宏命名弹窗用 `showModal` 可编辑模式。配置里默认 3.5.0。
4. **必须用真机调试**，模拟器不支持 BLE。
5. 打开系统蓝牙；Android 6.0+ 还需授予定位权限并打开定位开关，否则扫不到设备。
6. 首次进入时阅读并同意隐私协议，随后自动开始扫描。

**没有硬件 / 只想看界面**

在「设置 → 演示与帮助」或「使用说明」页开启**演示模式**。此时会展示 4 台模拟设备（含真实格式的广播数据、GATT 服务、模拟电量/心率/温度/Nordic UART 数据与定时通知），不需要蓝牙硬件、定位权限和隐私授权，也不会调用任何真实 `wx.*Bluetooth*` 接口。审核提审时可把这个模式写进备注，避免审核员因无硬件看到空白页。

## 功能一览

| 页面 | 主要能力 |
|---|---|
| **扫描** | 卡片式设备列表、实时 RSSI 信号条与迷你趋势、名称/MAC/厂商搜索、已收藏 / 仅可连接 / 强信号筛选、下拉刷新、自动停止扫描；展开查看广播原始 hex 与 AD Structure 解析（Flags、设备名、发射功率、服务 UUID、厂商数据、服务数据） |
| **信号曲线** | canvas 2d 实时折线图（最近 90 个采样、每 500 ms 一点）、当前/最强/最弱/平均统计、清空历史；进入该页时扫描继续保持 |
| **设备详情** | 连接状态与 MTU 展示、可折叠服务树、Bluetooth SIG UUID 名称字典、属性徽标、四种显示格式、已知特征值语义解析、Read / Write / Notify / Indicate、按 MTU 自动分包写入、writeNoResponse、常用命令填入、宏执行面板 |
| **调试库** | 常用命令增删改与复制；宏序列编排（写入、延时、读取、订阅开关），步骤支持上下移动、删除、清空；命令过多时自动分页 |
| **通信日志** | 结构化记录扫描、连接、读写、订阅与宏执行事件；按方向/错误筛选、搜索、复制导出、清空 |
| **设置** | 扫描阈值、重复广播、自动停止、期望 MTU、默认格式、演示模式、本地数据清理、使用说明入口 |
| **使用说明** | 快速开始、页面功能、数据格式、平台限制、隐私说明、演示模式引导 |

其他横切能力：

- **隐私同意门禁**：首次调用蓝牙前通过 `wx.requirePrivacyAuthorize` 同步用户同意状态，区分「后台未声明」「用户拒绝」「低版本基础库」并给出可重试的引导。
- **模拟传输层**：演示模式下 `utils/ble.js` 的 `call()` 直接短路到 `utils/demo.js`，所有页面复用同一套事件流，无需为演示写第二套 UI 逻辑。

## 架构与数据流

```
页面层   scan / signal / conn / library / logs / settings / help
           │  订阅事件（devices / state / connection / value / logs）
           ▼
状态层   app.globalData  +  ble（连接状态机） / logger / signal（RSSI 采样）
           │
           ▼
服务层   utils/ble.js  ── Promise 化 wx BLE API、错误码映射、4 个 wx 监听只注册一次
           │
           ├── utils/privacy.js   首次调用前同步隐私同意
           ├── utils/demo.js      演示模式短路，不触碰真实蓝牙
           ├── utils/logger.js    结构化日志（节流落盘）
           └── utils/signal.js    RSSI 历史采样与统计
           │
           ▼
系统层   微信 wx.*Bluetooth* / wx.authorize / wx.setClipboardData
```

纯函数与本地存储层（无 `wx` 依赖或只依赖本地存储）：`adv.js`（广播解析）、`uuids.js`（UUID 字典与值解析）、`format.js`（格式转换与分包）、`commands.js` / `macros.js` / `macro-runner.js`（命令与宏）。

这一层划分解决了原仓库的两个老问题：BLE 事件监听在每次按钮点击时重复注册、以及直接修改 `this.data`。现在所有 `on*` 监听由 `ble.js` 统一注册并在 `release()` 时成对解绑，页面只消费事件流。

## 使用指南

### 扫描与广播解析

设备卡片显示名称、RSSI、信号强度条和可连接状态；展开后能看到广播原始 hex 和逐段解析结果。搜索框支持名称、MAC/deviceId、厂商；筛选 chips 可叠加使用。超过 30 秒未再广播的设备不再展示，超过 60 秒从内存清理。

点击卡片进入设备页；「曲线」按钮进入信号曲线页，跳转期间扫描不会中断。

### 数据格式与写入

| 格式 | 显示示例 | 输入示例 | 约束 |
|---|---|---|---|
| `HEX` | `01 02 AB CD` | `01 02`、`0x0102`、`01-02` | 允许空格/逗号/连字符/冒号/`0x`；长度须为偶数 |
| `UTF8` | `中文AB` | `中文AB` | 手动 UTF-8 编解码，不含 BOM |
| `DEC` | `1 2 171 205` | `1 2 171 205` | 每个字节 0-255 |
| `BIN` | `00000001 00000010` | `0000000100000010` | 长度须为 8 的倍数 |

写入按 `MTU - 3` 自动分包（默认 20 字节/包，多包之间留 30 ms），UI 限制单次输入不超过 512 字节。特征值同时支持 Write 与 WriteNoResponse 时可在写入面板切换。收到的值除按当前格式显示外，还会对已知 UUID 解析成人可读值，例如 `2A19 → 85 %`、`2A37 → 72 bpm`。

### 常用命令与宏

- **常用命令**：在设备写入面板点「存为常用」，或在「调试库 → 常用命令」手动新增。字段包括名称、格式、数据、writeNoResponse，以及创建时记录的服务/特征 UUID。写入面板会列出这些命令，点一下即可填入。
- **宏**：由若干步骤顺序执行，支持四类：

  | 步骤 | 作用 |
  |---|---|
  | 写入 | 从常用命令选取，携带其格式、数据和写入方式 |
  | 延时 | 0-60000 ms，长延时可被「停止」立即中断 |
  | 读取 | 触发一次特征值读取 |
  | 订阅开关 | 开启/关闭 notify，点步骤上的「切」可切换 |

  运行时在设备页的宏面板选择目标特征值；步骤里**留空的 UUID 会自动使用该运行目标**，因此同一个宏可跨同类设备复用。需要指定其他特征值时用「服务/特征」格式，如 `180F/2A19`；16 位短 UUID 会自动展开为 128 位。

### 演示模式

开启后 `ble.js` 不再注册 wx 蓝牙监听、不弹定位授权、不调用隐私接口；4 台模拟设备每 800 ms 刷新一次 RSSI，订阅后每 1.5 s 推送一次模拟值。信号曲线、日志、宏、命令库在演示模式下都照常工作。

## 配置项

| 配置 | 默认值 | 说明 |
|---|---|---|
| `rssiThreshold` | `-95` dBm | 信号弱于该值的设备不显示 |
| `allowDuplicates` | `true` | 关闭后只有首次发现时采样，RSSI 曲线不再连续 |
| `scanTimeout` | `12` 秒 | `0` 表示持续扫描直到手动停止 |
| `mtu` | `23` | 期望值；仅在协商成功时生效，失败自动回退 23 |
| `defaultFormat` | `HEX` | 设备页数值显示格式 |
| `demoMode` | `false` | 演示模式开关 |
| `onlyConnectable` / `favoritesOnly` | `false` | 扫描页筛选状态，会持久化 |

## 本地数据与隐私

代码不发起任何网络请求，也没有第三方 SDK。蓝牙、位置信息与剪贴板权限仅用于设备发现、扫描与日志复制。全部数据存在小程序本地存储：

| Storage key | 内容 | 清理入口 |
|---|---|---|
| `ble_settings` | 上表配置 | 设置 → 恢复默认 |
| `ble_favorites` | 收藏的设备 ID | 设置 → 清空收藏 |
| `ble_logs` | 最近 400 条通信日志（静默 1.2 s 落盘，持续刷屏时最多每 5 s 强制落盘） | 日志页 / 设置 → 清空日志 |
| `ble_commands` | 常用命令 | 设置 → 清空调试库 |
| `ble_macros` | 宏与步骤 | 设置 → 清空调试库 |

发布时《用户隐私保护指引》可据此填写「仅本地存储、不上传、不共享」。

## 错误排查

| 现象 | 原因 | 处理 |
|---|---|---|
| `10001` | 系统蓝牙未开启或设备不支持 BLE | 打开系统蓝牙后点错误条上的「重试」 |
| Android 扫不到任何设备 | 未授予定位权限或定位开关未打开 | 点错误条「去设置」授权 |
| `api scope is not declared in the privacy agreement`（errno 112） | 后台《用户隐私保护指引》未声明蓝牙/位置/剪贴板 | 在后台补齐声明，约 5 分钟生效 |
| 错误码 `103` / `104` | 用户拒绝了隐私授权弹窗 | 微信对拒绝后的弹窗有 10 秒冷却，稍后点「重新授权」 |
| iOS 上写入失败 | `wx.setBLEMTU` 在 iOS 不生效 | 代码已自动回退到 23（20 字节分包）；不要把设置里的期望 MTU 调得过高 |
| 信号曲线不动 | 关闭了「允许重复广播」，或设备已停止广播 | 在设置中开启该项 |
| 模拟器列表始终为空 | 模拟器不支持 BLE | 用真机，或开启演示模式 |
| Android `state 133 GATT ERROR` | 连接未成对关闭 | 代码统一走 `closeConnection()`；避免强杀小程序 |
| 其他 `10000`-`10013` | 微信 BLE 接口错误 | 完整中文映射见 `utils/ble.js` 的 `ERROR_MESSAGES` |

## 平台限制

微信小程序 BLE 接口默认以手机为中心设备（Central），因此以下能力无法与 Android 版 nRF Connect 完全对齐：

- 无连接态 `readRSSI`，RSSI 只能来自扫描广播；
- `getBLEDeviceCharacteristics` 不返回 Descriptor / CCCD 列表；
- 不提供配对/绑定设备管理；
- `wx.setBLEMTU` 主要在 Android 生效；协商失败会自动回退到 23（有效载荷 20 字节），不会按期望值盲目分包；
- 广播解析依赖 `advertisData` 等字段的实际下发情况，不同机型可能有差异；
- 后台运行时扫描会受系统限制；
- 不支持 Peripheral / GATT Server 模式（本工具只做 Central）。

## 目录结构

```
app.js / app.json / app.wxss     全局状态、路由与 tabBar、设计 token
project.config.json              开发者工具配置（appid 为占位值）
sitemap.json                     禁用微信索引
utils/ble.js                     wx BLE API 的 Promise 封装、连接状态机、事件监听统一管理、演示短路
utils/privacy.js                 隐私同意门禁与错误提示
utils/demo.js                    演示模式的模拟设备、服务与通知数据
utils/logger.js                  结构化通信日志（内存上限 400 条 + 节流持久化）
utils/adv.js                     广播 AD Structure 解析
utils/uuids.js                   SIG UUID 名称字典、短码展开、特征值语义解析
utils/format.js                  HEX / UTF-8 / DEC / BIN 转换、输入校验、MTU 分包
utils/signal.js                  RSSI 历史采样、统计与迷你趋势数据
utils/commands.js                常用命令库 CRUD
utils/macros.js                  宏定义与步骤编排 CRUD
utils/macro-runner.js            宏顺序执行引擎（进度回调、可停止、UUID 展开）
pages/scan                       设备扫描
pages/signal                     RSSI 实时曲线
pages/conn                       设备详情与特征值调试
pages/library                    调试库（常用命令 + 宏序列）
pages/logs                       通信日志
pages/settings                   设置
pages/help                       使用说明
```

## 开发验证

仓库没有引入测试框架，开发过程中用 Node + mock `wx` 对工具层做过冒烟验证：格式转换往返、非法输入拦截、广播 AD 解析、UUID 字典与语义解析、命令与宏 CRUD、宏顺序执行与停止、MTU 回退分包、隐私门禁各分支、演示模式不触碰真实 API。可用以下命令做基础静态检查：

```bash
# JS 语法
for f in app.js utils/*.js pages/*/*.js; do node --check "$f"; done

# JSON 合法性
for f in app.json project.config.json sitemap.json pages/*/*.json; do \
  node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))"; done
```

WXML 标签闭合与 `bind`/`catch` 处理函数也做过全量核对。**尚未验证**：微信开发者工具内的编译、canvas 2d 实际绘制、真机 iOS/Android 的 BLE 时序与权限弹窗。

## 发布前清单

代码侧已完成隐私同意门禁、使用说明页、演示模式。发布前还需在小程序后台完成：

1. **小程序备案**：新小程序未备案不能上架（发布时报 `errcode 86369`）；平台初审 1-2 个工作日、管局 1-20 个工作日，工信部 12381 短信需在 24 小时内核验。耗时最长，建议最先启动。
2. **用户隐私保护指引**：在「设置 → 服务内容声明」中声明 **访问你的蓝牙**（`wx.openBluetoothAdapter`）、**收集你的位置信息**（`wx.authorize scope.userLocation`）、**读取你的剪切板**（`wx.setClipboardData`），并补齐联系方式、存储期限、使用规则等栏目。未声明会报 `api scope is not declared in the privacy agreement`；提审时不要勾选「未采集隐私」。
3. **账号信息与服务类目**：名称、头像、简介、服务类目需与首页功能一致；名称/简介不要使用他人商标（例如 nRF Connect）。
4. **最低基础库版本**设为 ≥ 2.32.3；`project.config.json` 的 `appid` 换成正式 AppID。
5. **真机双端自测**：覆盖拒绝授权、蓝牙关闭、无设备、连接中断；提审备注里说明本工具需配合 BLE 硬件使用，并告知已内置演示模式供审核体验。
6. 上传体验版 → 提交审核 → 审核通过后手动发布，并同步更新现网版本的用户隐私保护指引。

## 参考文档

- [小程序用户隐私保护指引内容介绍（隐私接口映射表）](https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/miniprogram-intro)
- [隐私授权开发指南](https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/PrivacyAuthorize.html)
- [用户隐私保护指引填写说明](https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/)
- [蓝牙低功耗（BLE）开发指南](https://developers.weixin.qq.com/minigame/dev/guide/device/ble.html)
- [app.json 全局配置（requiredPrivateInfos / permission）](https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/app.html)
- [小程序备案常见问答](https://developers.weixin.qq.com/miniprogram/product/record/company_representative.html)
- [微信小程序平台常见拒绝情形](https://developers.weixin.qq.com/miniprogram/product/reject.html)

## 许可

MIT，见 [LICENSE](LICENSE)。
