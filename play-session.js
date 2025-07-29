const crypto = require('crypto');

class PlaySessionManager {
    constructor() {
        this.sessions = new Map(); // 存储播放会话
        this.sessionTimeout = 24 * 60 * 60 * 1000; // 24小时过期
    }

    // 生成唯一的播放ID
    generatePlayId(playUrl, title) {
        // 使用时间戳和随机数生成唯一ID
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2);
        const hash = crypto.createHash('md5')
            .update(`${playUrl}-${title}-${timestamp}-${random}`)
            .digest('hex')
            .substring(0, 12); // 取前12位

        return `play_${hash}`;
    }

    // 创建播放会话
    createPlaySession(playUrl, title, videoId = null) {
        const playId = this.generatePlayId(playUrl, title);
        const expiresAt = Date.now() + this.sessionTimeout;

        const session = {
            playId,
            playUrl,
            title,
            videoId,
            createdAt: Date.now(),
            expiresAt,
            accessCount: 0
        };

        this.sessions.set(playId, session);

        // 清理过期会话
        this.cleanupExpiredSessions();

        console.log(`🎬 创建播放会话: ${playId} -> ${title}`);
        return playId;
    }

    // 获取播放会话
    getPlaySession(playId) {
        const session = this.sessions.get(playId);

        if (!session) {
            return null;
        }

        // 检查是否过期
        if (Date.now() > session.expiresAt) {
            this.sessions.delete(playId);
            console.log(`⏰ 播放会话已过期: ${playId}`);
            return null;
        }

        // 增加访问次数
        session.accessCount++;
        session.lastAccessAt = Date.now();

        return session;
    }

    // 删除播放会话
    deletePlaySession(playId) {
        const deleted = this.sessions.delete(playId);
        if (deleted) {
            console.log(`🗑️ 删除播放会话: ${playId}`);
        }
        return deleted;
    }

    // 清理过期会话
    cleanupExpiredSessions() {
        const now = Date.now();
        const expiredSessions = [];

        for (const [playId, session] of this.sessions.entries()) {
            if (now > session.expiresAt) {
                expiredSessions.push(playId);
            }
        }

        expiredSessions.forEach(playId => {
            this.sessions.delete(playId);
        });

        if (expiredSessions.length > 0) {
            console.log(`🧹 清理了 ${expiredSessions.length} 个过期播放会话`);
        }
    }

    // 获取会话统计信息
    getSessionStats() {
        this.cleanupExpiredSessions();

        return {
            totalSessions: this.sessions.size,
            activeSessions: Array.from(this.sessions.values()).filter(s =>
                Date.now() - s.lastAccessAt < 30 * 60 * 1000 // 30分钟内访问过
            ).length
        };
    }

    // 定期清理过期会话
    startCleanupTimer() {
        setInterval(() => {
            this.cleanupExpiredSessions();
        }, 60 * 60 * 1000); // 每小时清理一次

        console.log('🕐 启动播放会话清理定时器');
    }
}

module.exports = PlaySessionManager;