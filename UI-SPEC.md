# Kazumi Web UI 还原规范（与 Flutter 原版对齐）

> 本文件是 Web 版（`Web/web`）UI/动效对齐原版的**唯一依据**。改动 UI 前先读这里。

## 0. 权威依据（原版源码，不是截图）

| 内容 | 原版文件 |
|---|---|
| 主题构造 | `Kazumi/lib/app_widget.dart:138` — `ThemeData(useMaterial3: true, colorSchemeSeed: color, fontFamily: 'MI_Sans_Regular')`，默认 `color = Colors.green` = **`#4CAF50`** |
| 尺寸常量 | `Kazumi/lib/utils/constants.dart` — `StyleString` |
| 外壳（导航） | `Kazumi/lib/pages/menu/menu.dart` |
| 海报卡片 | `Kazumi/lib/bean/card/bangumi_card.dart` |
| 推荐页 | `Kazumi/lib/pages/popular/popular_page.dart` |
| 动效常量 | `constants.dart` 的 `pageTransitionsTheme2024`；`pages/index_module.dart` 的 `_tabTransition`(70ms) / `_imagePreviewTransition`(220ms) |
| 图片层 | `Kazumi/lib/bean/card/network_img_layer.dart` |

⚠️ `Kazumi/static/screenshot/*.png` 实际是 JPEG，且属于**更早的 1.x 版本**（与当前 2.3.7 源码布局不同），**只能用于色彩参考，不能用于布局比对**。

## 1. 色彩：必须由种子色算法生成

原版整套配色 = `ColorScheme.fromSeed(#4CAF50)`。Web 侧用官方同源算法 `@material/material-color-utilities`：
`themeFromSourceColor(argbFromHex(seed))` → `theme.schemes.light / .dark`。
**禁止再硬编码调色板**（除非作为算法不可用时的兜底）。

已验证的色值（种子 `#4CAF50`，light）：

| M3 角色 | light | dark |
|---|---|---|
| primary | `#006E1C` | `#78DC77` |
| onPrimary | `#FFFFFF` | `#00390A` |
| primaryContainer | `#94F990` | `#005313` |
| onPrimaryContainer | `#002204` | `#94F990` |
| secondary | `#52634F` | `#BACCB3` |
| secondaryContainer | `#D5E8CF` | `#3B4B38` |
| onSecondaryContainer | `#111F0F` | `#D5E8CF` |
| tertiaryContainer | `#BCEBF0` | `#1F4D52` |
| error / errorContainer | `#BA1A1A` / `#FFDAD6` | `#FFB4AB` / `#93000A` |
| surface | `#FCFDF6` | `#1A1C19` |
| surfaceVariant / onSurfaceVariant | `#DEE5D8` / `#424940` | |
| outline / outlineVariant | `#72796F` / `#C2C9BD` | |
| surfaceContainerLowest | `#FFFFFF` | `#0C0F0C` |
| surfaceContainerLow | `#F3F4EE` | `#1A1C19` |
| surfaceContainer | `#EEEEE8` | `#1E201D` |
| surfaceContainerHigh | `#E8E9E2` | `#282B27` |
| surfaceContainerHighest | `#E2E3DD` | `#333531` |
| surfaceDim / surfaceBright | `#DADAD4` / `#F9FAF4` | `#121411` / `#383A36` |

`surfaceContainer*` 在 v0.4.0 未导出，由中性调色板推导：light 100/96/94/92/90，dark 4/10/12/17/22。

**与原版截图的对拍验证**（证明算法选型正确）：分类胶囊实测 `#D5E7CF` ≈ secondaryContainer `#D5E8CF`；选中文字 `#111F0E` ≈ onSecondaryContainer `#111F0F`；粉色徽章 `#FFDAD8` ≈ errorContainer `#FFDAD6`；底栏底 `#ECEFE6` ≈ surfaceContainer `#EEEEE8`。

## 2. 字体

原版**随包携带 MiSans**（`Kazumi/assets/fonts/MiSans-Regular.ttf`，家族名 `MI_Sans_Regular`）。
Web 现状只在 CSS 里写了 `font-family: 'MiSans'` 却没有加载字体文件 → 实际渲染系统字体（Windows 上是微软雅黑），这是"看着不一致"的主因之一。
**要求**：把 TTF 放入 `Web/web/public/fonts/`，在 `index.css` 用 `@font-face` 声明（`font-display: swap`），字体栈 `'MiSans', system-ui, ...`。

## 3. 形状（现 Web 全局 20px 是错的）

| 组件 | 原版值 | 出处 |
|---|---|---|
| Card（规则卡/内容卡） | **12** | M3 Card 默认 shape，原版未覆盖 |
| 海报图 | **12**（`imgRadius`） | constants.dart:9 |
| FAB | **16** | M3 FAB 默认 |
| Button | 全圆 pill | M3 `StadiumBorder` |
| Chip | **8** | M3 chip |
| Dialog | 28 | M3 |
| Menu | 4 | M3（`MenuAnchor` 默认） |
| 内容区（桌面）左上/左下 | **16** | menu.dart:172 |
| 导航选中指示器 | 全圆 pill | M3 NavigationBar/Rail |

**禁止**：卡片描边、明显投影（原版 `elevation: 0`）、卡片 hover 位移（原版只有 InkWell 波纹）。

## 4. 尺寸与间距

`StyleString`：`cardSpace = 8`（网格：行间距 `cardSpace-2 = 6`，列间距 `8`）、`safeSpace = 12`、`mdRadius = 10`、`imgRadius = 12`。
其他：网格 `EdgeInsets.all(8)`；卡片标题 `EdgeInsets.fromLTRB(5, 3, 5, 1)`、`fontWeight: w500`、`letterSpacing: 0.3`、正文 `bodyMedium`(14px)、最多 3 行省略。

## 5. 网格列数（原版 popular_page.dart:126-147）

| 视口宽 | 列数 |
|---|---|
| ≤ 600 | **3** |
| > 600 | **5** |
| > 840 | **6** |

卡片高度 = `视口宽 / 列数 / 0.65 + 32`（0.65 海报比例 = paddingTop `153.8%`）。

## 6. 外壳（menu.dart）

- **窄屏/竖屏** → 底部 M3 `NavigationBar`：推荐 / 时间表 / 追番 / 我的；选中项 = secondaryContainer 胶囊指示器 + 实心图标。
- **宽屏/横屏** → 左侧 `NavigationRail`：
  - `groupAlignment: 1` → **图标组沉底**（不是居中，也不是顶部）
  - `labelType: selected` → **只有选中项显示文字**
  - `leading` = `FloatingActionButton(elevation: 0)` 搜索按钮
  - 背景 = `surfaceContainer`
- **内容区**：背景为页面自身 `surface`，**左上/左下 16px 圆角**（`borderRadius: only(topLeft, bottomLeft)`）。

## 7. 动效（当前 Web 基本缺失）

| 场景 | 原版行为 | 实现要点 |
|---|---|---|
| 页面推入 | Windows/Linux `FadeUpwards`：淡入 + 从 `Offset(0, 0.25)` 上移，300ms，`fastOutSlowIn`；Android/iOS/macOS `Cupertino`：水平滑入 300ms | 路由过渡组件，按视口宽切换 |
| 标签页切换 | 自定义 **70ms 淡入**（`_tabTransition`） | 仅 tab 之间 |
| 图片预览 | 220ms 淡入 | |
| 主题切换 | `AnimatedTheme` 200ms 色彩过渡 | 切主题时给根节点加过渡类 |
| 海报跳详情 | **Hero 共享元素**（`Hero(tag: id)`，`transitionOnUserGestures`） | 卡片海报 → 详情页头图 morph |
| 图片加载 | `cached_network_image` 淡入（默认 500ms/`fadeInDuration`） | `<img>` 加 opacity 0→1 |
| 顶栏标题 | `SliverAppBar` 折叠：字号 28→20、字重 w700→w500 随滚动插值 | 推荐页 |
| 回到顶部 | `animateTo(0, 350ms, easeOut)`，FAB **常驻**（不是滚动后才出现） | 推荐页 |
| 分页加载 | 顶部 `LinearProgressIndicator`(4px)，`AnimatedOpacity` 300ms | 推荐页 |
| 涟漪 | 全站 `InkWell` 波纹 | 用 `ButtonBase`/`CardActionArea` 替代裸 `Box onClick` |

## 8. 连续性（"动画不连续"的根因）

原版把列表数据与滚动位置放在 controller 里跨页面存活：
`popularController.trendList` 缓存 + `popularController.scrollOffset` 恢复（`popular_page.dart:36-43,52-53`），所以**切标签页不重新请求、不闪骨架、滚动位置还在**。
Web 现状：每个路由重新挂载 → 重新请求 + 骨架闪烁 + 滚动归零。
**要求**：
1. 4 个标签页保持挂载（类似 Flutter `IndexedStack`/常驻 RouterOutlet），切换只做 70ms 淡入；
2. 列表数据做轻量缓存（记忆化请求），二次进入直接命中；
3. 每页滚动位置保存/恢复。

## 9. 逐页对照清单

| Web 页面 | 对照原版文件 |
|---|---|
| `pages/PopularPage.tsx` | `Kazumi/lib/pages/popular/popular_page.dart` + `popular_controller.dart` |
| `pages/TimelinePage.tsx` | `Kazumi/lib/pages/timeline/timeline_page.dart` |
| `pages/InfoPage.tsx` | `Kazumi/lib/pages/info/info_page.dart`、`info_tabview.dart` |
| `pages/CollectPage.tsx` | `Kazumi/lib/pages/collect/collect_page.dart`、`collect_library_view.dart` |
| `pages/HistoryPage.tsx` | `Kazumi/lib/pages/history/history_list_view.dart`、`history_record_tile.dart` |
| `pages/RulesPage.tsx` | `Kazumi/lib/pages/plugin/plugin_page.dart` + `bean/card/rule_card.dart` |
| `pages/SettingsPage.tsx` | `Kazumi/lib/pages/settings/*` + `bean/settings/settings_list.dart` |
| `pages/SearchPage.tsx` | `Kazumi/lib/pages/search/search_page.dart` |
| `pages/PlayerPage.tsx` | `Kazumi/lib/pages/video/video_page.dart`、`player/*` |

## 10. 验收

1. `pnpm build`（tsc + vite）通过；
2. 桌面（≥1280）与移动（390）两档截图对比：配色角色、字体、圆角、间距、导航形态；
3. 动效清单逐条可观察：路由淡入上移、标签 70ms 淡入、海报 Hero、图片淡入、FAB 常驻、顶栏折叠；
4. 连续性：标签来回切换不出现骨架闪烁、滚动位置保留。

## 11. 验收结果（2026-10-03 完成）

- **构建**：`pnpm build`（tsc -b + vite build）通过，2916 模块，JS 1.68MB / CSS 11.6KB。
- **色彩一致性**：用 M3 算法库对拍原版截图采样值 —— 分类胶囊 `#D5E7CF`↔`secondaryContainer #D5E8CF`、选中文字 `#111F0E`↔`onSecondaryContainer #111F0F`、粉色徽章 `#FFDAD8`↔`errorContainer #FFDAD6`、底栏底 `#ECEFE6`↔`surfaceContainer #EEEEE8`，全部吻合。
- **截图对比**：`Web/ui-verify/` 下留存 8 张（推荐页桌面/移动、时间表桌面/移动、详情页、设置页、规则页、搜索页）。
- **动效**：路由过渡（桌面 FadeUpwards / 移动 Cupertino，300ms）、标签 70ms 淡入、海报 View Transitions 共享元素（推荐/时间表卡片 → 详情页头图，且详情页在数据未返回时用日历缓存占位以保证首个渲染帧就有共享元素）、图片淡入、主题色 200ms 过渡、顶栏滚动折叠、350ms easeOut 回顶。
- **连续性**：4 个标签页常驻懒挂载 + 独立滚动容器；`requestCache` 的 `peek/cached` 保证二次进入不闪骨架；推入全屏路由（详情/搜索等）时外壳**只隐藏不卸载**，返回后滚动位置与页内状态保留。

### 已知取舍（受后端/路由能力限制，非样式问题）

1. 后端 `/bangumi/calendar` 无季度参数 → 时间表季度选择器只改标题与「今天」判定，不换数据；「热度优先」用 `rating.total` 近似。
2. 吐槽/关联/制作人员、原版搜索语法与筛选排序、以图搜番、分页 —— Web 无对应接口，用空态呈现。
3. 收藏/历史记录缺评分、开播日期、`entryKind` 字段 → 部分排序退化、个别筛选恒为空。
4. 规则页无编辑器路由、后端不追踪搜索有效性 → 徽章仅在能取到状态时显示。
5. 设置页原版是真双栏 RouterOutlet（子路由 push），Web 单路由 → 改为内联详情面板 + Fade；宽屏分类栏未 sticky（外壳中间层 `overflow:hidden`）。
6. 播放页原版是全屏播放器 + 浮层侧面板，Web 为可滚动页面布局（外壳提供 `.kz-scroll`）。
7. `WebPlayer` 关闭 `autoMini`（原行为会在滚出视口时缩成迷你窗，属尺寸跳变）。
8. 圆角/留白按本规范统一（卡片 12、页面 12），原版个别页面为 16/20/28；星期选择器保留原版的 28/24 圆角，季度按钮选中态用 `secondaryContainer`，星期选中态用 `primary`（两者在原版中确实不同，`timeline_page.dart:109` vs `timeline_week_selector.dart:40`）。

## 12. 状态反馈原语与播放失败呈现

### 12.1 M3 状态反馈原语
- **`KzStatusCard`** (`src/components/common/KzStatusCard.tsx`)：
  - `severity`: `info` | `warning` | `error` | `success`
  - 配色映射：`secondaryContainer` / `tertiaryContainer` / `errorContainer` / `primaryContainer`
  - 容器规范：圆角 12px、无描边、无投影，背景与文字颜色跟随 `theme.motion` 渐变过渡；
  - 属性扩展：`icon`、`title`、`description`、`actions`、`dense`。
- **`KzKvList`** (`src/components/common/KzKvList.tsx`)：
  - 紧凑键值摘要列表，标签使用 `onSurfaceVariant`，数值使用等宽字体 `onSurface`，支持一键剪贴板复制，供代理诊断与排障面板呈现。
- **`MuiAlert` 主题全局覆写** (`src/theme/theme.ts`)：
  - 基础圆角提升至 12px，清除默认投影；
  - `colorInfo` / `colorWarning` / `colorError` / `colorSuccess` 与 M3 Container 角色色完全对齐，存量 Alert 自动合规。

### 12.2 播放失败与诊断呈现
- **错误分类与操作动作**：
  - 签名过期（`proxy_signature`）：自动刷新签名并保留播放进度续播，提供手动重试；
  - 上游 403（`upstream_403`）：自动去 Referer 重试 + 重新嗅探，提示换源或切换网页嵌入模式；
  - 内网拦截（`blocked_address`）：显示安全阻断红色状态卡，禁止静默自动换源，保护私网安全；
  - 格式不支持（`unsupported`）/ 媒体解码错误（`media`）：自动换源（上限 3 次，不重复尝试失败源）；
  - 网络错误（`network`）：退避提示重试。
- **可折叠代理诊断**：
  - 展示真实直链（标注外部直连可能仍需代理）、带签名代理 URL、生效的 Referer / UA、`X-Kazumi-Error` 与上游 HTTP 状态码；支持一键复制。
- **换源抽屉状态**：
  - 标注「已尝试 n/3」预算，各源附带「嗅探中 / 可用 / 失败原因」状态徽章。


