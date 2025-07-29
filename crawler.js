const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class VideoListCrawler {
    constructor() {
        this.baseUrl = 'https://www.yfsp.tv/list';
        this.browser = null;
        this.results = [];
        this.maxRetries = 3;
        this.delayMs = 2000; // 请求间隔，避免过于频繁
    }

    async init() {
        console.log('🚀 启动爬虫程序...');
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
            await this.delay(2000);

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
                            title = titleEl.substring(0, 100); // 限制长度
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

    // 获取单个视频的详细信息和播放地址
    async getVideoDetails(videoInfo, retryCount = 0) {
        const page = await this.browser.newPage();

        try {
            console.log(`🎬 正在分析视频: ${videoInfo.title || videoInfo.url}`);

            const m3u8Urls = [];

            // 监听网络请求，捕获 m3u8 文件
            page.on('response', async(response) => {
                const url = response.url();
                if (url.includes('.m3u8')) {
                    console.log(`🎯 发现 M3U8: ${url}`);
                    m3u8Urls.push(url);
                }
            });

            // 访问视频页面
            await page.goto(videoInfo.url, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // 等待视频元素加载
            try {
                await page.waitForSelector('video', { timeout: 10000 });
            } catch (e) {
                console.log(`⚠️  未找到video元素: ${videoInfo.url}`);
            }

            // 提取详细元信息
            const detailedInfo = await page.evaluate(() => {
                // 提取标题
                let title = document.title || '';
                const h1 = document.querySelector('h1');
                const titleEl = document.querySelector('.title, .video-title, [class*="title"]');
                if (h1 && h1.textContent.trim()) {
                    title = h1.textContent.trim();
                } else if (titleEl && titleEl.textContent.trim()) {
                    title = titleEl.textContent.trim();
                }

                // 提取描述
                let description = '';
                const descSelectors = [
                    '.description', '.desc', '.video-desc', '.content', '.summary',
                    '[class*="desc"]', '[class*="intro"]', 'meta[name="description"]'
                ];
                for (const selector of descSelectors) {
                    const el = document.querySelector(selector);
                    if (el) {
                        if (el.tagName === 'META') {
                            description = el.getAttribute('content') || '';
                        } else {
                            description = el.textContent.trim();
                        }
                        if (description && description.length > 10) break;
                    }
                }

                // 提取其他元信息
                let rating = '';
                let views = '';
                let duration = '';
                let publishDate = '';
                const tags = [];

                // 评分
                const ratingSelectors = ['.rating', '.score', '.rate', '[class*="rating"]', '[class*="score"]'];
                for (const selector of ratingSelectors) {
                    const el = document.querySelector(selector);
                    if (el) {
                        const text = el.textContent.trim();
                        const match = text.match(/(\d+\.?\d*)/);
                        if (match) {
                            rating = match[1];
                            break;
                        }
                    }
                }

                // 播放次数
                const viewSelectors = ['.views', '.play-count', '.watch-count', '[class*="view"]', '[class*="play"]'];
                for (const selector of viewSelectors) {
                    const el = document.querySelector(selector);
                    if (el) {
                        const text = el.textContent.trim();
                        if (text.includes('播放') || text.includes('观看') || text.includes('次')) {
                            views = text;
                            break;
                        }
                    }
                }

                // 时长
                const durationSelectors = ['.duration', '.time', '.length', '[class*="duration"]', '[class*="time"]'];
                for (const selector of durationSelectors) {
                    const el = document.querySelector(selector);
                    if (el) {
                        const text = el.textContent.trim();
                        if (text.match(/\d+:\d+/)) {
                            duration = text;
                            break;
                        }
                    }
                }

                // 发布日期
                const dateSelectors = ['.date', '.publish-date', '.upload-date', '[class*="date"]', 'time'];
                for (const selector of dateSelectors) {
                    const el = document.querySelector(selector);
                    if (el) {
                        const text = el.textContent.trim();
                        if (text.match(/\d{4}/) || text.includes('年') || text.includes('-')) {
                            publishDate = text;
                            break;
                        }
                    }
                }

                // 标签
                const tagSelectors = ['.tag', '.tags', '.category', '.genre', '[class*="tag"]', '[class*="category"]'];
                tagSelectors.forEach(selector => {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        const text = el.textContent.trim();
                        if (text && text.length < 20 && !tags.includes(text)) {
                            tags.push(text);
                        }
                    });
                });

                return {
                    title: title.substring(0, 200),
                    description: description.substring(0, 1000),
                    rating,
                    views,
                    duration,
                    publishDate,
                    tags: tags.slice(0, 10)
                };
            });

            // 尝试点击播放按钮触发视频加载
            try {
                const playButton = await page.$('.play-btn, .video-play, [class*="play"], .dplayer-play-icon');
                if (playButton) {
                    await playButton.click();
                    await this.delay(3000);
                }
            } catch (e) {
                // 忽略播放按钮点击失败
            }

            // 额外等待，确保捕获到 m3u8
            await this.delay(5000);

            // 合并信息
            const result = {
                ...videoInfo,
                ...detailedInfo,
                m3u8Urls: [...new Set(m3u8Urls)], // 去重
                crawledAt: new Date().toISOString(),
                success: m3u8Urls.length > 0
            };

            if (m3u8Urls.length > 0) {
                console.log(`✅ 成功获取视频信息: ${result.title}`);
            } else {
                console.log(`⚠️  未找到播放地址: ${result.title}`);
            }

            return result;

        } catch (error) {
            console.error(`❌ 获取视频详情失败 ${videoInfo.url}:`, error.message);

            // 重试机制
            if (retryCount < this.maxRetries) {
                console.log(`🔄 重试 ${retryCount + 1}/${this.maxRetries}: ${videoInfo.url}`);
                await this.delay(5000);
                return this.getVideoDetails(videoInfo, retryCount + 1);
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
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            const hasNext = await page.evaluate(() => {
                // 检查是否有下一页的指示器
                const nextSelectors = [
                    'a[href*="page="]:last-child',
                    '.next',
                    '.pagination a:last-child',
                    'a:contains("下一页")',
                    'a:contains(">")'
                ];

                for (const selector of nextSelectors) {
                    const el = document.querySelector(selector);
                    if (el && !el.classList.contains('disabled')) {
                        return true;
                    }
                }

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

            console.log(`🕷️  开始爬取，起始页面: ${startPage}, 最大页面数: ${maxPages}`);

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

                // 逐个获取视频详情
                for (let i = 0; i < videoLinks.length; i++) {
                    const videoInfo = videoLinks[i];
                    console.log(`\n[${currentPage}-${i+1}/${videoLinks.length}] 处理视频...`);

                    const detailedInfo = await this.getVideoDetails(videoInfo);
                    this.results.push(detailedInfo);
                    totalVideos++;

                    // 添加延迟，避免请求过于频繁
                    await this.delay(this.delayMs);

                    // 每处理10个视频保存一次（防止数据丢失）
                    if (totalVideos % 10 === 0) {
                        await this.saveResults(`videos_temp_${Date.now()}.json`);
                    }
                }

                console.log(`✅ 第 ${currentPage} 页完成，共处理 ${videoLinks.length} 个视频`);
                currentPage++;

                // 页面间延迟
                await this.delay(3000);
            }

            console.log(`\n🎉 爬取完成！总共获取 ${totalVideos} 个视频信息`);

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
        const fileName = filename || `videos_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
        const filePath = path.join(__dirname, fileName);

        const data = {
            crawlInfo: {
                totalVideos: this.results.length,
                successCount: this.results.filter(v => v.success).length,
                failureCount: this.results.filter(v => !v.success).length,
                crawledAt: new Date().toISOString(),
                baseUrl: this.baseUrl
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
        const withM3u8 = this.results.filter(v => v.m3u8Urls && v.m3u8Urls.length > 0).length;

        const report = `
📊 爬取统计报告
================================
总视频数量: ${total}
成功获取: ${successful} (${((successful/total)*100).toFixed(1)}%)
获取失败: ${failed} (${((failed/total)*100).toFixed(1)}%)
有播放地址: ${withM3u8} (${((withM3u8/total)*100).toFixed(1)}%)

📁 文件保存位置: ${__dirname}
🕐 完成时间: ${new Date().toLocaleString()}
================================
        `;

        console.log(report);

        // 保存报告到文件
        const reportFile = `crawler_report_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
        fs.writeFileSync(path.join(__dirname, reportFile), report, 'utf8');
    }
}

// 主程序入口
async function main() {
    const args = process.argv.slice(2);
    const startPage = parseInt(args[0]) || 1;
    const maxPages = parseInt(args[1]) || 50;

    console.log(`
🕷️  视频爬虫程序启动
================================
起始页面: ${startPage}
最大页面数: ${maxPages}
目标网站: https://www.yfsp.tv/list
================================
    `);

    const crawler = new VideoListCrawler();
    await crawler.crawl(startPage, maxPages);
}

// 如果直接运行此脚本
if (require.main === module) {
    main().catch(console.error);
}

module.exports = VideoListCrawler;