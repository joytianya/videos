const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class SimpleVideoListCrawler {
    constructor() {
        this.baseUrl = 'https://www.yfsp.tv/list';
        this.browser = null;
        this.results = [];
        this.maxRetries = 3;
        this.delayMs = 1000; // 减少延迟，因为不需要等待视频加载
    }

    async init() {
        console.log('🚀 启动简化版爬虫程序...');
        this.browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 获取列表页面的所有视频链接
    async getVideoLinksFromPage(pageUrl) {
        const page = await this.browser.newPage();

        try {
            console.log(`📄 正在访问页面: ${pageUrl}`);
            await page.goto(pageUrl, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // 等待页面加载
            await this.delay(1000);

            // 提取视频链接和基本信息
            const videoLinks = await page.evaluate(() => {
                const videos = [];

                // 尝试多种可能的选择器
                const selectors = [
                    'a[href*="/play/"]',
                    '.video-item a',
                    '.video-list a',
                    'a[href*="play"]',
                    '.item a',
                    '.list-item a'
                ];

                let foundLinks = [];

                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        foundLinks = Array.from(elements);
                        break;
                    }
                }

                foundLinks.forEach((link, index) => {
                    const href = link.getAttribute('href');
                    if (href && href.includes('play')) {
                        // 构建完整URL
                        const fullUrl = href.startsWith('http') ? href : `https://www.yfsp.tv${href}`;

                        // 尝试获取标题
                        let title = '';
                        const titleEl = link.querySelector('img') ?
                            link.querySelector('img').getAttribute('alt') :
                            link.textContent.trim();

                        if (titleEl) {
                            title = titleEl.substring(0, 100);
                        }

                        // 尝试获取缩略图
                        let thumbnail = '';
                        const imgEl = link.querySelector('img');
                        if (imgEl) {
                            thumbnail = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
                            if (thumbnail && !thumbnail.startsWith('http')) {
                                thumbnail = `https://www.yfsp.tv${thumbnail}`;
                            }
                        }

                        videos.push({
                            url: fullUrl,
                            title: title || `视频 ${index + 1}`,
                            thumbnail: thumbnail,
                            listPageUrl: window.location.href
                        });
                    }
                });

                return videos;
            });

            console.log(`✅ 页面 ${pageUrl} 找到 ${videoLinks.length} 个视频`);
            return videoLinks;

        } catch (error) {
            console.error(`❌ 获取页面 ${pageUrl} 失败:`, error.message);
            return [];
        } finally {
            await page.close();
        }
    }

    // 获取单个视频的详细元信息（不获取M3U8）
    async getVideoMetadata(videoInfo, retryCount = 0) {
        const page = await this.browser.newPage();

        try {
            console.log(`🎬 正在获取元信息: ${videoInfo.title || videoInfo.url}`);

            // 访问视频页面
            await page.goto(videoInfo.url, {
                waitUntil: 'domcontentloaded', // 只等待DOM加载，不等待视频
                timeout: 20000
            });

            // 短暂等待页面渲染
            await this.delay(2000);

            // 提取详细元信息
            const detailedInfo = await page.evaluate(() => {
                // 提取标题
                let title = document.title || '';
                const h1 = document.querySelector('h1');
                const titleSelectors = [
                    '.title', '.video-title', '[class*="title"]',
                    '.movie-title', '.film-title', 'h1', 'h2'
                ];

                for (const selector of titleSelectors) {
                    const el = document.querySelector(selector);
                    if (el && el.textContent.trim()) {
                        title = el.textContent.trim();
                        break;
                    }
                }

                // 提取分类/标签
                const categories = [];
                const categorySelectors = [
                    '.category', '.genre', '.tag', '.tags',
                    '[class*="category"]', '[class*="genre"]', '[class*="tag"]',
                    '.movie-genre', '.film-category'
                ];

                categorySelectors.forEach(selector => {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        const text = el.textContent.trim();
                        if (text && text.length < 20 && !categories.includes(text)) {
                            categories.push(text);
                        }
                    });
                });

                // 提取播放次数/观看次数
                let views = '';
                const viewSelectors = [
                    '.views', '.play-count', '.watch-count',
                    '[class*="view"]', '[class*="play"]', '[class*="count"]'
                ];
                for (const selector of viewSelectors) {
                    const el = document.querySelector(selector);
                    if (el) {
                        const text = el.textContent.trim();
                        if (text.match(/\d+/) && (text.includes('播放') || text.includes('观看') || text.includes('次') || /^\d+$/.test(text))) {
                            views = text;
                            break;
                        }
                    }
                }

                // 提取评分
                let rating = '';
                const ratingSelectors = [
                    '.rating', '.score', '.rate', '[class*="rating"]',
                    '[class*="score"]', '.movie-rating', '.film-score'
                ];
                for (const selector of ratingSelectors) {
                    const el = document.querySelector(selector);
                    if (el) {
                        const text = el.textContent.trim();
                        if (text.includes('暂无') || text.includes('无评分')) {
                            rating = '暂无评分';
                            break;
                        }
                        const match = text.match(/(\d+\.?\d*)/);
                        if (match) {
                            rating = match[1];
                            break;
                        }
                    }
                }

                // 提取添加日期
                let addDate = '';
                const dateSelectors = [
                    '.date', '.add-date', '.upload-date', '.publish-date',
                    '[class*="date"]', '[class*="time"]'
                ];
                for (const selector of dateSelectors) {
                    const el = document.querySelector(selector);
                    if (el) {
                        const text = el.textContent.trim();
                        if (text.includes('添加') || text.includes('上传') || text.includes('发布') || text.match(/\d{4}/)) {
                            addDate = text;
                            break;
                        }
                    }
                }

                // 提取导演
                let director = '';
                const directorSelectors = [
                    '.director', '[class*="director"]', '.movie-director'
                ];
                for (const selector of directorSelectors) {
                    const el = document.querySelector(selector);
                    if (el) {
                        director = el.textContent.replace('导演：', '').trim();
                        break;
                    }
                }

                // 提取主演
                let actors = '';
                const actorSelectors = [
                    '.actors', '.cast', '[class*="actor"]', '[class*="cast"]', '.movie-cast'
                ];
                for (const selector of actorSelectors) {
                    const el = document.querySelector(selector);
                    if (el) {
                        actors = el.textContent.replace('主演：', '').trim();
                        break;
                    }
                }

                // 提取简介
                let description = '';
                const descSelectors = [
                    '.description', '.desc', '.summary', '.intro', '.content',
                    '[class*="desc"]', '[class*="intro"]', '[class*="summary"]',
                    '.movie-desc', '.film-desc'
                ];
                for (const selector of descSelectors) {
                    const el = document.querySelector(selector);
                    if (el) {
                        const text = el.textContent.trim();
                        if (text && text.length > 20) { // 简介通常比较长
                            description = text.replace('简介：', '').trim();
                            break;
                        }
                    }
                }

                // 提取评论、点赞、踩、分享数据
                let comments = '';
                let likes = '';
                let dislikes = '';
                let shares = '';

                // 查找包含数字的文本
                const statElements = document.querySelectorAll('*');
                Array.from(statElements).forEach(el => {
                    const text = el.textContent.trim();
                    if (text.match(/^\d+\s*评论$/)) comments = text;
                    if (text.match(/^\d+\s*赞$/)) likes = text;
                    if (text.match(/^\d+\s*踩$/)) dislikes = text;
                    if (text.match(/^\d+\s*分享$/)) shares = text;
                });

                return {
                    title: title.substring(0, 200),
                    categories: categories.slice(0, 10),
                    views: views,
                    rating: rating || '暂无评分',
                    addDate: addDate,
                    director: director || '未知',
                    actors: actors || '未知',
                    description: description.substring(0, 1000),
                    comments: comments,
                    likes: likes,
                    dislikes: dislikes,
                    shares: shares,
                    pageUrl: window.location.href
                };
            });

            // 合并信息
            const result = {
                ...videoInfo,
                ...detailedInfo,
                crawledAt: new Date().toISOString(),
                success: true
            };

            console.log(`✅ 成功获取元信息: ${result.title}`);
            return result;

        } catch (error) {
            console.error(`❌ 获取视频元信息失败 ${videoInfo.url}:`, error.message);

            // 重试机制
            if (retryCount < this.maxRetries) {
                console.log(`🔄 重试 ${retryCount + 1}/${this.maxRetries}: ${videoInfo.url}`);
                await this.delay(3000);
                return this.getVideoMetadata(videoInfo, retryCount + 1);
            }

            return {
                ...videoInfo,
                error: error.message,
                success: false,
                crawledAt: new Date().toISOString()
            };
        } finally {
            await page.close();
        }
    }

    // 检测是否还有下一页
    async hasNextPage(pageUrl) {
        const page = await this.browser.newPage();

        try {
            await page.goto(pageUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 20000
            });

            const hasNext = await page.evaluate(() => {
                // 检查页面上是否有视频内容
                const videoSelectors = [
                    'a[href*="/play/"]',
                    '.video-item',
                    '.video-list li'
                ];

                for (const selector of videoSelectors) {
                    if (document.querySelectorAll(selector).length > 0) {
                        return true;
                    }
                }

                return false;
            });

            return hasNext;
        } catch (error) {
            return false;
        } finally {
            await page.close();
        }
    }

    // 主爬取函数
    async crawl(startPage = 1, maxPages = 50) {
        try {
            await this.init();

            console.log(`🕷️  开始爬取视频元信息，起始页面: ${startPage}, 最大页面数: ${maxPages}`);

            let currentPage = startPage;
            let totalVideos = 0;

            while (currentPage <= maxPages) {
                const pageUrl = currentPage === 1 ?
                    this.baseUrl :
                    `${this.baseUrl}?page=${currentPage}`;

                console.log(`\n📑 正在处理第 ${currentPage} 页...`);

                // 检查页面是否存在
                const hasContent = await this.hasNextPage(pageUrl);
                if (!hasContent && currentPage > 1) {
                    console.log(`📄 第 ${currentPage} 页无内容，爬取结束`);
                    break;
                }

                // 获取当前页面的视频链接
                const videoLinks = await this.getVideoLinksFromPage(pageUrl);

                if (videoLinks.length === 0) {
                    console.log(`⚠️  第 ${currentPage} 页未找到视频，跳过`);
                    currentPage++;
                    continue;
                }

                // 逐个获取视频元信息
                for (let i = 0; i < videoLinks.length; i++) {
                    const videoInfo = videoLinks[i];
                    console.log(`\n[${currentPage}-${i+1}/${videoLinks.length}] 处理视频...`);

                    const detailedInfo = await this.getVideoMetadata(videoInfo);
                    this.results.push(detailedInfo);
                    totalVideos++;

                    // 添加延迟，避免请求过于频繁
                    await this.delay(this.delayMs);

                    // 每处理20个视频保存一次（防止数据丢失）
                    if (totalVideos % 20 === 0) {
                        await this.saveResults(`video_metadata_temp_${Date.now()}.json`);
                    }
                }

                console.log(`✅ 第 ${currentPage} 页完成，共处理 ${videoLinks.length} 个视频`);
                currentPage++;

                // 页面间延迟
                await this.delay(2000);
            }

            console.log(`\n🎉 爬取完成！总共获取 ${totalVideos} 个视频元信息`);

            // 保存最终结果
            await this.saveResults();

            // 生成统计报告
            await this.generateReport();

        } catch (error) {
            console.error('❌ 爬取过程发生错误:', error);
        } finally {
            if (this.browser) {
                await this.browser.close();
            }
        }
    }

    // 保存结果到JSON文件
    async saveResults(filename = null) {
        const fileName = filename || `video_metadata_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
        const filePath = path.join(__dirname, fileName);

        const data = {
            crawlInfo: {
                totalVideos: this.results.length,
                successCount: this.results.filter(v => v.success).length,
                failureCount: this.results.filter(v => !v.success).length,
                crawledAt: new Date().toISOString(),
                baseUrl: this.baseUrl,
                type: 'metadata-only' // 标记这是只获取元信息的爬取
            },
            videos: this.results
        };

        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        console.log(`💾 结果已保存到: ${fileName}`);
    }

    // 生成统计报告
    async generateReport() {
        const total = this.results.length;
        const successful = this.results.filter(v => v.success).length;
        const failed = this.results.filter(v => !v.success).length;
        const withCategories = this.results.filter(v => v.categories && v.categories.length > 0).length;

        const report = `
📊 视频元信息爬取统计报告
================================
总视频数量: ${total}
成功获取: ${successful} (${((successful/total)*100).toFixed(1)}%)
获取失败: ${failed} (${((failed/total)*100).toFixed(1)}%)
有分类信息: ${withCategories} (${((withCategories/total)*100).toFixed(1)}%)

📁 文件保存位置: ${__dirname}
🕐 完成时间: ${new Date().toLocaleString()}
================================
        `;

        console.log(report);

        // 保存报告到文件
        const reportFile = `metadata_crawler_report_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
        fs.writeFileSync(path.join(__dirname, reportFile), report, 'utf8');
    }
}

// 主程序入口
async function main() {
    const args = process.argv.slice(2);
    const startPage = parseInt(args[0]) || 1;
    const maxPages = parseInt(args[1]) || 50;

    console.log(`
🕷️  简化版视频爬虫程序启动
================================
起始页面: ${startPage}
最大页面数: ${maxPages}
目标网站: https://www.yfsp.tv/list
爬取内容: 视频链接 + 元信息（不包含M3U8）
================================
    `);

    const crawler = new SimpleVideoListCrawler();
    await crawler.crawl(startPage, maxPages);
}

// 如果直接运行此脚本
if (require.main === module) {
    main().catch(console.error);
}

module.exports = SimpleVideoListCrawler;