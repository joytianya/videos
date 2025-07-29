const DynamicApiCrawler = require('./dynamic-api-crawler');
const fs = require('fs');
const path = require('path');

class BatchCrawler {
    constructor() {
        this.outputDir = 'dynamic_api_data';
        this.progressFile = path.join(this.outputDir, 'crawl_progress.json');
        this.logFile = path.join(this.outputDir, 'batch_crawl.log');
        this.batchSize = 10; // 每批处理的页面数
        this.delayBetweenBatches = 5000; // 批次间延迟 (毫秒)
        this.delayBetweenPages = 2000; // 页面间延迟 (毫秒)
    }

    // 记录日志
    log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}`;
        console.log(logMessage);

        // 写入日志文件
        fs.appendFileSync(this.logFile, logMessage + '\n');
    }

    // 保存进度
    saveProgress(currentPage, totalPages, completedPages, failedPages) {
        const progress = {
            currentPage,
            totalPages,
            completedPages: completedPages.length,
            failedPages: failedPages.length,
            completedList: completedPages,
            failedList: failedPages,
            lastUpdate: new Date().toISOString(),
            status: currentPage >= totalPages ? 'completed' : 'in_progress'
        };

        fs.writeFileSync(this.progressFile, JSON.stringify(progress, null, 2));
    }

    // 加载进度
    loadProgress() {
        if (fs.existsSync(this.progressFile)) {
            try {
                return JSON.parse(fs.readFileSync(this.progressFile, 'utf8'));
            } catch (error) {
                this.log(`⚠️ 无法加载进度文件: ${error.message}`);
            }
        }
        return null;
    }

    // 获取已完成的页面列表
    getCompletedPages() {
        const completed = [];
        const files = fs.readdirSync(this.outputDir);

        for (const file of files) {
            const match = file.match(/^page_(\d+)\.json$/);
            if (match) {
                const pageNum = parseInt(match[1]);
                // 检查文件是否有效（大小大于1KB）
                const filePath = path.join(this.outputDir, file);
                const stats = fs.statSync(filePath);
                if (stats.size > 1024) {
                    completed.push(pageNum);
                }
            }
        }

        return completed.sort((a, b) => a - b);
    }

    // 批量爬取
    async batchCrawl(startPage = 1, endPage = 999) {
        this.log(`🚀 开始批量爬取: 第${startPage}页 到 第${endPage}页`);
        this.log(`📊 配置信息:`);
        this.log(`   - 批次大小: ${this.batchSize}页/批`);
        this.log(`   - 批次间延迟: ${this.delayBetweenBatches}ms`);
        this.log(`   - 页面间延迟: ${this.delayBetweenPages}ms`);

        // 检查已完成的页面
        const completedPages = this.getCompletedPages();
        const failedPages = [];

        this.log(`📁 已完成页面: ${completedPages.length}页`);
        if (completedPages.length > 0) {
            this.log(`   最新页面: 第${Math.max(...completedPages)}页`);
        }

        // 创建待爬取页面列表
        const allPages = [];
        for (let page = startPage; page <= endPage; page++) {
            if (!completedPages.includes(page)) {
                allPages.push(page);
            }
        }

        this.log(`📋 待爬取页面: ${allPages.length}页`);

        if (allPages.length === 0) {
            this.log(`✅ 所有页面已完成，无需爬取`);
            return;
        }

        // 分批处理
        const totalBatches = Math.ceil(allPages.length / this.batchSize);
        let currentBatch = 0;

        for (let i = 0; i < allPages.length; i += this.batchSize) {
            currentBatch++;
            const batch = allPages.slice(i, i + this.batchSize);

            this.log(`\n🔄 执行第${currentBatch}/${totalBatches}批次: 页面 ${batch[0]}-${batch[batch.length - 1]}`);

            // 处理当前批次
            for (const page of batch) {
                try {
                    this.log(`📥 开始爬取第${page}页...`);

                    const crawler = new DynamicApiCrawler();
                    await crawler.init();

                    // 爬取单页
                    const success = await this.crawlSinglePage(crawler, page);

                    await crawler.cleanup();

                    if (success) {
                        completedPages.push(page);
                        this.log(`✅ 第${page}页爬取成功`);
                    } else {
                        failedPages.push(page);
                        this.log(`❌ 第${page}页爬取失败`);
                    }

                    // 保存进度
                    this.saveProgress(page, endPage, completedPages, failedPages);

                    // 页面间延迟
                    if (page !== batch[batch.length - 1]) {
                        await this.delay(this.delayBetweenPages);
                    }

                } catch (error) {
                    failedPages.push(page);
                    this.log(`💥 第${page}页爬取异常: ${error.message}`);
                }
            }

            // 批次间延迟
            if (currentBatch < totalBatches) {
                this.log(`⏳ 批次间休息 ${this.delayBetweenBatches}ms...`);
                await this.delay(this.delayBetweenBatches);
            }
        }

        // 最终统计
        this.log(`\n📊 爬取完成统计:`);
        this.log(`   ✅ 成功: ${completedPages.length}页`);
        this.log(`   ❌ 失败: ${failedPages.length}页`);
        this.log(`   📈 成功率: ${((completedPages.length / (completedPages.length + failedPages.length)) * 100).toFixed(2)}%`);

        if (failedPages.length > 0) {
            this.log(`\n🔄 失败页面列表: ${failedPages.join(', ')}`);
            this.log(`💡 可以稍后重新运行来重试失败的页面`);
        }

        // 生成汇总文件
        await this.generateSummary();
    }

    // 爬取单页
    async crawlSinglePage(crawler, page) {
        try {
            // 获取API参数
            const apiResult = await crawler.getApiParams(page);
            if (!apiResult.success || !apiResult.params.vv || !apiResult.params.pub) {
                this.log(`⚠️ 第${page}页API参数获取失败`);
                return false;
            }

            // 构建API URL
            const apiUrl = `https://m10.yfsp.tv/api/list/Search?cinema=1&page=${page}&size=36&orderby=0&desc=1&isserial=-1&isIndex=-1&isfree=-1&vv=${apiResult.params.vv}&pub=${apiResult.params.pub}`;

            // 发起API请求
            const response = await this.makeDirectApiRequest(apiUrl, page);
            if (!response) {
                return false;
            }

            // 保存数据
            await this.savePageData(page, response);
            return true;

        } catch (error) {
            this.log(`💥 第${page}页处理异常: ${error.message}`);
            return false;
        }
    }

    // 生成汇总文件
    async generateSummary() {
        this.log(`📋 正在生成数据汇总...`);

        const completedPages = this.getCompletedPages();
        const allVideos = [];

        for (const page of completedPages) {
            try {
                const filePath = path.join(this.outputDir, `page_${page.toString().padStart(3, '0')}.json`);
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                if (data.videos && Array.isArray(data.videos)) {
                    allVideos.push(...data.videos);
                }
            } catch (error) {
                this.log(`⚠️ 读取第${page}页数据失败: ${error.message}`);
            }
        }

        const summary = {
            totalPages: completedPages.length,
            totalVideos: allVideos.length,
            generatedAt: new Date().toISOString(),
            pageRange: completedPages.length > 0 ? {
                min: Math.min(...completedPages),
                max: Math.max(...completedPages)
            } : null,
            videos: allVideos
        };

        const summaryPath = path.join(this.outputDir, 'summary_all_videos.json');
        fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

        this.log(`✅ 汇总完成: ${allVideos.length}个视频，保存到 ${summaryPath}`);
    }

    // 延迟函数
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 直接发起API请求
    async makeDirectApiRequest(apiUrl, page) {
        try {
            this.log(`📡 正在调用API获取第${page}页数据...`);

            const axios = require('axios');
            const response = await axios.get(apiUrl, {
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': 'https://www.yfsp.tv/',
                    'Accept': 'application/json, text/plain, */*'
                }
            });

            if (response.status === 200 && response.data) {
                const data = response.data;

                // 保存调试信息
                const debugPath = path.join(this.outputDir, `debug_page_${page}_response.json`);
                fs.writeFileSync(debugPath, JSON.stringify(data, null, 2));

                if (data.ret === 200 && data.data && data.data.info && Array.isArray(data.data.info) && data.data.info.length > 0) {
                    const pageInfo = data.data.info[0];
                    const videos = pageInfo.result || [];
                    const maxPage = pageInfo.maxpage || 0;
                    const recordCount = pageInfo.recordcount || 0;

                    this.log(`✅ 第${page}页API请求成功，获得${videos.length}条数据`);
                    this.log(`📊 总页数: ${maxPage}, 总记录数: ${recordCount}`);

                    // 处理视频数据
                    const processedVideos = videos.map(video => ({
                        // 基本信息
                        title: video.title || '',
                        key: video.key || '',
                        playUrl: video.key ? `https://www.yfsp.tv/play/${video.key}` : '',

                        // 分类和标签
                        categories: video.cidMapper ? video.cidMapper.split(',') : [],
                        cid: video.cid || '',
                        atypeName: video.atypeName || '',

                        // 媒体信息
                        image: video.image || '',
                        year: video.year || '',
                        lang: video.lang || '',
                        regional: video.regional || '',

                        // 统计数据
                        hot: video.hot || 0,
                        rating: video.rating || '',
                        score: video.score || '暂无评分',
                        comments: video.comments || 0,
                        favoriteCount: video.favoriteCount || 0,
                        shareCount: video.shareCount || 0,
                        dd: video.dd || 0,
                        dc: video.dc || 0,

                        // 详细信息
                        directed: video.directed || '未知',
                        starring: video.starring || '未知',
                        contxt: video.contxt || '',
                        addTime: video.addTime || '',

                        // 剧集信息
                        isSerial: video.isSerial || false,
                        isFilm: video.isFilm || false,
                        lastName: video.lastName || '',
                        updates: video.updates || 0,
                        serialCount: video.serialCount || 0,
                        updateweekly: video.updateweekly || '',

                        // 其他
                        vipResource: video.vipResource || '',
                        charge: video.charge || 0,
                        recommended: video.recommended || false,

                        // 元数据
                        crawledAt: new Date().toISOString(),
                        apiPage: page
                    }));

                    return {
                        success: true,
                        page: page,
                        videos: processedVideos,
                        maxPage: maxPage,
                        recordCount: recordCount,
                        totalVideosOnPage: videos.length
                    };
                } else {
                    this.log(`⚠️ 第${page}页API响应数据格式异常`);
                    return {
                        success: false,
                        page: page,
                        videos: [],
                        error: 'API响应数据格式异常'
                    };
                }
            } else {
                this.log(`❌ 第${page}页API响应异常: status=${response.status}`);
                return null;
            }
        } catch (error) {
            this.log(`❌ 第${page}页API请求失败: ${error.message}`);
            return null;
        }
    }

    // 保存页面数据
    async savePageData(page, apiData) {
        try {
            if (!apiData || !apiData.success) {
                this.log(`⚠️ 第${page}页数据无效`);
                return false;
            }

            const fileName = `page_${page.toString().padStart(3, '0')}.json`;
            const filePath = path.join(this.outputDir, fileName);

            const dataToSave = {
                pageInfo: {
                    page: apiData.page,
                    success: apiData.success,
                    totalVideos: apiData.videos.length,
                    maxPage: apiData.maxPage || 0,
                    recordCount: apiData.recordCount || 0,
                    crawledAt: new Date().toISOString(),
                    error: apiData.error || null
                },
                videos: apiData.videos
            };

            fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2));
            this.log(`💾 第${page}页数据已保存: ${apiData.videos.length}个视频`);
            return true;

        } catch (error) {
            this.log(`❌ 第${page}页数据保存失败: ${error.message}`);
            return false;
        }
    }

    // 重试失败的页面
    async retryFailed() {
        const progress = this.loadProgress();
        if (!progress || !progress.failedList || progress.failedList.length === 0) {
            this.log(`📋 没有需要重试的失败页面`);
            return;
        }

        this.log(`🔄 开始重试 ${progress.failedList.length} 个失败页面...`);

        const failedPages = [...progress.failedList];
        const newCompleted = [];
        const stillFailed = [];

        for (const page of failedPages) {
            try {
                this.log(`🔄 重试第${page}页...`);

                const crawler = new DynamicApiCrawler();
                await crawler.init();

                const success = await this.crawlSinglePage(crawler, page);

                await crawler.cleanup();

                if (success) {
                    newCompleted.push(page);
                    this.log(`✅ 第${page}页重试成功`);
                } else {
                    stillFailed.push(page);
                    this.log(`❌ 第${page}页重试仍失败`);
                }

                await this.delay(this.delayBetweenPages);

            } catch (error) {
                stillFailed.push(page);
                this.log(`💥 第${page}页重试异常: ${error.message}`);
            }
        }

        this.log(`\n🔄 重试结果:`);
        this.log(`   ✅ 成功: ${newCompleted.length}页`);
        this.log(`   ❌ 仍失败: ${stillFailed.length}页`);

        // 更新进度
        const completedPages = this.getCompletedPages();
        this.saveProgress(
            Math.max(...completedPages, ...newCompleted),
            progress.totalPages,
            completedPages,
            stillFailed
        );

        if (newCompleted.length > 0) {
            await this.generateSummary();
        }
    }
}

// 主程序
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'crawl';

    const batchCrawler = new BatchCrawler();

    switch (command) {
        case 'crawl':
            const startPage = parseInt(args[1]) || 1;
            const endPage = parseInt(args[2]) || 999;
            await batchCrawler.batchCrawl(startPage, endPage);
            break;

        case 'retry':
            await batchCrawler.retryFailed();
            break;

        case 'summary':
            await batchCrawler.generateSummary();
            break;

        case 'status':
            const progress = batchCrawler.loadProgress();
            if (progress) {
                console.log('\n📊 爬取进度:');
                console.log(`   当前页面: ${progress.currentPage}`);
                console.log(`   总页面数: ${progress.totalPages}`);
                console.log(`   已完成: ${progress.completedPages}页`);
                console.log(`   失败页面: ${progress.failedPages}页`);
                console.log(`   最后更新: ${progress.lastUpdate}`);
                console.log(`   状态: ${progress.status}`);
            } else {
                console.log('📋 暂无爬取进度记录');
            }
            break;

        default:
            console.log(`
🕷️ 批量爬虫工具使用说明:

命令格式:
  node batch-crawler.js <命令> [参数]

可用命令:
  crawl [起始页] [结束页]  - 开始批量爬取 (默认: 1 999)
  retry                   - 重试失败的页面
  summary                 - 重新生成汇总文件
  status                  - 查看爬取进度

使用示例:
  node batch-crawler.js crawl 1 999     # 爬取1-999页
  node batch-crawler.js crawl 100 200   # 爬取100-200页
  node batch-crawler.js retry           # 重试失败的页面
  node batch-crawler.js status          # 查看进度
            `);
            break;
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = BatchCrawler;