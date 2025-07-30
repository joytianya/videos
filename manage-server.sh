#!/bin/bash

# 定义服务相关变量
SERVER_SCRIPT="proxy-server.js"
PID_FILE="server.pid"
LOG_FILE="server.log"

# 检查服务是否正在运行
is_running() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p $PID > /dev/null; then
            return 0 # 正在运行
        fi
    fi
    return 1 # 未运行
}

# 启动服务
start() {
    if is_running; then
        echo "✅ 服务已经在运行 (PID: $(cat "$PID_FILE"))."
        return 0
    fi

    echo "🚀 正在启动服务..."
    # 使用 nohup 在后台运行，并将日志输出到文件
    nohup node "$SERVER_SCRIPT" > "$LOG_FILE" 2>&1 &
    # 获取新进程的PID并保存
    echo $! > "$PID_FILE"

    sleep 1 # 等待一秒以确认启动

    if is_running; then
        echo "✅ 服务启动成功 (PID: $(cat "$PID_FILE")). 日志文件: $LOG_FILE"
    else
        echo "❌ 服务启动失败. 请检查日志文件: $LOG_FILE"
        rm -f "$PID_FILE"
    fi
}

# 停止服务
stop() {
    if is_running; then
        PID=$(cat "$PID_FILE")
        echo "🛑 正在停止服务 (PID: $PID)..."
        kill $PID
        # 等待进程结束
        while is_running; do
            sleep 0.5
        done
        rm -f "$PID_FILE"
        echo "✅ 服务已停止."
    else
        echo "ℹ️  服务未在运行."
    fi
}

# 查看服务状态
status() {
    if is_running; then
        echo "✅ 服务正在运行 (PID: $(cat "$PID_FILE"))."
        echo "Tail of log file ($LOG_FILE):"
        tail -n 10 "$LOG_FILE"
    else
        echo "ℹ️  服务未在运行."
    fi
}

# 主逻辑
case "$1" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        stop
        start
        ;;
    status)
        status
        ;;
    *)
        echo "用法: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac

exit 0 