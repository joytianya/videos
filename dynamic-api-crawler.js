const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class DynamicApiCrawler {
    constructor() {
        this.baseUrl = 'https://www.yfsp.tv/list';
        this.outputDir = 'dynamic_api_data';
        this.browser = null;
        this.results = [];
        this.apiParams = {};
    }

    async init() {
        console.log('🚀 启动动态API爬虫程序...');

        // 创建输出目录
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
            console.log(`📁 创建目录: ${this.outputDir}`);
        } else {
            console.log(`📁 使用现有目录: ${this.outputDir}`);
        }

        // 启动浏览器
        this.browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 获取页面的API参数
    async getApiParams(page) {
        const pageUrl = page === 1 ? this.baseUrl : `${this.baseUrl}?page=${page}`;
        const browserPage = await this.browser.newPage();

        try {
            console.log(`🌐 正在访问页面获取API参数: ${pageUrl}`);

            // 监听网络请求，捕获API调用
            const apiRequests = [];

            await browserPage.setRequestInterception(true);
            browserPage.on('request', (request) => {
                // 放行所有请求
                request.continue();
            });

            browserPage.on('response', async(response) => {
                const url = response.url();
                if (url.includes('m10.yfsp.tv/api/list/Search')) {
                    console.log(`🎯 捕获到API请求: ${url}`);
                    apiRequests.push(url);
                }
            });

            // 访问页面
            await browserPage.goto(pageUrl, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // 等待页面完全加载
            await this.delay(3000);

            if (apiRequests.length > 0) {
                const apiUrl = apiRequests[0];
                console.log(`✅ 成功获取API URL: ${apiUrl}`);

                // 解析API参数
                const urlObj = new URL(apiUrl);
                const params = {};
                urlObj.searchParams.forEach((value, key) => {
                    params[key] = value;
                });

                return {
                    success: true,
                    apiUrl: `${urlObj.origin}${urlObj.pathname}`,
                    params: params
                };
            } else {
                console.log(`⚠️  未能捕获到API请求`);
                return {
                    success: false,
                    error: '未能捕获到API请求'
                };
            }

        } catch (error) {
            console.error(`❌ 获取API参数失败:`, error.message);
            return {
                success: false,
                error: error.message
            };
        } finally {
            await browserPage.close();
        }
    }

    // 使用获取到的参数调用API
    async fetchApiData(apiUrl, params, targetPage) {
        try {
            console.log(`📡 正在调用API获取第 ${targetPage} 页数据...`);

            // 更新页面参数
            const requestParams = {
                ...params,
                page: targetPage
            };

            console.log(`🔍 API请求参数:`, requestParams);

            const response = await axios.get(apiUrl, {
                params: requestParams,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': 'https://www.yfsp.tv/',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Origin': 'https://www.yfsp.tv'
                },
                timeout: 30000
            });

            console.log(`📊 API响应状态: ${response.status}`);

            // 保存原始响应用于调试
            const debugFile = path.join(this.outputDir, `debug_page_${targetPage}_response.json`);
            fs.writeFileSync(debugFile, JSON.stringify(response.data, null, 2), 'utf8');
            console.log(`🐛 调试文件已保存: debug_page_${targetPage}_response.json`);

            if (response.status === 200 && response.data) {
                const data = response.data;

                if (data.ret === 200 && data.data && data.data.info && Array.isArray(data.data.info) && data.data.info.length > 0) {
                    const pageInfo = data.data.info[0];
                    const videos = pageInfo.result || [];
                    const maxPage = pageInfo.maxpage || 0;
                    const recordCount = pageInfo.recordcount || 0;

                    console.log(`✅ 第 ${targetPage} 页成功获取 ${videos.length} 个视频`);
                    console.log(`📊 总页数: ${maxPage}, 总记录数: ${recordCount}`);

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
                        apiPage: targetPage
                    }));

                    return {
                        success: true,
                        page: targetPage,
                        videos: processedVideos,
                        maxPage: maxPage,
                        recordCount: recordCount,
                        totalVideosOnPage: videos.length
                    };
                } else {
                    console.log(`⚠️  第 ${targetPage} 页API响应数据格式异常`);
                    return {
                        success: false,
                        page: targetPage,
                        videos: [],
                        error: 'API响应数据格式异常'
                    };
                }
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

        } catch (error) {
            console.error(`❌ API请求失败:`, error.message);
            return {
                success: false,
                page: targetPage,
                videos: [],
                error: error.message
            };
        }
    }

    // 保存单页数据到JSON文件
    async savePageData(pageData) {
        const fileName = `page_${pageData.page.toString().padStart(3, '0')}.json`;
        const filePath = path.join(this.outputDir, fileName);

        const dataToSave = {
            pageInfo: {
                page: pageData.page,
                success: pageData.success,
                totalVideos: pageData.videos.length,
                maxPage: pageData.maxPage || 0,
                recordCount: pageData.recordCount || 0,
                crawledAt: new Date().toISOString(),
                error: pageData.error || null
            },
            videos: pageData.videos
        };

        fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2), 'utf8');
        console.log(`💾 第 ${pageData.page} 页数据已保存到: ${fileName}`);
    }

    // 主爬取函数
    async crawl(startPage = 1, maxPages = 50) {
        try {
            await this.init();

            console.log(`
🕷️  动态API爬虫程序启动
================================
起始页面: ${startPage}
最大页面数: ${maxPages}
基础URL: ${this.baseUrl}
输出目录: ${this.outputDir}
================================
            `);

            let currentPage = startPage;
            let actualMaxPages = maxPages;
            let totalVideosCount = 0;
            let successfulPages = 0;
            let failedPages = 0;
            let apiUrl = '';
            let baseParams = {};

            while (currentPage <= actualMaxPages) {
                console.log(`\n📑 正在处理第 ${currentPage} 页...`);

                // 每页都重新获取API参数（防止参数过期）
                console.log(`🔄 获取第 ${currentPage} 页的API参数...`);
                const apiParamsResult = await this.getApiParams(currentPage);

                if (apiParamsResult.success) {
                    apiUrl = apiParamsResult.apiUrl;
                    baseParams = apiParamsResult.params;
                    console.log(`✅ API参数获取成功`);
                } else {
                    console.log(`❌ API参数获取失败: ${apiParamsResult.error}`);
                    failedPages++;
                    currentPage++;
                    continue;
                }

                // 使用API参数获取数据
                const pageData = await this.fetchApiData(apiUrl, baseParams, currentPage);

                // 更新实际最大页数
                if (currentPage === startPage && pageData.success && pageData.maxPage) {
                    actualMaxPages = Math.min(pageData.maxPage, maxPages);
                    console.log(`📊 实际最大页数: ${actualMaxPages}`);
                }

                // 保存页面数据
                await this.savePageData(pageData);

                if (pageData.success) {
                    successfulPages++;
                    totalVideosCount += pageData.videos.length;
                    this.results.push(...pageData.videos);

                    if (pageData.videos.length === 0) {
                        console.log(`📄 第 ${currentPage} 页无视频数据，可能已到达末尾`);
                        break;
                    }
                } else {
                    failedPages++;

                    if (failedPages >= 5) {
                        console.log(`❌ 连续失败页面过多，停止爬取`);
                        break;
                    }
                }

                currentPage++;

                // 添加延迟
                await this.delay(3000); // 增加延迟时间
            }

            console.log(`\n🎉 动态API爬取完成！`);
            console.log(`📊 统计信息:`);
            console.log(`   - 成功页面: ${successfulPages}`);
            console.log(`   - 失败页面: ${failedPages}`);
            console.log(`   - 总视频数: ${totalVideosCount}`);

            // 生成汇总文件
            await this.generateSummary(successfulPages, failedPages, totalVideosCount);

        } catch (error) {
            console.error('❌ 爬取过程发生错误:', error);
        } finally {
            if (this.browser) {
                await this.browser.close();
            }
        }
    }

    // 生成汇总文件和统计报告
    async generateSummary(successfulPages, failedPages, totalVideosCount) {
            const summaryData = {
                crawlInfo: {
                    totalPages: successfulPages + failedPages,
                    successfulPages: successfulPages,
                    failedPages: failedPages,
                    totalVideos: totalVideosCount,
                    crawledAt: new Date().toISOString(),
                    baseUrl: this.baseUrl,
                    outputDir: this.outputDir,
                    type: 'dynamic-api-crawler'
                },
                allVideos: this.results
            };

            const summaryFile = path.join(this.outputDir, 'summary_all_videos.json');
            fs.writeFileSync(summaryFile, JSON.stringify(summaryData, null, 2), 'utf8');
            console.log(`💾 汇总文件已保存: summary_all_videos.json`);

            // 生成统计报告
            const categories = {};
            const languages = {};
            const years = {};

            this.results.forEach(video => {
                if (video.categories && video.categories.length > 0) {
                    video.categories.forEach(cat => {
                        categories[cat] = (categories[cat] || 0) + 1;
                    });
                }

                if (video.lang) {
                    languages[video.lang] = (languages[video.lang] || 0) + 1;
                }

                if (video.year) {
                    years[video.year] = (years[video.year] || 0) + 1;
                }
            });

            const report = `
📊 动态API视频爬取统计报告
================================
总页面数: ${successfulPages + failedPages}
成功页面: ${successfulPages}
失败页面: ${failedPages}
总视频数: ${totalVideosCount}

🎬 分类统计 (前10):
${Object.entries(categories)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([cat, count]) => `   ${cat}: ${count}`)
    .join('\n')}

🌍 语言统计:
${Object.entries(languages)
    .sort(([,a], [,b]) => b - a)
    .map(([lang, count]) => `   ${lang}: ${count}`)
    .join('\n')}

📅 年份统计 (前10):
${Object.entries(years)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([year, count]) => `   ${year}: ${count}`)
    .join('\n')}

📁 文件保存位置: ${path.resolve(this.outputDir)}
🕐 完成时间: ${new Date().toLocaleString()}
================================
        `;
        
        console.log(report);
        
        const reportFile = path.join(this.outputDir, `dynamic_api_crawler_report_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`);
        fs.writeFileSync(reportFile, report, 'utf8');
        console.log(`📄 统计报告已保存: ${path.basename(reportFile)}`);
    }

    // 清理资源
    async cleanup() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            console.log('🧹 浏览器资源已清理');
        }
    }
}

// 主程序入口
async function main() {
    const args = process.argv.slice(2);
    const startPage = parseInt(args[0]) || 1;
    const maxPages = parseInt(args[1]) || 50;
    
    console.log(`
🕷️  动态API视频爬虫程序
================================
起始页面: ${startPage}
最大页面数: ${maxPages}
数据来源: yfsp.tv 动态API
输出格式: 分页JSON文件
================================
    `);
    
    const crawler = new DynamicApiCrawler();
    await crawler.crawl(startPage, maxPages);
}

// 如果直接运行此脚本
if (require.main === module) {
    main().catch(console.error);
}

module.exports = DynamicApiCrawler;