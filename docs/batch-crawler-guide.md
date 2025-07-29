# 🕷️ 批量爬虫使用指南

## 🎯 功能概述

批量爬虫工具 (`batch-crawler.js`) 专门用于大规模数据爬取，支持：
- **断点续传**: 自动跳过已完成的页面
- **进度保存**: 实时保存爬取进度
- **失败重试**: 支持重试失败的页面
- **批次处理**: 分批处理，避免服务器压力
- **详细日志**: 完整的爬取日志记录

## 🚀 快速开始

### 1. 爬取1-999页所有数据
```bash
# 使用npm脚本（推荐）
npm run batch-crawl

# 或者直接运行
node batch-crawler.js crawl 1 999
```

### 2. 测试爬取（前10页）
```bash
npm run batch-crawl-test
```

### 3. 查看爬取进度
```bash
npm run batch-status
```

### 4. 重试失败的页面
```bash
npm run batch-retry
```

## 📋 详细命令说明

### 🔄 爬取命令
```bash
# 基本格式
node batch-crawler.js crawl [起始页] [结束页]

# 示例
node batch-crawler.js crawl 1 999      # 爬取1-999页
node batch-crawler.js crawl 100 200    # 爬取100-200页
node batch-crawler.js crawl 500 999    # 从第500页开始爬取到999页
```

### 📊 状态查看
```bash
node batch-crawler.js status
```
输出示例：
```
📊 爬取进度:
   当前页面: 25
   总页面数: 999
   已完成: 20页
   失败页面: 5页
   最后更新: 2025-07-29T15:30:45.123Z
   状态: in_progress
```

### 🔄 重试失败页面
```bash
node batch-crawler.js retry
```

### 📋 生成汇总文件
```bash
node batch-crawler.js summary
```

## ⚙️ 配置参数

在 `batch-crawler.js` 中可以调整以下参数：

```javascript
class BatchCrawler {
    constructor() {
        this.batchSize = 10;              // 每批处理页面数
        this.delayBetweenBatches = 5000;  // 批次间延迟(毫秒)
        this.delayBetweenPages = 2000;    // 页面间延迟(毫秒)
    }
}
```

### 推荐配置：
- **小规模测试**: `batchSize: 5, delayBetweenPages: 1000`
- **正常爬取**: `batchSize: 10, delayBetweenPages: 2000` (默认)
- **保守爬取**: `batchSize: 5, delayBetweenPages: 5000`

## 📁 输出文件结构

```
dynamic_api_data/
├── page_001.json              # 第1页数据
├── page_002.json              # 第2页数据
├── ...
├── page_999.json              # 第999页数据
├── summary_all_videos.json    # 所有视频汇总
├── crawl_progress.json        # 爬取进度记录
├── batch_crawl.log           # 详细爬取日志
└── debug_page_X_response.json # 调试信息（可选）
```

### 文件说明：

#### 1. 页面数据文件 (`page_XXX.json`)
```json
{
  "page": 1,
  "totalVideos": 36,
  "crawledAt": "2025-07-29T15:30:45.123Z",
  "apiUrl": "https://m10.yfsp.tv/api/list/Search?...",
  "videos": [
    {
      "id": "yFzkMEbsApL",
      "title": "长发鬼",
      "playUrl": "https://www.yfsp.tv/play/yFzkMEbsApL",
      "categories": ["爱情", "惊悚", "恐怖"],
      "year": "其它",
      "rating": "暂无评分",
      "views": "867",
      "addTime": "2025年07月29日"
    }
  ]
}
```

#### 2. 汇总文件 (`summary_all_videos.json`)
```json
{
  "totalPages": 25,
  "totalVideos": 900,
  "generatedAt": "2025-07-29T15:30:45.123Z",
  "pageRange": {
    "min": 1,
    "max": 25
  },
  "videos": [/* 所有视频数据 */]
}
```

#### 3. 进度文件 (`crawl_progress.json`)
```json
{
  "currentPage": 25,
  "totalPages": 999,
  "completedPages": 20,
  "failedPages": 5,
  "completedList": [1, 2, 3, 5, 7, ...],
  "failedList": [4, 6, 8, 12, 15],
  "lastUpdate": "2025-07-29T15:30:45.123Z",
  "status": "in_progress"
}
```

## 🔍 监控和调试

### 1. 实时监控日志
```bash
# 在另一个终端窗口中查看实时日志
tail -f dynamic_api_data/batch_crawl.log
```

### 2. 检查已完成页面
```bash
ls dynamic_api_data/page_*.json | wc -l
```

### 3. 检查文件大小（排除异常小的文件）
```bash
find dynamic_api_data -name "page_*.json" -size +1k | wc -l
```

## ⚠️ 注意事项

### 1. 网络稳定性
- 确保网络连接稳定
- 如果网络不稳定，建议增加延迟时间

### 2. 服务器负载
- 不要设置过小的延迟时间
- 推荐页面间延迟至少2秒

### 3. 磁盘空间
- 999页数据大约需要50-100MB空间
- 确保有足够的磁盘空间

### 4. 中断和恢复
- 可以随时中断爬取（Ctrl+C）
- 重新运行时会自动从断点继续

## 🚨 故障排除

### 1. 页面爬取失败
```bash
# 查看失败页面
npm run batch-status

# 重试失败页面
npm run batch-retry
```

### 2. API参数获取失败
- 通常是网络问题或目标网站临时不可用
- 等待一段时间后重试

### 3. 文件损坏
```bash
# 检查文件完整性
find dynamic_api_data -name "page_*.json" -size -1k

# 删除损坏的文件（会自动重新爬取）
find dynamic_api_data -name "page_*.json" -size -1k -delete
```

## 📊 性能优化

### 1. 并发控制
当前版本为串行处理，如需提高速度可以：
- 减少延迟时间（风险：可能被封IP）
- 增加批次大小

### 2. 内存优化
- 大批量爬取时，建议定期重启程序
- 每100页重新生成一次汇总文件

## 🎯 使用场景

### 1. 完整数据爬取
```bash
# 爬取所有页面
npm run batch-crawl
```

### 2. 增量更新
```bash
# 假设已有1-500页，现在爬取501-999页
node batch-crawler.js crawl 501 999
```

### 3. 特定范围爬取
```bash
# 只爬取最新的100页
node batch-crawler.js crawl 900 999
```

## 🔄 与搜索系统集成

爬取完成后，需要重建搜索索引：

```bash
# 重建搜索索引
npm run build-index

# 测试搜索功能
npm run test-search
```

---

**开始你的大规模数据爬取之旅！** 🚀

记住：**耐心是爬虫的美德，稳定比速度更重要！** ⏰✨ 