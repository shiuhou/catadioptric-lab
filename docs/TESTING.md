# 测试与复现

## 零依赖构建 / 数值测试

在项目目录运行：

```sh
npm run build
npm test
npm run check
```

`build` 将 src 确定性内嵌为 index.html；`check` 确认产物与源码一致，再运行测试。测试入口由 Node 枚举文件，不依赖 Windows 终端展开通配符。无需 `npm install`。

本次测试环境：Node.js 22.16.0；Python 3.13.5；Linux Chromium（具体版本见 evidence/verification.md）。未在真实 Windows、Safari 或移动操作系统执行。

### 当前数值 / 解析测试

`tests/*.test.cjs` 共 73 项：默认参考值、2,000 个确定种子角度 / 半径 / 像素往返与独立反射校验、300 个导数差分样本、1,200 个计算域探测，以及缩放、裁切、视场、传感器密度、规格歧义、类型与边界回归。

修复前，在原 v6 提取出的未改计算 / 解析模块上先运行了 8 项针对性回归测试，**6 项失败、2 项原本通过**。原始失败结果保留在 `evidence/baseline_regressions.txt`；修复后同一组全部通过。没有删除原失败用例或放宽阈值以得到 PASS。

数值样本通过不等于所有参数已证明正确，更不等于硬件验证。

## 浏览器检查（可选开发依赖）

测试脚本使用 Python Playwright；这不是使用网页所需的依赖。在可使用 Playwright 的开发环境中运行：

```sh
python tests/browser_checks.py --mode http
```

脚本默认使用 Playwright 自带的 Chromium，临时启动本地 HTTP 服务器，检查真实同源 localStorage；也可用 `--chromium` 指定已有浏览器程序路径。所有服务器仅监听 127.0.0.1，测试完成后关闭。

若尚未安装测试依赖，先安装 Playwright 并准备其 Chromium 运行环境：

```sh
python -m pip install playwright
python -m playwright install chromium
```

### 本次实际运行方式与限制

当前托管 Chromium 对 `file:` 和 `http://127.0.0.1` 导航返回 `ERR_BLOCKED_BY_ADMINISTRATOR`。没有更改浏览器策略来绕过它。实际运行：

```sh
python tests/browser_checks.py --mode content --chromium /usr/bin/chromium
```

此模式以 `page.set_content()` 加载本地 HTML，在页面中显式安装一个 Storage API 测试替身。它能检查状态序列化、恢复前询问、隐私过滤、坏数据拒绝、配额失败及清除语义，**不能证明原生存储已写入磁盘、跨浏览器继承或 file: 持久性**。测试报告的 mode / storage_validation 字段明确记录这一点。

在 `content` 模式下，本次通过 **125 / 125 项浏览器断言**：
- 1440、990、720、390、360 px 宽下六个页面的横向布局和 SVG 最终字号。
- 短视口的公式展开、拖动未松手时刷新、单手势撤销、跨页快捷键、视尺与默认值恢复。
- 两个来源示例、歧义候选、手动确认、字段来源显示、HTML 转义及无旧值借用。
- 旧版 JSON 导入、不合法 / 未知 schema 原子拒绝、JSON / CSV / XYZ 导出。
- 最后有效记录、恢复操作本身撤销、隐私默认与 opt-in / opt-out、清除后立即退出、坏存储和禁用 / 满额存储。

`http` 模式会额外执行原生 localStorage 刷新恢复检查，所以断言总数与 content 模式不同。该原生模式尚未在此环境完成。

## 仍需在目标环境验证

打开交付 HTML，实际修改一个值后关闭重开，确认目标浏览器能否保存；存储不可用时应看到「保存不可用 · 请导出」。实际更换文件或路径后不要依赖旧 localStorage，使用 JSON。

发布后的 HTTP 响应、社交预览缓存、设备字体、触屏、Windows 浏览器、Safari、实物对焦与飞行全部不在本次 PASS 范围内。
