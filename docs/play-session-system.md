# 🔐 播放会话系统说明

## 🎯 系统目标

为了隐藏播放页面的URL参数，避免暴露原始播放地址，我们实现了基于唯一ID的播放会话系统。

## 🔄 工作流程

### 1. 旧的播放方式（已废弃）
```
用户点击播放 → 直接跳转播放器页面
URL: /player.html?url=https%3A%2F%2Fwww.yfsp.tv%2Fplay%2F11j9RDawU61&title=%E6%89%AB%E6%AF%92%E9%A3%8E%E6%9A%B4
```

### 2. 新的播放会话系统
```
用户点击播放 → 创建播放会话 → 获取播放ID → 跳转播放器
URL: /player?id=play_0277ee1fe1f7
```

## 🔧 技术实现

### 播放会话管理器 (`play-session.js`)

**核心功能**：
- 生成唯一播放ID（MD5哈希 + 时间戳 + 随机数）
- 存储播放会话信息（内存存储）
- 自动清理过期会话（24小时过期）
- 访问统计和监控

**会话数据结构**：
```javascript
{
    playId: "play_0277ee1fe1f7",
    playUrl: "https://www.yfsp.tv/play/11j9RDawU61",
    title: "扫毒风暴",
    videoId: "test123",
    createdAt: 1753802582870,
    expiresAt: 1753888982870,
    accessCount: 1,
    lastAccessAt: 1753802582871
}
```

### API接口

#### 1. 创建播放会话
```http
POST /create-play-session
Content-Type: application/json

{
    "playUrl": "https://www.yfsp.tv/play/11j9RDawU61",
    "title": "扫毒风暴",
    "videoId": "test123"
}
```

**响应**：
```json
{
    "success": true,
    "playId": "play_0277ee1fe1f7",
    "playerUrl": "/player?id=play_0277ee1fe1f7"
}
```

#### 2. 获取播放会话信息
```http
GET /play-session/play_0277ee1fe1f7
```

**响应**：
```json
{
    "success": true,
    "session": {
        "playId": "play_0277ee1fe1f7",
        "title": "扫毒风暴",
        "videoId": "test123",
        "createdAt": 1753802582870,
        "accessCount": 1
    }
}
```

#### 3. 播放器页面路由
```http
GET /player?id=play_0277ee1fe1f7
```

**功能**：
- 验证播放会话是否存在和有效
- 将会话信息注入到HTML页面中
- 返回完整的播放器页面

### 前端集成

#### 搜索页面更新
```javascript
// 旧方式
function playVideo(videoId, playUrl, title) {
    const playerUrl = `/player.html?url=${encodeURIComponent(playUrl)}&title=${encodeURIComponent(title)}`;
    window.open(playerUrl, '_blank');
}

// 新方式
async function playVideo(videoId, playUrl, title) {
    const response = await fetch('/create-play-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playUrl, title, videoId })
    });
    
    const data = await response.json();
    if (data.success) {
        window.open(data.playerUrl, '_blank');
    }
}
```

#### 播放器页面更新
```javascript
// 新增：从会话信息获取播放地址
if (window.PLAY_SESSION) {
    // 使用会话ID获取M3U8地址
    const response = await fetch('/extract-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playId: window.PLAY_SESSION.playId })
    });
}
```

## 🔒 安全特性

### 1. URL隐私保护
- **旧方式**: URL中直接暴露原始播放地址
- **新方式**: 只显示无意义的播放ID

### 2. 会话过期机制
- 自动过期时间：24小时
- 定期清理：每小时清理一次过期会话
- 访问验证：每次访问都验证会话有效性

### 3. 访问统计
- 记录会话创建时间
- 统计访问次数
- 追踪最后访问时间

## 📊 系统监控

### 统计信息API
```http
GET /search-stats
```

**响应包含播放会话统计**：
```json
{
    "success": true,
    "totalVideos": 180,
    "totalKeywords": 2474,
    "totalSessions": 5,
    "activeSessions": 2
}
```

### 日志记录
```
🎬 创建播放会话: play_0277ee1fe1f7 -> 扫毒风暴
⏰ 播放会话已过期: play_old123456
🗑️ 删除播放会话: play_old123456
🧹 清理了 3 个过期播放会话
```

## 🔄 向后兼容

系统保持向后兼容，支持旧的URL参数方式：

```javascript
// 如果访问旧格式URL
GET /player?url=https%3A%2F%2Fwww.yfsp.tv%2Fplay%2F11j9RDawU61&title=扫毒风暴

// 系统会自动：
1. 创建临时播放会话
2. 重定向到新格式URL
3. 继续正常播放
```

## 🚀 使用示例

### 1. 从搜索页面播放
1. 用户在搜索页面点击"立即播放"
2. 前端调用 `/create-play-session` API
3. 获得播放ID：`play_0277ee1fe1f7`
4. 打开新窗口：`/player?id=play_0277ee1fe1f7`
5. 播放器页面自动获取播放地址并开始播放

### 2. 直接访问播放器
```bash
# 创建播放会话
curl -X POST http://localhost:3000/create-play-session \
  -H "Content-Type: application/json" \
  -d '{"playUrl":"https://www.yfsp.tv/play/11j9RDawU61","title":"扫毒风暴"}'

# 返回: {"success":true,"playId":"play_0277ee1fe1f7","playerUrl":"/player?id=play_0277ee1fe1f7"}

# 访问播放器
open "http://localhost:3000/player?id=play_0277ee1fe1f7"
```

## 🔧 配置选项

### 会话过期时间
```javascript
// 在 play-session.js 中修改
this.sessionTimeout = 24 * 60 * 60 * 1000; // 24小时
```

### 清理频率
```javascript
// 在 play-session.js 中修改
setInterval(() => {
    this.cleanupExpiredSessions();
}, 60 * 60 * 1000); // 每小时清理一次
```

## 🎯 优势总结

1. **隐私保护**: URL中不再暴露原始播放地址
2. **安全性**: 播放ID具有时效性，无法长期使用
3. **可追踪**: 完整的访问日志和统计信息
4. **向后兼容**: 不影响现有功能
5. **用户友好**: URL更简洁，易于分享

---

**现在你的播放链接已经从复杂的URL参数变成了简洁的ID形式！** 🔐✨ 