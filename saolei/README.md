# 多人扫雷网页版

这个目录下是一个**可远程多人联机的扫雷网页原型**。  
它已经接好了 Supabase 的多人房间和棋盘同步逻辑，支持下面这些流程：

- 第一次打开先输入昵称
- 昵称保存在浏览器 `localStorage`
- 创建房间时，房间名自动显示为“你的昵称 的房间”
- 其他人打开网页后，可以在“加入多人房间”列表里看到正在进行中的房间
- 所有人共享同一张扫雷盘
- 支持翻开、插旗、问号三种模式切换
- 顶部显示当前在线玩家
- 房间里最后一个人退出后，房间会自动删除
- 如果有人长时间断开，系统会自动清理离线玩家和空房间

---

## 目录说明

```text
saolei/
  ├─ index.html        页面结构
  ├─ style.css         页面样式
  ├─ app.js            房间、联机、扫雷逻辑
  ├─ config.js         Supabase 地址和前端 anon key
  └─ README.md         这份说明

supabase/
  └─ migrations/
     └─ create_minesweeper_demo.sql   数据表和实时同步配置
```

---

## 先说最重要的结论

如果你要让别人**远程**和你一起玩，而不是本地局域网试玩，你只需要满足两件事：

1. 房间和棋盘状态放在一个公网可访问的地方  
   这份项目里已经使用了 Supabase 作为这个“公共状态中心”
2. 这个网页本身也要能被别人打开  
   最简单的做法就是把 `saolei` 这个目录部署成一个静态网站

也就是说：

- **联机状态层**：Supabase
- **网页访问入口**：Vercel / Netlify / Cloudflare Pages / GitHub Pages 任意一个都可以

---

## 这份代码现在已经做好的部分

### 1. 本地名字保存

第一次打开网页时会弹出输入框。

- 输入名字后，浏览器会存到 `localStorage`
- 下次再打开会自动读取
- 创建房间时，房间名默认就是 `你的名字 的房间`

注意：

- 如果你在**同一个浏览器、同一个配置文件**里开两个标签页，它们会共用同一个 `localStorage`
- 那样会被系统认为是**同一个玩家**

所以测试多人时请用下面这些方式之一：

- 不同手机
- 不同电脑
- 同一台电脑用不同浏览器
- 同一浏览器的普通窗口 + 无痕窗口

---

## 现在怎么本地先跑起来

不要直接双击 `index.html` 用 `file://` 打开。  
因为这个项目用了浏览器模块和远程 SDK，最好用一个本地静态服务器来打开。

### 方法 A：如果你电脑有 Python

1. 打开终端
2. 进入这个目录：

```powershell
cd d:\WeChatProjects\miniprogram-1\saolei
```

3. 启动静态服务器：

```powershell
py -m http.server 5500
```

4. 浏览器打开：

```text
http://127.0.0.1:5500
```

### 方法 B：如果你在编辑器里有 Live Server

1. 打开 `saolei/index.html`
2. 使用 Live Server 打开
3. 浏览器访问它给出的本地地址

---

## 现在怎么让别人远程一起玩

下面给你一个**最省钱、最省时间**的方式：

- 数据同步：继续用当前这套 Supabase
- 网页部署：用 **Vercel 免费版**

### 方案总览

1. 把这个项目放到 Git 仓库
2. 在 Vercel 导入仓库
3. 把 `Root Directory` 设成 `saolei`
4. 部署完成后，把网址发给别人
5. 别人打开后就能看到你的房间并加入

---

## Vercel 部署步骤，尽量写细

### 第 1 步：确认你要部署的是哪个目录

你要部署的是：

```text
d:\WeChatProjects\miniprogram-1\saolei
```

不是整个小程序目录，也不是 `pages/`。

### 第 2 步：把项目放到 Git 仓库

如果你已经有仓库，这一步跳过。  
如果你还没有：

1. 在项目根目录初始化 Git
2. 提交代码
3. 推到 GitHub

最关键的是：**要保证 `saolei` 目录已经在仓库里**

### 第 3 步：注册并登录 Vercel

1. 打开 Vercel 官网
2. 用 GitHub 登录
3. 进入控制台

### 第 4 步：导入项目

1. 点击 `Add New...`
2. 选择 `Project`
3. 选择你的 GitHub 仓库

### 第 5 步：设置 Root Directory

这一步很关键。

在导入项目时，找到：

```text
Root Directory
```

把它设置为：

```text
saolei
```

意思是：Vercel 只把 `saolei` 目录当成网站根目录来发布。

### 第 6 步：框架和构建设置

这是一个纯静态网页，所以一般这样就行：

- Framework Preset: `Other`
- Build Command: 留空
- Output Directory: 留空，或者填 `.`

如果 Vercel 自动识别成静态站点，也可以直接保持默认。

### 第 7 步：环境变量

当前版本里，Supabase 地址和前端 `anon key` 已经直接写在：

[`config.js`](file:///d:/WeChatProjects/miniprogram-1/saolei/config.js)

所以**当前这版不需要额外配置环境变量**。

注意：

- `anon key` 是前端可公开使用的 key
- 不能把 `service_role_key` 放进前端

### 第 8 步：点击 Deploy

部署完成后，Vercel 会给你一个网址，例如：

```text
https://xxxx.vercel.app
```

把这个地址发给别人，他们就能远程进入。

---

## 多人联机时，大家怎么操作

### 房主

1. 打开网页
2. 第一次输入昵称
3. 选择难度
4. 也可以手动拖动宽度、高度、地雷数
5. 点击“开始游戏并创建房间”

创建完成后：

- 房间名会显示为 `你的昵称 的房间`
- 棋盘会立即生成
- 别人刷新页面后就能看到这个房间
- 右侧可以切换 `翻开模式 / 插旗模式 / 问号模式`

### 其他玩家

1. 打开同一个网址
2. 输入自己的昵称
3. 在“加入多人房间”列表中找到房间
4. 点击“加入”

加入后：

- 所有人都看到同一个棋盘
- 一个人翻开的格子，其他人也会同步看到
- 一个人插旗，其他人也会同步看到
- 一个人切换问号标记，其他人也会同步看到

---

## 代码里的联机同步是怎么做的

为了让你后面改起来不迷路，我把设计思路直接写明白。

### 数据表

当前使用了两张表：

#### `minesweeper_rooms`

存：

- 房间名
- 房主信息
- 难度配置
- 棋盘宽高
- 地雷数
- 当前棋盘 JSON
- 当前状态（进行中 / 赢 / 输）
- revision 版本号

#### `minesweeper_players`

存：

- 房间里有哪些在线玩家
- 玩家昵称
- 玩家颜色
- 最后心跳时间

### 为什么要有 `revision`

因为多人可能同时点击同一个棋盘。

当前代码用了一个简单的**乐观锁**办法：

1. 客户端先拿到当前房间的 `revision`
2. 改完棋盘后，更新时要求：

```text
只有 revision 还是旧值时，才允许写入
```

3. 如果有人比你先一步改了，当前写入就会失败
4. 前端会重新拉最新棋盘

这样能避免“后写覆盖先写”的明显错乱。

### 实时同步

前端会订阅这两张表的变化：

- `minesweeper_rooms`
- `minesweeper_players`

只要房间数据变化，客户端就会重新拉当前房间数据并重渲染。

---

## 如果你想换成你自己的 Supabase

虽然当前项目已经连好了一个可用的 Supabase，但如果你后面想独立部署，按下面做。

### 第 1 步：新建 Supabase 项目

1. 打开 Supabase
2. 新建一个项目
3. 等项目初始化完成

### 第 2 步：执行 SQL

打开 SQL Editor，把下面这个文件里的内容复制进去执行：

[`create_minesweeper_demo.sql`](file:///d:/WeChatProjects/miniprogram-1/supabase/migrations/create_minesweeper_demo.sql)

它会创建：

- `minesweeper_rooms`
- `minesweeper_players`
- RLS demo 策略
- realtime 发布配置

### 第 3 步：替换前端配置

打开：

[`config.js`](file:///d:/WeChatProjects/miniprogram-1/saolei/config.js)

把里面的两个值换成你自己项目的：

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

不要把 `service_role_key` 放进去。

---

## 现在这个版本的限制

这是一个偏“最快落地”的多人联机原型，所以我保留了简单实现，没有故意做得特别重：

1. 没有做账号体系  
   直接用浏览器本地昵称

2. 没有做复杂权限  
   当前是 demo 级策略，重点是先让多人联机跑起来

3. 没有做排行榜或历史战绩  
   当前只关心实时共享一局

4. 没有做“首点必不踩雷”  
   现在是标准随机生成盘面

5. 为了兼容手机和网页  
   页面使用“翻开模式 / 插旗模式 / 问号模式”切换，不依赖右键

---

## 你下一步最建议怎么用

最顺的流程是：

1. 先本地跑起来看页面
2. 用两个不同浏览器测试本机联机
3. 再把 `saolei` 部署到 Vercel
4. 把网址发给其他人远程测试

---

## 出现问题时先排查这几个点

### 1. 房间列表为空

先确认：

- 房主是不是已经成功创建房间
- 另一个玩家是不是打开了同一个网址
- Supabase 表里有没有数据

### 2. 两个窗口看不到彼此

大概率是因为你用了同一个浏览器配置文件，`localStorage` 共用了。

请改成：

- 不同浏览器
- 或者普通窗口 + 无痕窗口
- 或者不同设备

### 3. 页面能打开，但点格子不同步

先检查：

- Supabase realtime 是否已经启用
- 迁移 SQL 是否完整执行
- `config.js` 是否填的是正确项目

### 4. 最后一个人退出后房间没消失

当前机制是：

- 主动退出会立刻删掉玩家记录
- 异常断开会靠心跳超时清理

所以有时会有一个很短的延迟，不是坏掉。

---

## 关键文件入口

- 页面入口：[`index.html`](file:///d:/WeChatProjects/miniprogram-1/saolei/index.html)
- 联机逻辑：[`app.js`](file:///d:/WeChatProjects/miniprogram-1/saolei/app.js)
- 样式：[`style.css`](file:///d:/WeChatProjects/miniprogram-1/saolei/style.css)
- Supabase 配置：[`config.js`](file:///d:/WeChatProjects/miniprogram-1/saolei/config.js)
- 数据库 SQL：[`create_minesweeper_demo.sql`](file:///d:/WeChatProjects/miniprogram-1/supabase/migrations/create_minesweeper_demo.sql)
