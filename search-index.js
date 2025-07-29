const fs = require('fs');
const path = require('path');

class VideoSearchIndex {
    constructor() {
        this.dataDir = 'dynamic_api_data';
        this.indexFile = 'video_search_index.json';
        this.videos = [];
        this.searchIndex = {};
    }

    // 加载所有页面的视频数据
    async loadAllVideos() {
        console.log('🔍 正在加载所有视频数据...');

        if (!fs.existsSync(this.dataDir)) {
            console.error(`❌ 数据目录不存在: ${this.dataDir}`);
            return false;
        }

        const files = fs.readdirSync(this.dataDir);
        const pageFiles = files.filter(file => file.startsWith('page_') && file.endsWith('.json'));

        console.log(`📁 找到 ${pageFiles.length} 个页面文件`);

        for (const file of pageFiles) {
            try {
                const filePath = path.join(this.dataDir, file);
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                if (data.pageInfo && data.pageInfo.success && data.videos) {
                    console.log(`✅ 加载 ${file}: ${data.videos.length} 个视频`);
                    this.videos.push(...data.videos);
                } else {
                    console.log(`⚠️  跳过 ${file}: 数据格式异常`);
                }
            } catch (error) {
                console.error(`❌ 加载 ${file} 失败:`, error.message);
            }
        }

        console.log(`🎬 总共加载 ${this.videos.length} 个视频`);
        return true;
    }

    // 构建搜索索引
    buildSearchIndex() {
        console.log('🔨 正在构建搜索索引...');

        this.videos.forEach((video, index) => {
            // 为每个视频分配唯一ID
            video.id = `video_${index}`;

            // 构建搜索关键词（标题分词）
            const title = video.title || '';
            const keywords = this.extractKeywords(title);

            keywords.forEach(keyword => {
                if (!this.searchIndex[keyword]) {
                    this.searchIndex[keyword] = [];
                }
                this.searchIndex[keyword].push({
                    id: video.id,
                    title: video.title,
                    score: this.calculateRelevanceScore(keyword, title)
                });
            });
        });

        // 对每个关键词的结果按相关性排序
        Object.keys(this.searchIndex).forEach(keyword => {
            this.searchIndex[keyword].sort((a, b) => b.score - a.score);
        });

        console.log(`📚 索引构建完成，包含 ${Object.keys(this.searchIndex).length} 个关键词`);
    }

    // 提取搜索关键词
    extractKeywords(title) {
        if (!title) return [];

        // 移除特殊字符，分割成词
        const words = title
            .toLowerCase()
            .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 0);

        // 添加完整标题作为关键词
        const keywords = [title.toLowerCase()];

        // 添加单词
        keywords.push(...words);

        // 添加中文字符（单个字符）
        const chineseChars = title.match(/[\u4e00-\u9fa5]/g);
        if (chineseChars) {
            keywords.push(...chineseChars);
        }

        // 添加连续的中文词组（2-4个字符）
        for (let len = 2; len <= 4; len++) {
            for (let i = 0; i <= title.length - len; i++) {
                const substr = title.substr(i, len);
                if (/^[\u4e00-\u9fa5]+$/.test(substr)) {
                    keywords.push(substr.toLowerCase());
                }
            }
        }

        return [...new Set(keywords)]; // 去重
    }

    // 计算相关性得分
    calculateRelevanceScore(keyword, title) {
        const titleLower = title.toLowerCase();
        const keywordLower = keyword.toLowerCase();

        // 完全匹配得分最高
        if (titleLower === keywordLower) return 100;

        // 标题开头匹配
        if (titleLower.startsWith(keywordLower)) return 80;

        // 标题结尾匹配
        if (titleLower.endsWith(keywordLower)) return 70;

        // 包含关键词
        if (titleLower.includes(keywordLower)) return 60;

        // 关键词长度奖励
        const lengthBonus = Math.min(keyword.length * 2, 20);

        return 50 + lengthBonus;
    }

    // 搜索视频
    search(query, limit = 3) {
        if (!query || query.trim().length === 0) {
            return [];
        }

        const queryLower = query.toLowerCase().trim();
        const queryKeywords = this.extractKeywords(queryLower);

        // 收集所有匹配的视频ID和得分
        const videoScores = {};

        queryKeywords.forEach(keyword => {
            if (this.searchIndex[keyword]) {
                this.searchIndex[keyword].forEach(result => {
                    if (!videoScores[result.id]) {
                        videoScores[result.id] = 0;
                    }
                    videoScores[result.id] += result.score;
                });
            }
        });

        // 按得分排序并获取前N个结果
        const sortedResults = Object.entries(videoScores)
            .sort(([, a], [, b]) => b - a)
            .slice(0, limit)
            .map(([videoId, score]) => {
                const video = this.videos.find(v => v.id === videoId);
                return {
                    ...video,
                    searchScore: score
                };
            });

        return sortedResults;
    }

    // 根据ID获取视频详情
    getVideoById(videoId) {
        return this.videos.find(v => v.id === videoId);
    }

    // 保存索引到文件
    saveIndex() {
        const indexData = {
            videos: this.videos,
            searchIndex: this.searchIndex,
            createdAt: new Date().toISOString(),
            totalVideos: this.videos.length,
            totalKeywords: Object.keys(this.searchIndex).length
        };

        fs.writeFileSync(this.indexFile, JSON.stringify(indexData, null, 2), 'utf8');
        console.log(`💾 搜索索引已保存到: ${this.indexFile}`);
    }

    // 从文件加载索引
    loadIndex() {
        if (!fs.existsSync(this.indexFile)) {
            return false;
        }

        try {
            const indexData = JSON.parse(fs.readFileSync(this.indexFile, 'utf8'));
            this.videos = indexData.videos || [];
            this.searchIndex = indexData.searchIndex || {};

            console.log(`📚 从文件加载索引: ${this.videos.length} 个视频, ${Object.keys(this.searchIndex).length} 个关键词`);
            return true;
        } catch (error) {
            console.error('❌ 加载索引文件失败:', error.message);
            return false;
        }
    }

    // 构建完整索引
    async buildFullIndex() {
        console.log('🚀 开始构建视频搜索索引...');

        const loaded = await this.loadAllVideos();
        if (!loaded) {
            return false;
        }

        this.buildSearchIndex();
        this.saveIndex();

        console.log('✅ 视频搜索索引构建完成！');
        return true;
    }
}

// 主程序入口
async function main() {
    const indexBuilder = new VideoSearchIndex();

    // 检查是否需要重建索引
    const args = process.argv.slice(2);
    const forceRebuild = args.includes('--rebuild');

    if (forceRebuild || !indexBuilder.loadIndex()) {
        console.log('🔄 构建新的搜索索引...');
        await indexBuilder.buildFullIndex();
    } else {
        console.log('✅ 使用现有的搜索索引');
    }

    // 测试搜索功能
    if (args.includes('--test')) {
        console.log('\n🧪 测试搜索功能...');
        const testQueries = ['长发', '惊变', '春迟', '爱情', '恐怖'];

        testQueries.forEach(query => {
            console.log(`\n🔍 搜索 "${query}":`);
            const results = indexBuilder.search(query, 3);
            results.forEach((video, index) => {
                console.log(`  ${index + 1}. ${video.title} (得分: ${video.searchScore})`);
                console.log(`     分类: ${video.categories.join(', ')}`);
                console.log(`     播放: ${video.playUrl}`);
            });
        });
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main().catch(console.error);
}

module.exports = VideoSearchIndex;