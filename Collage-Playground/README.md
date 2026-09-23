# Collage Playground

Shared Mind 课程项目。原生 HTML / CSS / JavaScript / Canvas 2D，无依赖、无构建步骤、无 AI 后台。所有素材都是独立可编辑对象；AI 只生成单张图片素材。

## 本地启动

在终端执行：

```sh
cd /Users/allenqiu/Desktop/Collage-Playground
python3 -m http.server 8765 --bind 127.0.0.1
```

打开 **http://127.0.0.1:8765/**。仅本机访问，不公开部署。以后优先使用同一个地址、端口和浏览器；`localhost`、`127.0.0.1`、不同端口与不同浏览器的 localStorage 彼此独立。如果端口被占用，先检查是否已经是本项目，不要停止其他服务；必要时换一个空闲端口并用 JSON 转移作品。

## 使用

- 初次打开显示标记为 Demo 的本地图形与文字海报。已有存档优先恢复。
- Upload：PNG / JPEG / WebP，仅本地处理；原图最多 20 MB，最长边压缩到 512 px，优先 WebP，浏览器不支持时回退 PNG，保留透明通道。最多 8 张不同图片、30 个对象。
- Add Text：右侧编辑中英文、多行、字号、字体、粗细、颜色和对齐。文字始终保存为文本。可用换行安排标题；特别长的一行会压缩到对象宽度内。
- 点击选择，空白取消选择；拖动移动，四角手柄等比缩放，上方圆形手柄旋转。右侧 Width / Height 等比调整，Rotation 调整基础角度。对象中心保留在纸张范围内，边缘可超出画布。
- Duplicate / Delete / Forward / Backward / Lock。锁定对象仍能选中与解锁。锁定时不能移动、编辑、删除、换层或被 Shuffle 改动。
- Shuffle：本地中心、斜向、散落三种结构轮换，不修改文字、不生成图片、不联网。
- Animate：选中对象设置 None / Float / Wiggle；全局 Play / Pause。编辑时暂停该对象，偏移不写入场景。尊重系统减少动态效果设置。
- Undo 保留最近 40 次操作；一次拖动算一次，一次连续属性编辑合并为一次。支持 Ctrl/Cmd+Z、Delete/Backspace；输入文字时不触发全局快捷键。撤销历史本身不跨刷新保存。
- Export PNG：同一套绘图函数生成 900 × 1200 PNG，不含选中框，动画导出当前一帧；不会替代可编辑作品。
- Save JSON：包含所有文字、排列、图片实际内容、裁剪种子、锁定与动画设置。导出面板保留下载链接与预览；若内嵌浏览器不处理下载，请在常规浏览器访问同址，或从 JSON 预览复制备份。
- Load JSON：最多 12 MB，先验证版本、字段、有限数值、颜色、资源引用和图片实际尺寸，成功解码全部图片后确认覆盖。失败保留作品，成功导入可以 Undo。

## 保存与数据结构

独立 localStorage key：`sharedmind-collage-playground-v1`。添加、删除、拖动结束和属性修改后保存，连续输入防抖 450 ms；动画帧不保存。

场景结构为 `schemaVersion: 1`、`canvas: {width: 900, height: 1200, background}`、`assets`、`items`。对象坐标为中心坐标，旋转单位为度；`z` 为从后往前的顺序。图片通过 `assetId` 引用集中保存的 data URL；复制对象不重复保存图片。图片缓存、DOM 和函数只存在运行时。文字额外保存原始文字框尺寸，便于等比缩放后继续编辑。

存储禁用或容量不足时明确提示，保留内存场景与旧存档，不先删除旧值。请及时 Save JSON。若发现损坏的旧存档，不用 Demo 覆盖它；当前页面禁用自动覆盖，可通过 Load JSON 导入有效备份恢复。

## 学校图片代理

现有 Generate Image 已连接真实学校 Proxy，不是示例或占位结果。仅用户主动点击时 POST 一次；空输入不发送，等待期间按钮显示 `Generating...` 并禁用。只发送文字提示词，不发送海报、上传图片或存档。

接口：`https://itp-ima-replicate-proxy.web.app/api/create_n_get`

模型：`black-forest-labs/flux-schnell`

请求格式：

```js
const authToken = ''; // 课程示例，无个人密钥
fetch('https://itp-ima-replicate-proxy.web.app/api/create_n_get', {
  method: 'POST',
  headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}`},
  body: JSON.stringify({
    model: 'black-forest-labs/flux-schnell',
    input: {prompt: finalPrompt}
  })
});
```

保留输入主体，追加单张素材、简单构图、无额外文字/水印、不要生成整张海报的要求。没有额外 version、模型参数、个人密钥，也不承诺透明背景。上传图片不会发送至代理。

每次只允许一个任务，90 秒总超时，无自动重试或轮询。超时仅中止浏览器等待，不代表云端生成任务已取消；请不要以为超时后重试没有额度影响。处理 HTTP、权限、代理错误、处理中状态、空输出、图片下载失败。`prediction.output` 支持 HTTPS URL 字符串或数组；取第一个有效地址，不拼接地址。只有成功状态（或无状态但有有效输出）才处理图片。错误诊断使用控制台 `[Collage AI]`，包含处理阶段、HTTP 状态、模型状态和简短错误，不记录完整请求或响应。成功下载实际内容、压缩并解码后才添加；不能读取跨域图片时展示“图片生成成功，但还未保存到本地”，提供打开链接，下载后用 Upload 导入。不使用 no-cors，不绕过权限。图片已经加入但 localStorage 写入失败时，明确提示“本地存档保存失败”，保留画布中的图片、旧存档、原图链接和 Save JSON 备份能力。

生成素材在图片对象的可选 `source` 字段保存 `{kind: 'ai', prompt: 原始用户输入, model: 模型名称}`，并在右侧图片属性显示。该字段会随 JSON、本地存档、复制和撤销保留；同一份图片像素仍由 `assetId` 共享。旧版 schemaVersion 1 存档没有该字段也可以正常读取，不更改 localStorage key。

## 检查记录

运行无依赖逻辑检查（需要本机 Node.js，仅用于测试，网页运行不需要）：

```sh
node --check app.js
node tests/check.cjs
```

已执行并通过：场景验证、中英文多行编辑、等比缩放、旋转坐标判定、一次拖动一次撤销、20 次以上历史、锁定 Shuffle、存储失败保留旧值、JSON 往返、图片资产复用、动画不污染场景，以及模拟的 HTTP 403 / 代理错误 / processing / 空输出。测试脚本没有真实网络访问。

已在 Codex 内嵌浏览器实际检查：桌面三栏与窄屏布局、添加和编辑中英文文字、右侧大小与旋转、锁定 Shuffle、Undo、鼠标拖动、本地 PNG 上传、撕纸边缘、独立动画设置、刷新恢复、JSON 导出内容和重新导入（含图片）、实际 PNG 内容为 900 × 1200。浏览器控制台没有报错。

浏览器工具未收到文件下载事件，因此没有把“文件已写入系统下载文件夹”列为通过；已核对导出面板中真实 PNG 与完整 JSON，并提供下载链接、PNG 预览与 JSON 文本备份。

### 本次 AI 接入修复的检查

打开 `http://127.0.0.1:8765/tests/ai-browser.html` 可重新运行隔离的浏览器测试。测试加载当前真实 `app.js`，使用模拟 fetch 和内存存档，禁止真实 AI 网络访问，不读取或改写你的 localStorage；图片解码、WebP 压缩和 Canvas PNG 输出使用真实浏览器实现。

本次检查覆盖：

- 成功响应的数组/字符串输出；只发一次生成 POST，等待时重复点击不会再发；检查请求仅含模型与文字提示词，空认证头，无额外参数。
- 原作品与撤销历史保留；真实 PNG 测试素材压缩为 512 × 384 的图片数据，作为独立图片加入；保存原始中文提示词和模型。
- 新建浏览器文档后恢复图片像素和素材信息；图片可独立编辑、复制、撤销，JSON 往返保留全部内容；实际 Canvas 生成 900 × 1200 PNG。
- 模拟 HTTP 401/403、非 JSON、错误 JSON、null/数组结构、代理错误、失败/取消/处理中、空输出、CORS/下载/解码失败：保留场景、旧存档和历史，恢复按钮，不重试。
- 模拟定时器超时：说明云端任务可能仍在运行，不自动再次生成。
- 模拟容量不足：新图片继续留在可编辑内存场景，旧存档不被删除，明确提示 Save JSON，并提供原图链接。

**未调用真实 AI 模型。** 学校代理当前的权限、实际响应和远端 CORS 仍需你在主页面亲自点击 Generate Image 测试。本次没有改动或重置主页面已有海报与本地存档。

## 文件

- `index.html`：工作台与导出面板。
- `styles.css`：纸张/杂志风格、三栏及窄屏布局。
- `app.js`：场景状态、绘制、编辑、历史、存储、校验、图片压缩、导出、代理请求。
- `tests/check.cjs`：不联网的逻辑回归检查。
- `tests/ai-browser.html` / `tests/ai-browser-checks.js`：隔离网络和存档的真实浏览器回归检查。

未读取或修改 Thought-Bubbles；未创建账号、数据库或多人协作功能。

## HTTP 500 排查

若显示 `School proxy HTTP 500: Internal server error`，说明生成接口返回了服务端错误，还没有取得图片。这条通用响应不能区分学校代理的异常、上游权限/额度问题或模型调用兼容性问题。当前请求仍严格使用课程给出的 model + input.prompt 格式和空 Bearer 认证；不擅自增加 version、换模型或使用个人密钥。

界面会显示请求的 UTC 时间、模型和原始简短错误。浏览器控制台 `[Collage AI]` 另外包含接口地址、请求阶段和 HTTP 状态，可提供给课程代理维护者查服务端日志。前端不能直接修复学校代理服务；不要把提示改进误认为远端服务已经恢复。不会自动重试，也不会用假图片代替结果。现有作品与存档保留。

已增加模拟 HTTP 500 回归检查；没有为排查该错误发送新的真实生成请求。
