# Windows 与 macOS 开发及发布

业务层、数据快照和 v7 存档在两个系统上共用。`src/main.cjs` 负责系统窗口、菜单、路径、登录会话和文件对话框，平台分支只存在于桌面生命周期与菜单。保留原生标题栏，默认最大化，不能默认进入 macOS 全屏空间。

## 开发环境

使用 Node.js 24 或更高版本，每个系统分别执行 `npm ci` 安装依赖。不要复制另一系统的 `node_modules`，Electron 可执行文件及打包依赖与系统、架构相关。

若 npm 的本机脚本许可策略未执行 Electron 安装脚本，可手动执行 `node node_modules/electron/install.js` 下载官方的本机 Electron。打包配置不再指定固定的 `electronDist`，由 electron-builder 获取目标系统和架构的运行时，避免将 Windows 或 arm64 运行时误装进其他包。

```sh
npm start
npm test
npm run smoke
npm run test:ui
npm run test:desktop
```

这些桌面测试使用 `artifacts/` 下的隔离目录和模拟账号，不读取日常存档或真实登录。`test:desktop` 验证默认最大化、还原、保存与自动备份，并确认导入及手动备份入口、API 已移除；macOS 另外验证编辑菜单、关闭窗口和 Dock 重新打开后的存档与 IPC。网络接口连通性单独运行 `npm run test:network`，不作为离线测试的前置条件。

## 打包

```sh
# Windows x64（建议在 Windows 上执行）
npm run build:win

# macOS：两种架构，每种输出 DMG
npm run build:mac

# 仅构建指定架构
npm run build:mac:arm64
npm run build:mac:x64

# 可选：需要 ZIP 时单独生成
npm run build:mac:zip
```

`npm run build` 根据宿主系统构建。所有产物进入 `dist/`，文件名包含版本、系统及架构。助手版本的前两段取正式游戏快照版本；同一游戏版本内第三段从 1 递增，升级游戏版本时重置为 1。发布前运行 `npm run version:next`，自动同步 `package.json`、`package-lock.json`、README 和侧栏；所有打包命令会先运行 `npm run version:check` 校验。例：游戏 3.2 → 助手 3.2.1、3.2.2，游戏 3.3 → 助手 3.3.1。

完成实际产物测试后执行 `npm run clean` 清理历史版本、重复 ZIP、未压缩应用、blockmap 和已知测试目录；保留当前版本 EXE / DMG 及校验清单。清理会同步移除清单中已删除文件的条目。预览使用 `npm run clean -- --dry-run`。资料生成输入和 `node_modules` 不清理，测试目录不包含正式账号存档。再次检查实际产物时，先重新打包生成未压缩应用。CI 在 `test:package` 后执行清理，再保存安装包。

macOS 当前使用 ad-hoc 签名（`identity: "-"`）、关闭 hardened runtime 和公证，适合本地使用。正式对外发布时，通过受保护的 CI Secret 提供 Developer ID Application 证书及密码，并覆盖 `mac.identity` 为证书名称、`mac.hardenedRuntime` 和 `mac.notarize` 为 `true`，按 electron-builder 官方文档提供 Apple 公证凭据。不要将证书或凭据写入仓库。

## 双平台维护

1. 修改共用业务代码，避免 Windows 绝对路径、`.cmd` 和单平台提示。
2. 保存路径始终通过 Electron `app.getPath` 和 Node `path` 组合；保留 `ZZZ Buff Studio` 目录名。隔离测试的显式 `userData` 路径不可被覆盖。
3. 两端使用同一份 v7 存档格式。账号凭据只保留在各自系统的独立 Electron 会话，不进入角色存档。不恢复已移除的导入与手动备份功能。
4. 发布前验证三个目标：Windows x64、macOS arm64、macOS Intel x64。构建不能替代目标系统上的运行验证。
5. `.github/workflows/desktop.yml` 在三个原生 runner 上安装依赖、运行测试、构建并保存产物；所有平台使用同一版本号。该目录当前未初始化 Git，工作流只有在上传至 GitHub 仓库后才会执行。
6. 本机更新完成后替换 `/Applications/绝区零·助手.app` 并重新启动，验证版本和原存档；安装完成再清理未压缩应用。更新时沿用存档目录和登录分区，不删除其内容。

打包后可通过 `npm run test:package -- <本机未压缩应用的可执行文件>` 检查实际产物。该命令使用隔离目录、临时本机调试端口，验证版本号、preload、60 个头像、三档预设、队伍比较以及保存和重启；退出时停止测试进程。CI 在原生平台上运行这个检查。

macOS Apple Silicon 示例：

```sh
npm run test:package -- "dist/mac-arm64/绝区零·助手.app/Contents/MacOS/绝区零·助手"
```

桌面生命周期参考 [Electron 创建首个应用](https://www.electronjs.org/docs/latest/tutorial/tutorial-first-app)，打包及签名参考 [electron-builder macOS 配置](https://www.electron.build/mac/)。
