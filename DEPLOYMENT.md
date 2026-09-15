# 本地替换与发布

## 本地更新（此次交付的主要用途）

1. 在旧网页「方案与导出」导出重要设计的 JSON。新文件不会主动读取旧网页中尚未导出的内存状态。
2. 备份本地原 `index.html` 和已有修改；解压本包。
3. 将包里的文件复制到本地 `catadioptric-lab` 工作目录。**保留已有 `.git`，不要删除 Git 历史或无关文件。** 如果本地有尚未提交的代码，请先比较差异，不要直接覆盖它。
4. 用浏览器打开本包 `index.html`。本包已经构建，无需 Node.js 或 Python 才能使用。
5. 确认左下角是 v7.0.0，再导入旧 JSON。`catadioptric-lab-v1` schema 继续支持；导入时重新计算结果，不信任文件里附带的旧结果。

本地浏览器可能缓存之前的文件；确认打开的路径是新 `index.html`，必要时刷新。`file:///C:/...` 不是可分享给他人的公网地址。

## 修改源码

改 `src/optics.js`、`src/camera-spec.js`、`src/app.js`、`src/styles.css` 或 `src/page.html` 后，在项目目录执行：

```sh
npm run build
npm run check
```

构建把 CSS 和 JS 重新内嵌到 `index.html`。若仅直接修改构建产物，下一次 build 会覆盖它；检查脚本也会指出与源码不一致。

## 更新已有 GitHub Pages

这是对原静态发布方式的延续，不需要另建应用或后端。把确认过的更新提交到你当前 Pages 的发布分支。保留根目录的 `index.html` 和 `.nojekyll`；分享预览图需要一并上传 `assets/share-preview.png`。

若 Pages 仍按原设置从 `main` 的根目录发布，部署后沿用原地址：

https://shiuhou.github.io/catadioptric-lab/

请在仓库部署状态显示成功后打开网页，检查版本及基本功能。**本次交付没有操作远程仓库，没有确认线上部署状态，也没有给你更改 Pages 设置。**

原发布说明的官方入口：
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site

页面包含指向上述站点的 canonical 与 Open Graph 地址。如果发布到自己的另一个域名，应在 `src/page.html` 中替换这几个地址并重新构建；它们只是分享元数据，不是运行依赖。

## 最小分发

离线体验只需发送 `index.html`。要保留可维护源码、测试和说明，则分发整个 ZIP。不要附上私密参数、原始工作日志、认证凭证或不打算公开的相机来源文字。
