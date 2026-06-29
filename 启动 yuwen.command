#!/bin/bash
# 双击本文件即可启动 yuwen 编辑器。
# 由于使用原生 ES module，必须通过本地服务器访问（不能用 file:// 直接打开）。
# 本脚本会在项目目录启动一个本地服务器，并自动打开浏览器。关闭此终端窗口即停止。

cd "$(dirname "$0")" || exit 1

PORT=5173
URL="http://localhost:$PORT"

# 选择一个可用的静态服务器：优先 python3，其次 python，再次 php。
if command -v python3 >/dev/null 2>&1; then
  SERVER=(python3 -m http.server "$PORT")
elif command -v python >/dev/null 2>&1; then
  SERVER=(python -m SimpleHTTPServer "$PORT")
elif command -v php >/dev/null 2>&1; then
  SERVER=(php -S "localhost:$PORT")
else
  echo "未找到 python3 / python / php，无法启动本地服务器。"
  echo "请先安装其中之一，或手动运行任意静态服务器后访问 $URL"
  read -r -p "按回车键关闭…" _
  exit 1
fi

echo "yuwen 正在 $URL 运行。"
echo "关闭此窗口或按 Ctrl+C 即可停止。"

# 稍候片刻再打开浏览器，确保服务器已就绪。
( sleep 1; open "$URL" ) &

exec "${SERVER[@]}"
