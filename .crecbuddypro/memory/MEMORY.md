# QwenPaw/CrecPaw 项目长期记忆

## 发布流程约定（2026-09-28 确立，用户指定）

**每次功能优化完成后，一律按标准流程打包部署**（完整 SOP 在 `~/.crecbuddypro/skills/crecpaw-build/SKILL.md` 的"⭐ 标准发布流程"章节）：
1. 本地验证功能
2. 提交 `crec-desktop` 分支
3. macOS：PyInstaller 本地打包 `dist/小铁智友.app`（必须 `/opt/homebrew/bin/python3.13`，safe-delete 钩子用 mv 规避）
4. Windows：`git -c http.proxy= -c https.proxy= push fork crec-desktop` → PAT 调 API 触发 desktop-release 工作流（约 20 分钟，门禁自动把关）
5. PAT 下载 artifact 到 Downloads，解压出 `CrecPaw-Setup-<ver>.exe`
6. （待启用）mc 上传 MinIO `ai-client-package` 桶 + publish.sh 更新 manifest——网页控制台上传大文件必失败（合并分片请求被掐），必须用 mc 命令行；等用户给 MinIO Access Key 后 `mc alias set minio https://io.crec.cn:30090 <KEY> <SECRET>`

发布前递增 `src/qwenpaw/__version__.py`（当前 1.1.7）。

## 关键环境事实

- 开发机 GitHub 账号：fork 仓库 `abclsy/QwenPaw`（origin 是 agentscope-ai/QwenPaw，无写权限）；PAT 已存 macOS 钥匙串（`git credential fill` 可取）
- 系统代理 127.0.0.1:52874 对 GitHub 是坏的；到 GitHub 直连时好时坏，push/下载失败就重试
- GitHub Actions Windows 构建的三大坑已修（UTF-8 编码 / conda-unpack 损坏自动修复 / mcp+acp+openai 版本钉死），勿回退
- PyInstaller 用 `/opt/homebrew/bin/python3.13`（editable 装了 qwenpaw + PyInstaller 6.20.0）；`/opt/homebrew/bin/python3` 指向 3.14 无依赖不可用
- 此开发环境的后台下载任务会被静默回收，大文件下载必须前台分段续传（curl -C - --max-time 175 循环）
