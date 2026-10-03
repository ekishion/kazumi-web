# Kazumi Web

> **注意**：本项目目前为**早期实验版本**（Proof of Concept）。接口结构、核心逻辑与界面交互仍在快速变动中，尚未达到生产可用状态，可能存在较多边缘场景异常。

Kazumi Web 是 [Kazumi](https://github.com/Predidit/Kazumi) 的网页版探索实现。它由 Go 编写的轻量后端与 React 构建的前端组成，尝试将原版基于 Flutter 的番剧采集、实时流媒体中转与弹幕体验迁移至浏览器端。

---

## 现状与实现内容

- **规则引擎兼容**：复用原版 XPath 与 API (JSONPath) 规则规范，支持规则导入与官方市场拉取。
- **流媒体反代与防护绕过**：针对纯网页端无法直接绕过 CORS 与防盗链（Referer / User-Agent 限制）的问题，后端提供 m3u8 与 ts 切片实时流式改写，内置 HMAC-SHA256 签名校验与 anti-SSRF 私网阻断。
- **播放与弹幕**：基于 hls.js + ArtPlayer 实现视频播放，提供错误自动换源重试，并对接弹弹play 开放接口进行弹幕匹配与 Canvas 实时渲染。
- **Material 3 界面**：视觉参考原版移动/桌面端排版，支持动态种子色主题派生、暗色模式与宽窄屏自适应。

---

## 运行方式

后端为纯 RESTful API 服务，不随二进制打包静态前端资源，需要分别启动后端与前端（或通过反向代理托管）。

### 1. 启动后端 (Go)

需要 Go 1.22+ 环境：

```bash
cd Web/server
go run ./cmd/server
```

启动后 API 服务默认监听在 `http://localhost:8080`。

### 2. 启动前端 (React)

需要 Node.js 与 pnpm：

```bash
cd Web/web
pnpm install
pnpm dev
```

前端开发服务器将运行在 `http://localhost:3000`，Vite 会自动将 `/api` 请求反代到 `http://localhost:8080`。

如需容器部署，可使用目录下的 Docker 配置：

```bash
cd Web
docker compose up -d
```

---

## 目录结构

```
Web/
├── server/               # Go 后端（Gin、GORM、SQLite、规则引擎、m3u8 代理改写）
├── web/                  # React 前端（React 19、MUI v6、Tailwind CSS、ArtPlayer）
├── Dockerfile            # 后端容器构建
├── docker-compose.yml    # 本地快速部署配置
├── UI-SPEC.md            # 视觉规范与对齐说明
└── LICENSE               # GPL-3.0 协议
```

---

## 开源协议

本项目遵循 [GNU General Public License v3.0 (GPL-3.0)](LICENSE) 开源协议，与原版 [Kazumi](https://github.com/Predidit/Kazumi) 保持一致。
