# uni-space

基于 **Vue3 + Vite + TypeScript** 的 uni-app 项目。

## 环境要求

- Node.js 18+
- npm（或 pnpm / yarn）

## 安装依赖

```bash
npm install
```

## 启动开发

### H5

```bash
npm run dev:h5
```

浏览器打开终端提示的本地地址即可预览。

### 微信小程序

```bash
npm run dev:mp-weixin
```

编译完成后，用[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)导入项目下的 `dist/dev/mp-weixin` 目录。

### 其他平台

```bash
npm run dev:mp-alipay   # 支付宝小程序
npm run dev:mp-toutiao  # 抖音小程序
npm run dev:mp-qq       # QQ 小程序
```

更多脚本见 `package.json` 中的 `scripts`。

## 构建打包

```bash
npm run build:h5         # H5
npm run build:mp-weixin  # 微信小程序
```

## 类型检查

```bash
npm run type-check
```

## 一键提交并推送

把本地改动全部 `add` → `commit` → `push` 到 GitHub：

```bash
npm run upload
npm run upload -- "本次改动说明"
```

不写说明时，会用带时间戳的默认提交信息。
