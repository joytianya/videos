const puppeteer = require('puppeteer');

async function extractVideoUrl(pageUrl) {
    console.log('🚀 启动无头浏览器...');

    const browser = await puppeteer.launch({
        headless: true, // 设为 false 可以看到浏览器界面（调试用）
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // 监听网络请求，捕获 m3u8 文件
    const m3u8Urls = [];

    page.on('response', async(response) => {
        const url = response.url();
        if (url.includes('.m3u8')) {
            console.log('🎯 发现 M3U8 地址:', url);
            m3u8Urls.push(url);
        }
    });

    try {
        console.log('📄 正在访问页面:', pageUrl);

        // 访问页面
        await page.goto(pageUrl, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        console.log('⏳ 等待视频加载...');

        // 等待视频元素出现
        await page.waitForSelector('video', { timeout: 15000 });

        // 尝试点击播放按钮（如果存在）
        try {
            const playButton = await page.$('.play-btn, .video-play, [class*="play"]');
            if (playButton) {
                console.log('▶️  点击播放按钮...');
                await playButton.click();
                await page.waitForTimeout(3000);
            }
        } catch (e) {
            console.log('ℹ️  未找到播放按钮，继续...');
        }

        // 额外等待，确保网络请求完成
        await page.waitForTimeout(5000);

        if (m3u8Urls.length > 0) {
            console.log('\n✅ 成功提取到视频地址:');
            m3u8Urls.forEach((url, index) => {
                console.log(`   ${index + 1}. ${url}`);
            });

            // 返回最后一个（通常是主播放列表）
            return m3u8Urls[m3u8Urls.length - 1];
        } else {
            console.log('❌ 未找到 M3U8 地址');
            return null;
        }

    } catch (error) {
        console.error('❌ 提取失败:', error.message);
        return null;
    } finally {
        await browser.close();
    }
}

// 主函数
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('用法: npm run extract <视频页面URL>');
        console.log('示例: npm run extract "https://www.yfsp.tv/play/6T3bzwMGODG"');
        return;
    }

    const pageUrl = args[0];
    console.log('='.repeat(60));
    console.log('🎬 自动视频地址提取工具');
    console.log('='.repeat(60));

    const m3u8Url = await extractVideoUrl(pageUrl);

    if (m3u8Url) {
        console.log('\n🎉 提取成功！');
        console.log('📋 M3U8 地址:', m3u8Url);
        console.log('\n💡 现在你可以将这个地址用于播放器：');
        console.log(`   1. 更新 player.html 中的 originalVideoSrc 变量`);
        console.log(`   2. 或者直接在浏览器中访问: http://localhost:3000/proxy?url=${encodeURIComponent(m3u8Url)}`);
    } else {
        console.log('\n😞 提取失败，请检查页面是否正确加载或尝试手动方式。');
    }

    console.log('='.repeat(60));
}

// 如果直接运行此脚本
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { extractVideoUrl };