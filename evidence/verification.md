# v7.0.0 本次验证记录

日期：2026-09-15。

## 输入与交付范围

- 修改基于本会话上传的 v6 单文件 HTML（132646 bytes），不是推测的远程最新版本。
- 输入 SHA-256：a9e94dce23728d53bc88e7e8cd72c52d6dceaa44075146a38e4dd6f119ae32f0。
- 输出 index.html SHA-256：86a64e78d2e29be4d410300739c3454424950c4d0d07320f7ad5ebd1e3e67500。
- 未访问、更改或推送远程仓库；未更新用户本地文件。

## 实际运行

- Node.js 22.16.0；Python 3.13.5；Playwright 1.57.0。
- 浏览器：Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)。
- 初始 8 项针对性回归：6 FAIL，2 PASS；原始结果完整保留于 baseline_regressions.txt。
- 修复后同组 8/8 PASS；全部数值 / 解析用例 73/73 PASS，见 final_check.txt。
- 浏览器断言 125/125 PASS；无未捕获页面异常。详细断言见 browser_checks.json。
- 构建一致性 PASS：index.html 与 src 的确定性构建完全相同。
- 检查了最终桌面、990 px 与手机布局截图；顶部图示及左侧/移动导航保持原组织。

## 重要限制

本托管环境 Chromium 拒绝 file:/localhost 导航，返回 ERR_BLOCKED_BY_ADMINISTRATOR。未修改安全策略。使用 page.set_content() 渲染本地构建，并显式采用内存 Storage API 测试替身。

因此本地恢复的参数序列化、还原、隐私过滤、错误和配额降级已测试，**原生持久存储、关浏览器后数据仍存在、file: 行为没有在此验证**。测试脚本另外提供 --mode http，供真实开发机验证原生 localStorage 和刷新恢复。

没有在真实 Windows、Safari、iOS/Android 或用户当前浏览器上实测。没有核验当前线上版本、在线元数据缓存、硬件规格、光学对焦、制造或飞行安全。

所有截图均是交付代码的本地浏览器渲染，不是实物成像。
