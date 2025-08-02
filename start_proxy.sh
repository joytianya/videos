#!/bin/bash

# 网站代理服务器一键启动脚本
# 作者：Claude Code
# 功能：启动带广告拦截功能的网站代理服务器

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/proxy.pid"
LOG_FILE="$SCRIPT_DIR/proxy.log"
PORT=8888
proxy-on
# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 网站代理服务器启动脚本${NC}"
echo "========================================"

# 检查Python环境
check_python() {
    if ! command -v python &> /dev/null; then
        echo -e "${RED}❌ 错误：未找到Python环境${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Python环境检查通过${NC}"
}

# 检查依赖
check_dependencies() {
    cd "$SCRIPT_DIR"
    if [ ! -f "requirements.txt" ]; then
        echo -e "${RED}❌ 错误：未找到requirements.txt文件${NC}"
        exit 1
    fi
    
    echo -e "${YELLOW}📦 检查依赖包...${NC}"
    pip install -r requirements.txt > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ 依赖包检查完成${NC}"
    else
        echo -e "${RED}❌ 依赖包安装失败${NC}"
        exit 1
    fi
}

# 停止已运行的服务
stop_existing() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p $PID > /dev/null 2>&1; then
            echo -e "${YELLOW}🛑 停止已运行的服务 (PID: $PID)${NC}"
            kill $PID
            sleep 2
        fi
        rm -f "$PID_FILE"
    fi
    
    # 强制清理端口
    lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
}

# 启动服务
start_service() {
    cd "$SCRIPT_DIR"
    echo -e "${YELLOW}🌟 启动代理服务器...${NC}"
    
    # 后台启动服务并记录PID
    nohup python src/main.py > "$LOG_FILE" 2>&1 &
    PID=$!
    echo $PID > "$PID_FILE"
    
    # 等待服务启动
    sleep 3
    
    # 检查服务是否启动成功
    if ps -p $PID > /dev/null 2>&1; then
        echo -e "${GREEN}✅ 代理服务器启动成功！${NC}"
        echo "========================================"
        echo -e "${GREEN}📍 服务地址：${NC}http://localhost:$PORT"
        echo -e "${GREEN}📍 健康检查：${NC}http://localhost:$PORT/health"
        echo -e "${GREEN}📍 进程ID：${NC}$PID"
        echo -e "${GREEN}📍 日志文件：${NC}$LOG_FILE"
        echo "========================================"
        echo -e "${YELLOW}💡 使用方法：${NC}"
        echo "   - 访问 http://localhost:$PORT 使用代理"
        echo "   - 查看日志: tail -f $LOG_FILE"
        echo "   - 停止服务: kill $PID"
        echo "   - 或者运行: $0 stop"
        echo ""
        echo -e "${GREEN}🎯 广告拦截功能已启用：${NC}"
        echo "   - 自动拦截所有GIF图片广告"
        echo "   - 过滤HTML中的广告元素"
        echo "   - 阻止广告域名请求"
    else
        echo -e "${RED}❌ 服务启动失败，请检查日志：$LOG_FILE${NC}"
        exit 1
    fi
}

# 停止服务
stop_service() {
    # 首先尝试从PID文件停止
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p $PID > /dev/null 2>&1; then
            echo -e "${YELLOW}🛑 停止代理服务器 (PID: $PID)${NC}"
            kill $PID
            sleep 2
            if ps -p $PID > /dev/null 2>&1; then
                kill -9 $PID
            fi
            echo -e "${GREEN}✅ 服务已停止${NC}"
        else
            echo -e "${YELLOW}⚠️  PID文件中的进程已不存在${NC}"
        fi
        rm -f "$PID_FILE"
    else
        echo -e "${YELLOW}⚠️  未找到PID文件${NC}"
    fi
    
    # 强制清理所有占用端口的进程（无论PID文件是否存在）
    echo -e "${YELLOW}🧹 清理端口 $PORT 上的所有进程...${NC}"
    PIDS=$(lsof -ti:$PORT 2>/dev/null)
    if [ ! -z "$PIDS" ]; then
        echo -e "${YELLOW}发现占用端口的进程: $PIDS${NC}"
        echo $PIDS | xargs kill -9 2>/dev/null || true
        sleep 1
        # 再次检查
        REMAINING=$(lsof -ti:$PORT 2>/dev/null)
        if [ -z "$REMAINING" ]; then
            echo -e "${GREEN}✅ 端口已清理${NC}"
        else
            echo -e "${RED}❌ 仍有进程占用端口: $REMAINING${NC}"
        fi
    else
        echo -e "${GREEN}✅ 端口未被占用${NC}"
    fi
}

# 查看状态
show_status() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p $PID > /dev/null 2>&1; then
            echo -e "${GREEN}✅ 服务正在运行 (PID: $PID)${NC}"
            echo -e "${GREEN}📍 服务地址：${NC}http://localhost:$PORT"
        else
            echo -e "${RED}❌ 服务未运行 (PID文件存在但进程不存在)${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  服务未运行${NC}"
    fi
}

# 查看日志
show_logs() {
    if [ -f "$LOG_FILE" ]; then
        echo -e "${GREEN}📋 最近的日志 (最后20行):${NC}"
        echo "========================================"
        tail -20 "$LOG_FILE"
        echo "========================================"
        echo -e "${YELLOW}💡 实时查看日志: tail -f $LOG_FILE${NC}"
    else
        echo -e "${YELLOW}⚠️  日志文件不存在${NC}"
    fi
}

# 主逻辑
case "${1:-start}" in
    "start")
        check_python
        check_dependencies
        stop_existing
        start_service
        ;;
    "stop")
        stop_service
        ;;
    "restart")
        stop_service
        sleep 2
        check_python
        check_dependencies
        start_service
        ;;
    "status")
        show_status
        ;;
    "logs")
        show_logs
        ;;
    *)
        echo "使用方法: $0 {start|stop|restart|status|logs}"
        echo ""
        echo "命令说明:"
        echo "  start   - 启动代理服务器 (默认)"
        echo "  stop    - 停止代理服务器"
        echo "  restart - 重启代理服务器"
        echo "  status  - 查看服务状态"
        echo "  logs    - 查看日志"
        exit 1
        ;;
esac