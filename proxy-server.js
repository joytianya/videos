const express = require('express');
const axios = require('axios');
const url = require('url');
const fs = require('fs');
const puppeteer = require('puppeteer');
const VideoSearchIndex = require('./search-index');
const PlaySessionManager = require('./play-session');

const app = express();
const port = 3000;

// 初始化搜索索引和播放会话管理器
let searchIndex = null;
const playSessionManager = new PlaySessionManager();

// 中间件
app.use(express.json());
app.use(express.static('.')); // 提供静态文件服务

// 初始化搜索索引
async function initSearchIndex() {
    try {
        searchIndex = new VideoSearchIndex();

        // 尝试加载现有索引
        if (!searchIndex.loadIndex()) {
            console.log('🔄 搜索索引不存在，开始构建...');
            await searchIndex.buildFullIndex();
        } else {
            console.log('✅ 搜索索引加载成功');
        }
    } catch (error) {
        console.error('❌ 初始化搜索索引失败:', error);
    }
}

// 创建播放会话API
app.post('/create-play-session', (req, res) => {
    const { playUrl, title, videoId } = req.body;

    if (!playUrl) {
        return res.status(400).json({
            success: false,
            error: '缺少播放地址参数'
        });
    }

    try {
        const playId = playSessionManager.createPlaySession(
            playUrl,
            title || '未知视频',
            videoId
        );

        res.json({
            success: true,
            playId: playId,
            playerUrl: `/player?id=${playId}`
        });
    } catch (error) {
        console.error('创建播放会话失败:', error);
        res.status(500).json({
            success: false,
            error: '创建播放会话失败'
        });
    }
});

// 获取播放会话信息API
app.get('/play-session/:playId', (req, res) => {
    const { playId } = req.params;

    const session = playSessionManager.getPlaySession(playId);

    if (!session) {
        return res.status(404).json({
            success: false,
            error: '播放会话不存在或已过期'
        });
    }

    res.json({
        success: true,
        session: {
            playId: session.playId,
            title: session.title,
            videoId: session.videoId,
            createdAt: session.createdAt,
            accessCount: session.accessCount
        }
    });
});

// 播放器页面路由（支持ID参数）
app.get('/player', (req, res) => {
    const playId = req.query.id;

    if (!playId) {
        // 如果没有ID参数，检查是否有旧的URL和title参数（向后兼容）
        const playUrl = req.query.url;
        const title = req.query.title;

        if (playUrl) {
            // 创建临时会话并重定向
            const tempPlayId = playSessionManager.createPlaySession(
                decodeURIComponent(playUrl),
                title ? decodeURIComponent(title) : '未知视频'
            );
            return res.redirect(`/player?id=${tempPlayId}`);
        }

        return res.status(400).send('缺少播放ID参数');
    }

    // 验证播放会话
    const session = playSessionManager.getPlaySession(playId);
    if (!session) {
        return res.status(404).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>播放会话不存在</title>
                <meta charset="UTF-8">
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    .error { color: #e74c3c; font-size: 1.2em; margin: 20px 0; }
                    .back-btn { 
                        background: #3498db; color: white; padding: 10px 20px; 
                        text-decoration: none; border-radius: 5px; 
                    }
                </style>
            </head>
            <body>
                <h1>😞 播放会话不存在</h1>
                <div class="error">播放会话不存在或已过期，请重新搜索视频</div>
                <a href="/search.html" class="back-btn">返回搜索</a>
            </body>
            </html>
        `);
    }

    // 读取播放器HTML文件并注入播放信息
    try {
        let playerHtml = fs.readFileSync('player.html', 'utf8');

        // 在HTML中注入播放会话信息
        const sessionScript = `
            <script>
                window.PLAY_SESSION = {
                    playId: '${session.playId}',
                    title: '${session.title.replace(/'/g, "\\'")}',
                    playUrl: '${session.playUrl}',
                    videoId: '${session.videoId || ''}'
                };
            </script>
        `;

        // 在</head>标签前插入会话信息
        playerHtml = playerHtml.replace('</head>', sessionScript + '</head>');

        res.send(playerHtml);
    } catch (error) {
        console.error('读取播放器文件失败:', error);
        res.status(500).send('播放器加载失败');
    }
});

// 搜索API
app.get('/search', (req, res) => {
    if (!searchIndex) {
        return res.status(500).json({
            success: false,
            error: '搜索索引未初始化'
        });
    }

    const query = req.query.q;
    const limit = parseInt(req.query.limit) || 3;

    if (!query || query.trim().length === 0) {
        return res.json({
            success: true,
            results: []
        });
    }

    try {
        const results = searchIndex.search(query, limit);
        res.json({
            success: true,
            query: query,
            results: results,
            total: results.length
        });
    } catch (error) {
        console.error('搜索失败:', error);
        res.status(500).json({
            success: false,
            error: '搜索失败'
        });
    }
});

// 获取搜索统计信息
app.get('/search-stats', (req, res) => {
    if (!searchIndex) {
        return res.status(500).json({
            success: false,
            error: '搜索索引未初始化'
        });
    }

    try {
        const searchStats = {
            totalVideos: searchIndex.videos.length,
            totalKeywords: Object.keys(searchIndex.searchIndex).length
        };

        const playStats = playSessionManager.getSessionStats();

        res.json({
            success: true,
            ...searchStats,
            ...playStats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: '获取统计信息失败'
        });
    }
});

// 根据ID获取视频详情
app.get('/video/:id', (req, res) => {
    if (!searchIndex) {
        return res.status(500).json({
            success: false,
            error: '搜索索引未初始化'
        });
    }

    try {
        const video = searchIndex.getVideoById(req.params.id);
        if (video) {
            res.json(video);
        } else {
            res.status(404).json({
                success: false,
                error: '视频不存在'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: '获取视频详情失败'
        });
    }
});

// 代理路由
app.get('/proxy', async(req, res) => {
    const videoUrl = req.query.url;

    if (!videoUrl) {
        return res.status(400).send('缺少 URL 参数');
    }

    try {
        console.log(`代理请求: ${videoUrl}`);

        const response = await axios({
            method: 'GET',
            url: videoUrl,
            headers: {
                'Referer': 'https://www.yfsp.tv/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Origin': 'https://www.yfsp.tv'
            },
            responseType: 'stream',
            timeout: 30000
        });

        // 检查是否是 M3U8 文件
        if (videoUrl.includes('.m3u8')) {
            console.log('处理 M3U8 文件');

            // 设置 M3U8 响应头
            res.set({
                'Content-Type': 'application/vnd.apple.mpegurl',
                'Cache-Control': 'no-cache',
                'X-Content-Type-Options': 'nosniff',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Range'
            });

            // 收集响应数据
            let manifest = '';
            response.data.on('data', chunk => {
                manifest += chunk.toString();
            });

            response.data.on('end', () => {
                try {
                    // 解析 M3U8 内容并重写 URL
                    const baseUrl = videoUrl.substring(0, videoUrl.lastIndexOf('/') + 1);
                    const lines = manifest.split('\n');
                    const processedLines = [];

                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i].trim();

                        if (line.startsWith('#EXTINF:')) {
                            processedLines.push(line);

                            if (i + 1 < lines.length) {
                                const nextLine = lines[i + 1].trim();
                                if (nextLine && !nextLine.startsWith('#')) {
                                    const absoluteUrl = new url.URL(nextLine, baseUrl).href;
                                    const proxiedUrl = `http://localhost:${port}/proxy?url=${encodeURIComponent(absoluteUrl)}`;
                                    processedLines.push(proxiedUrl);
                                    i++;
                                    continue;
                                }
                            }
                        } else if (!line.startsWith('#') && line.length > 0) {
                            const absoluteUrl = new url.URL(line, baseUrl).href;
                            const proxiedUrl = `http://localhost:${port}/proxy?url=${encodeURIComponent(absoluteUrl)}`;
                            processedLines.push(proxiedUrl);
                        } else {
                            processedLines.push(line);
                        }
                    }

                    const modifiedManifest = processedLines.join('\n');
                    res.send(modifiedManifest);
                } catch (error) {
                    console.error('处理 M3U8 文件时出错:', error);
                    res.status(500).send('处理 M3U8 文件时出错');
                }
            });

        } else {
            // 处理 TS 文件或其他文件
            res.set({
                'Content-Type': response.headers['content-type'] || 'video/mp2t',
                'Content-Length': response.headers['content-length'],
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Range'
            });

            response.data.pipe(res);
        }

    } catch (error) {
        console.error('代理请求失败:', error.message);
        res.status(500).send('代理请求失败: ' + error.message);
    }
});

// 提取视频URL的API端点
app.post('/extract-url', async(req, res) => {
    const { pageUrl, playId } = req.body;

    // 如果提供了playId，从会话中获取pageUrl
    let actualPageUrl = pageUrl;
    if (playId) {
        const session = playSessionManager.getPlaySession(playId);
        if (session) {
            actualPageUrl = session.playUrl;
        } else {
            return res.status(404).json({
                success: false,
                error: '播放会话不存在或已过期'
            });
        }
    }

    if (!actualPageUrl) {
        return res.status(400).json({
            success: false,
            error: '缺少页面URL参数'
        });
    }

    let browser = null;

    try {
        console.log(`正在提取视频URL: ${actualPageUrl}`);

        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();

        // 监听网络请求
        let m3u8Url = null;

        await page.setRequestInterception(true);
        page.on('request', (request) => {
            request.continue();
        });

        page.on('response', async(response) => {
            const url = response.url();
            if (url.includes('.m3u8')) {
                console.log(`发现 M3U8 URL: ${url}`);
                m3u8Url = url;
            }
        });

        // 访问页面
        await page.goto(actualPageUrl, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // 等待视频加载
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 提取页面元信息
        const metaInfo = await page.evaluate(() => {
            // 提取标题
            let title = document.title || '';
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

            // 提取其他元信息
            let description = '';
            const descSelectors = [
                '.description', '.desc', '.summary', '.intro', '.content',
                '[class*="desc"]', '[class*="intro"]', '[class*="summary"]'
            ];
            for (const selector of descSelectors) {
                const el = document.querySelector(selector);
                if (el && el.textContent.trim().length > 20) {
                    description = el.textContent.trim();
                    break;
                }
            }

            return {
                title: title.substring(0, 200),
                description: description.substring(0, 500),
                rating: '暂无评分',
                views: '未知',
                duration: '未知',
                publishDate: '未知',
                tags: []
            };
        });

        if (m3u8Url) {
            res.json({
                success: true,
                m3u8Url: m3u8Url,
                metaInfo: metaInfo
            });
        } else {
            res.json({
                success: false,
                error: '未找到视频播放地址'
            });
        }

    } catch (error) {
        console.error('提取视频URL失败:', error);
        res.status(500).json({
            success: false,
            error: '提取视频URL失败: ' + error.message
        });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

// 启动服务器
app.listen(port, async() => {
    console.log(`🚀 代理服务器运行在 http://localhost:${port}`);
    console.log(`🔍 搜索页面: http://localhost:${port}/search.html`);
    console.log(`🎬 播放器页面: http://localhost:${port}/player?id=<playId>`);

    // 初始化搜索索引
    await initSearchIndex();

    // 启动播放会话清理定时器
    playSessionManager.startCleanupTimer();

    console.log('✅ 服务器启动完成！');
});