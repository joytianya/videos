const crypto = require('crypto');

// 模拟播放ID生成过程
function demonstrateIdGeneration(playUrl, title) {
    console.log('🔧 播放ID生成过程演示');
    console.log('='.repeat(50));

    // 步骤1：收集输入参数
    console.log('\n📝 步骤1：收集输入参数');
    console.log(`playUrl: ${playUrl}`);
    console.log(`title: ${title}`);

    // 步骤2：生成动态参数
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);

    console.log(`timestamp: ${timestamp} (${new Date(timestamp).toLocaleString('zh-CN')})`);
    console.log(`random: ${random}`);

    // 步骤3：组合字符串
    const input = `${playUrl}-${title}-${timestamp}-${random}`;
    console.log('\n🔗 步骤3：组合字符串');
    console.log(`input: ${input}`);

    // 步骤4：MD5哈希计算
    const fullHash = crypto.createHash('md5').update(input).digest('hex');
    const shortHash = fullHash.substring(0, 12);

    console.log('\n🔒 步骤4：MD5哈希计算');
    console.log(`完整哈希: ${fullHash}`);
    console.log(`截取12位: ${shortHash}`);

    // 步骤5：添加前缀
    const playId = `play_${shortHash}`;
    console.log('\n🎯 步骤5：添加前缀');
    console.log(`最终ID: ${playId}`);

    return playId;
}

// 演示同一视频多次生成不同ID
function demonstrateMultipleGenerations() {
    console.log('\n\n🎪 同一视频多次播放ID生成演示');
    console.log('='.repeat(60));

    const playUrl = 'https://www.yfsp.tv/play/11j9RDawU61';
    const title = '扫毒风暴';

    for (let i = 1; i <= 3; i++) {
        console.log(`\n🎬 第${i}次播放:`);
        const playId = demonstrateIdGeneration(playUrl, title);

        // 模拟会话创建
        const session = {
            playId: playId,
            playUrl: playUrl,
            title: title,
            createdAt: Date.now(),
            expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24小时后
            accessCount: 0
        };

        console.log('\n📦 会话信息:');
        console.log(JSON.stringify(session, null, 2));

        // 添加延迟确保时间戳不同
        if (i < 3) {
            console.log('\n⏳ 等待1秒确保时间戳不同...');
            require('child_process').execSync('sleep 1');
        }
    }
}

// 分析ID唯一性
function analyzeUniqueness() {
    console.log('\n\n🔍 ID唯一性分析');
    console.log('='.repeat(40));

    const playUrl = 'https://www.yfsp.tv/play/11j9RDawU61';
    const title = '扫毒风暴';
    const ids = new Set();
    const iterations = 100;

    console.log(`生成${iterations}个ID进行唯一性测试...`);

    const startTime = Date.now();

    for (let i = 0; i < iterations; i++) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2);
        const input = `${playUrl}-${title}-${timestamp}-${random}`;
        const hash = crypto.createHash('md5').update(input).digest('hex').substring(0, 12);
        const playId = `play_${hash}`;

        ids.add(playId);
    }

    const endTime = Date.now();

    console.log(`\n📊 测试结果:`);
    console.log(`生成总数: ${iterations}`);
    console.log(`唯一ID数: ${ids.size}`);
    console.log(`重复ID数: ${iterations - ids.size}`);
    console.log(`唯一率: ${(ids.size / iterations * 100).toFixed(2)}%`);
    console.log(`总耗时: ${endTime - startTime}ms`);
    console.log(`平均耗时: ${((endTime - startTime) / iterations).toFixed(2)}ms/个`);

    // 显示前10个生成的ID
    console.log(`\n🎯 前10个生成的ID:`);
    Array.from(ids).slice(0, 10).forEach((id, index) => {
        console.log(`${index + 1}. ${id}`);
    });
}

// 安全性分析
function securityAnalysis() {
    console.log('\n\n🛡️ 安全性分析');
    console.log('='.repeat(40));

    // 分析随机数强度
    console.log('\n🎲 随机数强度分析:');
    const randomSamples = [];
    for (let i = 0; i < 10; i++) {
        randomSamples.push(Math.random().toString(36).substring(2));
    }
    console.log('随机数样本:', randomSamples);
    console.log('平均长度:', randomSamples.reduce((sum, r) => sum + r.length, 0) / randomSamples.length);

    // 分析时间戳精度
    console.log('\n🕐 时间戳精度分析:');
    const timestamps = [];
    for (let i = 0; i < 5; i++) {
        timestamps.push(Date.now());
        // 微小延迟
        for (let j = 0; j < 1000; j++) { /* 忙等待 */ }
    }
    console.log('时间戳样本:', timestamps);
    console.log('最小间隔:', Math.min(...timestamps.slice(1).map((t, i) => t - timestamps[i])));

    // 分析哈希分布
    console.log('\n🔒 哈希分布分析:');
    const hashSamples = [];
    for (let i = 0; i < 10; i++) {
        const input = `test-${Date.now()}-${Math.random()}`;
        const hash = crypto.createHash('md5').update(input).digest('hex').substring(0, 12);
        hashSamples.push(hash);
    }
    console.log('哈希样本:', hashSamples);

    // 分析字符分布
    const allChars = hashSamples.join('');
    const charCount = {};
    for (const char of allChars) {
        charCount[char] = (charCount[char] || 0) + 1;
    }
    console.log('字符分布:', charCount);
}

// 执行所有演示
console.log('🎬 播放ID生成原理完整演示');
console.log('='.repeat(60));

// 单次生成演示
demonstrateIdGeneration(
    'https://www.yfsp.tv/play/11j9RDawU61',
    '扫毒风暴'
);

// 多次生成演示
demonstrateMultipleGenerations();

// 唯一性分析
analyzeUniqueness();

// 安全性分析
securityAnalysis();

console.log('\n\n✅ 演示完成！');
console.log('\n💡 总结:');
console.log('- 每次播放同一视频都会生成不同的ID');
console.log('- ID具有高度的唯一性和不可预测性');
console.log('- 系统设计兼顾了安全性和性能');
console.log('- 通过时间戳+随机数+哈希确保唯一性');