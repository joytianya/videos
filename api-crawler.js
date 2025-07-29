const axios = require('axios');
const fs = require('fs');
const path = require('path');

class ApiVideoCrawler {
    constructor() {
        this.baseApiUrl = 'https://m10.yfsp.tv/api/list/Search';
        this.outputDir = 'api_data';
        this.results = [];
        this.totalPages = 0;
        this.totalVideos = 0;

        // 简化的API参数
        this.apiParams = {
            cinema: 1,
            page: 1,
            size: 36
        };
    }

    async init() {
        console.log('🚀 启动API爬虫程序...');

        // 创建输出目录
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
            console.log(`📁 创建目录: ${this.outputDir}`);
        } else {
            console.log(`📁 使用现有目录: ${this.outputDir}`);
        }
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 获取单个页面的数据
    async fetchPageData(page) {
        try {
            console.log(`📡 正在获取第 ${page} 页数据...`);

            const params = {
                ...this.apiParams,
                page: page
            };

            console.log(`🔍 请求参数:`, params);
            console.log(`🌐 请求URL: ${this.baseApiUrl}`);

            const response = await axios.get(this.baseApiUrl, {
                params: params,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': 'https://www.yfsp.tv/',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Origin': 'https://www.yfsp.tv'
                },
                timeout: 30000
            });

            console.log(`📊 响应状态: ${response.status}`);
            console.log(`📊 响应数据类型: ${typeof response.data}`);

            // 保存原始响应用于调试
            const debugFile = path.join(this.outputDir, `debug_page_${page}_response.json`);
            fs.writeFileSync(debugFile, JSON.stringify(response.data, null, 2), 'utf8');
            console.log(`🐛 调试文件已保存: debug_page_${page}_response.json`);

            if (response.status === 200 && response.data) {
                const data = response.data;
                console.log(`📊 响应结构:`, Object.keys(data));

                if (data.ret === 200 && data.data) {
                    console.log(`📊 data结构:`, Object.keys(data.data));

                    if (data.data.info && Array.isArray(data.data.info) && data.data.info.length > 0) {
                        const pageInfo = data.data.info[0];
                        console.log(`📊 pageInfo结构:`, Object.keys(pageInfo));

                        const videos = pageInfo.result || [];
                        const maxPage = pageInfo.maxpage || 0;
                        const recordCount = pageInfo.recordcount || 0;

                        console.log(`✅ 第 ${page} 页成功获取 ${videos.length} 个视频`);
                        console.log(`📊 总页数: ${maxPage}, 总记录数: ${recordCount}`);

                        // 处理视频数据，构建完整的播放链接
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
                            dd: video.dd || 0, // 点赞
                            dc: video.dc || 0, // 点踩

                            // 详细信息
                            directed: video.directed || '未知',
                            starring: video.starring || '未知',
                            contxt: video.contxt || '', // 简介
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
                        console.log(`⚠️  第 ${page} 页 data.info 结构异常:`, data.data.info);
                        return {
                            success: false,
                            page: page,
                            videos: [],
                            error: 'data.info 结构异常'
                        };
                    }
                } else {
                    console.log(`⚠️  第 ${page} 页响应格式异常，ret: ${data.ret}`);
                    return {
                        success: false,
                        page: page,
                        videos: [],
                        error: `响应格式异常，ret: ${data.ret}`
                    };
                }
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

        } catch (error) {
            console.error(`❌ 获取第 ${page} 页失败:`, error.message);
            if (error.response) {
                console.error(`❌ 响应状态: ${error.response.status}`);
                console.error(`❌ 响应数据:`, error.response.data);
            }
            return {
                success: false,
                page: page,
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
🕷️  API爬虫程序启动
================================
起始页面: ${startPage}
最大页面数: ${maxPages}
API地址: ${this.baseApiUrl}
输出目录: ${this.outputDir}
================================
            `);

            let currentPage = startPage;
            let actualMaxPages = maxPages;
            let totalVideosCount = 0;
            let successfulPages = 0;
            let failedPages = 0;

            while (currentPage <= actualMaxPages) {
                console.log(`\n📑 正在处理第 ${currentPage} 页...`);

                // 获取页面数据
                const pageData = await this.fetchPageData(currentPage);

                // 更新实际最大页数（从第一页响应中获取）
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

                    // 如果当前页没有视频，可能已经到达末尾
                    if (pageData.videos.length === 0) {
                        console.log(`📄 第 ${currentPage} 页无视频数据，可能已到达末尾`);
                        break;
                    }
                } else {
                    failedPages++;

                    // 连续失败多页则停止
                    if (failedPages >= 3) {
                        console.log(`❌ 连续失败页面过多，停止爬取`);
                        break;
                    }
                }

                currentPage++;

                // 添加延迟，避免请求过于频繁
                await this.delay(2000);
            }

            console.log(`\n🎉 API爬取完成！`);
            console.log(`📊 统计信息:`);
            console.log(`   - 成功页面: ${successfulPages}`);
            console.log(`   - 失败页面: ${failedPages}`);
            console.log(`   - 总视频数: ${totalVideosCount}`);

            // 生成汇总文件
            await this.generateSummary(successfulPages, failedPages, totalVideosCount);

        } catch (error) {
            console.error('❌ 爬取过程发生错误:', error);
        }
    }

    // 生成汇总文件和统计报告
    async generateSummary(successfulPages, failedPages, totalVideosCount) {
            // 生成汇总JSON文件
            const summaryData = {
                crawlInfo: {
                    totalPages: successfulPages + failedPages,
                    successfulPages: successfulPages,
                    failedPages: failedPages,
                    totalVideos: totalVideosCount,
                    crawledAt: new Date().toISOString(),
                    apiUrl: this.baseApiUrl,
                    outputDir: this.outputDir,
                    type: 'api-crawler'
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
                // 统计分类
                if (video.categories && video.categories.length > 0) {
                    video.categories.forEach(cat => {
                        categories[cat] = (categories[cat] || 0) + 1;
                    });
                }

                // 统计语言
                if (video.lang) {
                    languages[video.lang] = (languages[video.lang] || 0) + 1;
                }

                // 统计年份
                if (video.year) {
                    years[video.year] = (years[video.year] || 0) + 1;
                }
            });

            const report = `
📊 API视频爬取统计报告
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
        
        // 保存报告到文件
        const reportFile = path.join(this.outputDir, `api_crawler_report_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`);
        fs.writeFileSync(reportFile, report, 'utf8');
        console.log(`📄 统计报告已保存: ${path.basename(reportFile)}`);
    }
}

// 主程序入口
async function main() {
    const args = process.argv.slice(2);
    const startPage = parseInt(args[0]) || 1;
    const maxPages = parseInt(args[1]) || 50;
    
    console.log(`
🕷️  API视频爬虫程序
================================
起始页面: ${startPage}
最大页面数: ${maxPages}
数据来源: yfsp.tv API
输出格式: 分页JSON文件
================================
    `);
    
    const crawler = new ApiVideoCrawler();
    await crawler.crawl(startPage, maxPages);
}

// 如果直接运行此脚本
if (require.main === module) {
    main().catch(console.error);
}

module.exports = ApiVideoCrawler;