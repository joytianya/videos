const express = require('express');
const axios = require('axios');
const puppeteer = require('puppeteer');
const fs = require('fs');
const { URL } = require('url');
const VideoSearchIndex = require('./search-index');
const PlaySessionManager = require('./play-session');
const path = require('path');
const cheerio = require('cheerio');
const bodyParser = require('body-parser');

const app = express();
const port = 3000;
const searchIndex = new VideoSearchIndex(); // 直接初始化
const playSessionManager = new PlaySessionManager();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- API and Dynamic Routes (High Priority) ---

// Redirect root to live search page
app.get('/', (req, res) => {
    res.redirect('/live-search.html');
});

// Create Play Session API
app.post('/create-play-session', (req, res) => {
    console.log('接收到创建播放会话请求, 请求体:', req.body);
    const { originalUrl, title, playUrl } = req.body; // 支持两种字段名

    // 向后兼容：如果没有originalUrl但有playUrl，使用playUrl
    const actualUrl = originalUrl || playUrl;

    if (!actualUrl || !title) {
        console.error('创建会话失败：originalUrl/playUrl 或 title 缺失');
        return res.status(400).json({ success: false, error: '请求缺少 URL 或 title' });
    }

    const playId = playSessionManager.createPlaySession({ originalUrl: actualUrl, title });
    const playerUrl = `/player?id=${playId}`;

    res.json({ success: true, playId, playerUrl });
});

// Dynamic Player Page Route
app.get('/player', (req, res) => {
    const playId = req.query.id;
    if (!playId) {
        return res.status(400).send('缺少播放ID');
    }

    const session = playSessionManager.getPlaySession(playId);
    if (!session) {
        // Render a user-friendly error page if session is not found
        fs.readFile(path.join(__dirname, '404.html'), 'utf8', (err, html) => {
            if (err) {
                return res.status(404).send('播放会话不存在或已过期');
            }
            res.status(404).send(html);
        });
        return;
    }

    // Read player.html template file
    fs.readFile(path.join(__dirname, 'player.html'), 'utf8', (err, html) => {
        if (err) {
            return res.status(500).send('无法加载播放器页面');
        }

        // Dynamically inject play session info
        const injectedHtml = html.replace(
            '</head>',
            `    <script>
        window.PLAY_SESSION = ${JSON.stringify(session)};
    </script>
</head>`
        );
        res.send(injectedHtml);
    });
});

// Get Episodes API
app.post('/get-episodes', async(req, res) => {
    const { seriesId } = req.body;
    console.log(`🚀 API 请求为 ${seriesId} 获取剧集列表...`);
    const result = await getEpisodes(seriesId);
    console.log(result.success ? `✅ API 成功获取 ${result.episodes.length} 集` : `⚠️ API 未找到剧集列表`);
    res.json(result);
});

// Live Search API
app.post('/live-search', async(req, res) => {
    const { query = '', category = 'all', page = 1 } = req.body || {};

    if (!query.trim()) {
        return res.json({ success: false, error: '缺少搜索关键词' });
    }

    const size = 36;
    const baseUrl = 'https://rankv21.yfsp.tv/v3/list/briefsearch';

    // 构建查询参数
    const params = {
        tags: query,
        orderby: 4,
        page: page,
        size: size,
        desc: 1,
        isserial: -1,
    };

    switch (category) {
        case 'movie':
            params.cinema = 1; // 电影
            break;
        case 'tv':
            params.cinema = 3; // 电视剧 / 新闻
            params.cid = '0,3';
            break;
        case 'variety':
            params.cinema = 2; // 综艺（猜测）
            break;
        default:
            // all 保持默认
            break;
    }

    try {
        const response = await axios.get(baseUrl, {
            params: params,
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Referer': 'https://www.yfsp.tv/'
            }
        });

        const data = response.data;
        if (data.ret !== 200 || !data.data || !Array.isArray(data.data.info) || data.data.info.length === 0) {
            return res.json({ success: false, error: '搜索结果为空' });
        }

        const pageInfo = data.data.info[0];
        const recordCount = pageInfo.recordcount || 0;
        const results = pageInfo.result || [];
        const totalPages = Math.ceil(recordCount / size);

        // 规范化结果
        const processed = results.map(item => {
            const isMovie = item.atypeName === '电影' && item.languagesPlayList && item.languagesPlayList.playList;
            const seriesId = item.contxt || item.userKey || '';
            let episodeKey = '';

            if (isMovie && item.languagesPlayList.playList.length > 0) {
                episodeKey = item.languagesPlayList.playList[0].key;
            }

            // 修复: 对于电影也使用contxt而不是episodeKey，因为URL结构是 /play/{contxt}
            const playKey = seriesId; // 统一使用contxt/seriesId
            const playType = 'play'; // 统一使用play类型
            
            // 调试信息
            if (isMovie) {
                console.log(`🎬 电影映射: ${item.title} -> contxt:${seriesId}, episodeKey:${episodeKey}, 使用:${playKey}`);
            }

            let highResImgPath = item.imgPath || '';
            if (highResImgPath.endsWith('s.gif')) highResImgPath = highResImgPath.replace(/s\.gif$/, '.gif');
            else if (highResImgPath.endsWith('s.jpg')) highResImgPath = highResImgPath.replace(/s\.jpg$/, '.jpg');

            return {
                atypeName: item.atypeName || '',
                key: playKey,
                seriesId: seriesId,
                playType: playType,
                // episodes: episodes, // 移除自动加载
                title: item.title || '',
                imgPath: item.imgPath || '',
                highResImgPath: highResImgPath,
                score: item.score || '',
                starring: item.starring || '',
                directed: item.directed || '',
                hot: item.hot || 0,
                comments: item.comments || 0,
                year: item.year || '',
                regional: item.regional || '',
            };
        });

        res.json({
            success: true,
            results: processed,
            totalCount: recordCount,
            pagination: {
                currentPage: page,
                totalPages: totalPages
            }
        });
    } catch (error) {
        console.error('实时搜索失败:', error.message);
        res.json({ success: false, error: '实时搜索失败: ' + error.message });
    }
});

// M3U8 Playlist Proxy
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
                                    const absoluteUrl = new URL(nextLine, baseUrl).href;
                                    const proxiedUrl = `http://localhost:${port}/proxy?url=${encodeURIComponent(absoluteUrl)}`;
                                    processedLines.push(proxiedUrl);
                                    i++;
                                    continue;
                                }
                            }
                        } else if (!line.startsWith('#') && line.length > 0) {
                            const absoluteUrl = new URL(line, baseUrl).href;
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

// 提取视频URL的API端点
app.post('/extract-url', async(req, res) => {
    const { pageUrl, playId } = req.body;

    // 如果提供了playId，从会话中获取pageUrl
    let actualPageUrl = pageUrl;
    if (playId) {
        const session = playSessionManager.getPlaySession(playId);
        if (session) {
            actualPageUrl = session.originalUrl; // 修复：使用 originalUrl 而不是 playUrl
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

        // 设置用户代理
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        // 监听网络请求
        let m3u8Url = null;
        let requestCount = 0;

        await page.setRequestInterception(true);
        page.on('request', (request) => {
            requestCount++;
            const url = request.url();
            // 只记录视频相关的请求
            if (url.includes('.m3u8') || url.includes('.ts') || url.includes('chunklist') || url.includes('mp4')) {
                console.log(`🎬 视频请求 ${requestCount}: ${url}`);
            }
            request.continue();
        });

        page.on('response', async(response) => {
            const url = response.url();
            console.log(`响应: ${response.status()} ${url}`);

            // 检测关键的播放API响应
            if (url.includes('/v3/video/play') || url.includes('video/play')) {
                try {
                    console.log(`🎯 发现播放API响应: ${url}`);
                    const responseBody = await response.text();
                    console.log(`播放API响应内容: ${responseBody.substring(0, 500)}...`);
                    
                    // 尝试从API响应中提取M3U8 URL
                    const m3u8Matches = responseBody.match(/https?:\/\/[^"'\s]*\.m3u8[^"'\s]*/g);
                    const chunklistMatches = responseBody.match(/https?:\/\/[^"'\s]*chunklist[^"'\s]*/g);
                    
                    if (m3u8Matches && m3u8Matches.length > 0) {
                        m3u8Url = m3u8Matches[0];
                        console.log(`🎯 从API响应找到M3U8: ${m3u8Url}`);
                    } else if (chunklistMatches && chunklistMatches.length > 0) {
                        m3u8Url = chunklistMatches[0];
                        console.log(`🎯 从API响应找到chunklist: ${m3u8Url}`);
                    }
                } catch (e) {
                    console.error('解析播放API响应失败:', e.message);
                }
            }

            // 原有的M3U8检测逻辑
            if (url.includes('.m3u8') || 
                url.includes('chunklist') || 
                url.includes('playlist') ||
                url.includes('index.m3u8') ||
                (url.includes('mp4') && url.includes('chunklist'))) {
                console.log(`🎯 发现 M3U8 URL: ${url}`);
                m3u8Url = url;
            }
        });

        try {
            // 访问页面
            console.log('正在访问页面...');
            await page.goto(actualPageUrl, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });
            console.log('页面加载完成');

            // 扩展播放按钮选择器，增加更多可能的选择器
            console.log('尝试查找并点击播放按钮...');
            const playButtonSelectors = [
                '.play-btn', '.play-button', '[class*="play"]',
                '.video-play', '.start-play', 'button[class*="play"]',
                '.dplayer-play-icon', '.video_play', '.btn-play',
                'a[class*="play"]', 'i[class*="play"]', '.icon-play',
                '[data-action="play"]', '.control-play'
            ];

            for (const selector of playButtonSelectors) {
                try {
                    const button = await page.$(selector);
                    if (button) {
                        console.log(`找到播放按钮: ${selector}`);
                        await button.click();
                        console.log('已点击播放按钮');

                        // 点击后立即等待3秒检查是否有M3U8
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        if (m3u8Url) {
                            console.log('点击后立即找到M3U8，停止搜索');
                            break;
                        }
                    }
                } catch (e) {
                    // 忽略单个按钮的错误
                }
            }

            // 如果还没找到，尝试更激进的方法
            if (!m3u8Url) {
                console.log('尝试其他方法获取M3U8...');
                
                // 方法1: 尝试点击视频元素本身
                try {
                    const video = await page.$('video');
                    if (video) {
                        console.log('尝试点击video元素...');
                        await video.click();
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                } catch (e) {}
                
                // 方法2: 模拟按键操作
                try {
                    console.log('尝试按空格键播放...');
                    await page.keyboard.press('Space');
                    await new Promise(resolve => setTimeout(resolve, 3000));
                } catch (e) {}
                
                // 方法3: 检查页面中的M3U8信息
                try {
                    console.log('检查页面源码中的M3U8信息...');
                    const pageM3u8 = await page.evaluate(() => {
                        const pageText = document.documentElement.innerHTML;
                        const m3u8Matches = pageText.match(/https?:\/\/[^"'\s]*\.m3u8[^"'\s]*/g);
                        const chunklistMatches = pageText.match(/https?:\/\/[^"'\s]*chunklist[^"'\s]*/g);
                        return {
                            m3u8: m3u8Matches || [],
                            chunklist: chunklistMatches || [],
                            pageText: pageText.substring(0, 1000) // 获取前1000字符用于调试
                        };
                    });
                    
                    console.log('页面M3U8检查结果:', JSON.stringify(pageM3u8, null, 2));
                    
                    if (pageM3u8.m3u8.length > 0) {
                        m3u8Url = pageM3u8.m3u8[0];
                        console.log('从页面源码找到M3U8:', m3u8Url);
                    } else if (pageM3u8.chunklist.length > 0) {
                        m3u8Url = pageM3u8.chunklist[0];
                        console.log('从页面源码找到chunklist:', m3u8Url);
                    }
                } catch (e) {
                    console.error('检查页面M3U8信息失败:', e.message);
                }
                
                // 方法4: 执行JavaScript直接调用播放
                if (!m3u8Url) {
                    try {
                        await page.evaluate(() => {
                            const videos = document.querySelectorAll('video');
                            videos.forEach(v => {
                                try { v.play(); } catch(e) {}
                            });
                        });
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    } catch (e) {}
                }
                
                // 最后等待
                console.log('等待M3U8地址...');
                for (let i = 0; i < 8; i++) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    console.log(`等待中... ${(i + 1) * 2}秒`);

                    if (m3u8Url) {
                        console.log('在等待过程中找到了M3U8 URL');
                        break;
                    }
                }
            }

        } catch (error) {
            console.error('页面处理出错:', error.message);
        }

        if (m3u8Url) {
            console.log(`✅ 成功提取到M3U8地址: ${m3u8Url}`);
            res.json({
                success: true,
                m3u8Url: m3u8Url
            });
        } else {
            console.log('❌ 未找到M3U8地址');
            res.json({
                success: false,
                error: '未找到视频播放地址'
            });
        }

    } catch (error) {
        console.error('提取视频URL失败:', error);
        res.status(500).json({
            success: false,
            error: '提取视频地址失败: ' + error.message
        });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

// 将 getEpisodes 逻辑提取为独立函数，以便复用
async function getEpisodes(seriesId) {
    if (!seriesId) {
        return { success: false, error: '缺少电视剧ID' };
    }
    const searchUrl = `https://www.yfsp.tv/search/${encodeURIComponent(seriesId)}`;

    try {
        const { data } = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const $ = cheerio.load(data);
        const episodes = [];

        // 尝试从搜索结果页直接提取剧集信息
        $('.stui-content__playlist li a').each((i, elem) => {
            const title = $(elem).text().trim();
            const href = $(elem).attr('href');
            if (href && title) {
                const match = href.match(/play\/([^?]+)\?id=([^&]+)/);
                if (match && match[1] && match[2]) {
                    // Heuristic: if contxt matches seriesId, it's likely the correct series
                    if (match[1] === seriesId) {
                        episodes.push({
                            title: title,
                            key: match[2]
                        });
                    }
                }
            }
        });

        if (episodes.length > 0) {
            return { success: true, episodes: episodes };
        }

        // Fallback to Puppeteer if Cheerio fails
        console.log(`Cheerio未能提取到 ${seriesId} 的剧集, 正在尝试使用Puppeteer回退...`);
        return await getEpisodesWithPuppeteer(seriesId);

    } catch (error) {
        console.error(`使用Cheerio获取 ${seriesId} 剧集失败:`, error.message);
        console.log(`正在尝试使用Puppeteer回退...`);
        return await getEpisodesWithPuppeteer(seriesId);
    }
}


// 原有的Puppeteer逻辑封装成一个独立的fallback函数
async function getEpisodesWithPuppeteer(seriesId) {
    const seriesUrl = `https://www.yfsp.tv/play/${seriesId}`;
    let browser = null;
    try {
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        await page.goto(seriesUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        // 等待3秒，以确保JS完全加载
        await new Promise(resolve => setTimeout(resolve, 3000));

        const episodes = await page.evaluate(() => {
            const episodeList = [];
            // 扩展选择器列表以提高兼容性
            const selectors = [
                '.play-list a',
                '.episode-list a',
                '[class*="playlist"] a',
                '[class*="episode"] a',
                '.stui-content__playlist li a',
                'ul[class*="play"] li a'
            ];
            let episodeElements = null;
            for (const selector of selectors) {
                episodeElements = document.querySelectorAll(selector);
                if (episodeElements.length > 0) break;
            }
            episodeElements.forEach(el => {
                const href = el.getAttribute('href');
                const title = el.textContent.trim();
                if (href && title) {
                    const urlParams = new URLSearchParams(href.split('?')[1]);
                    const episodeId = urlParams.get('id');
                    if (episodeId) {
                        episodeList.push({ title: title, key: episodeId });
                    }
                }
            });
            return episodeList;
        });

        if (episodes.length === 0) {
            // 如果未找到剧集，保存截图以供调试
            const screenshotDir = path.join(__dirname, 'debug_screenshots');
            if (!fs.existsSync(screenshotDir)) {
                fs.mkdirSync(screenshotDir, { recursive: true });
            }
            const screenshotPath = path.join(screenshotDir, `failure_${seriesId}_${Date.now()}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`⚠️ 在 ${seriesId} 页面未找到剧集, 已保存截图至: ${screenshotPath}`);
        }

        return { success: true, episodes: episodes };
    } catch (error) {
        console.error(`获取 ${seriesId} 剧集失败:`, error.message);
        return { success: false, error: error.message };
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// --- Static File Server (Low Priority) ---
app.use(express.static('.'));


// --- Server Startup ---
const server = app.listen(port, async() => {
    console.log(`🚀 代理服务器运行在 http://localhost:${port}`);
    console.log(`🎬 实时搜索页面: http://localhost:3000/live-search.html`);
    console.log(`🎬 播放器页面: http://localhost:${port}/player?id=<playId>`);

    // 初始化搜索索引
    try {
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

    // 启动播放会话清理定时器
    playSessionManager.startCleanupTimer();
    console.log('🕐 启动播放会话清理定时器');
    console.log('✅ 服务器启动完成！');
});