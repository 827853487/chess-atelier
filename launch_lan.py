"""Explicitly start a trusted-LAN server. Do NOT run on public / untrusted Wi-Fi."""
import socket,os,sys
from pathlib import Path
from http.server import ThreadingHTTPServer
from launch import read_proxy,create_server
import serve
ROOT=Path(__file__).resolve().parent
os.chdir(ROOT)
proxy=read_proxy()
if proxy:
 from urllib.request import build_opener,ProxyHandler
 serve.HTTP_OPENER=build_opener(ProxyHandler({'http':proxy,'https':proxy}))
 serve.PROXY_URL=proxy
serve.Handler.dbfile=ROOT/'chess-games.sqlite'
serve.start_library_download()
try:
 s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);s.connect(('192.0.2.1',80));ip=s.getsockname()[0];s.close()
except OSError:ip='你的电脑局域网 IPv4 地址'
try: server,port=create_server('0.0.0.0')
except OSError as exc:
 print('无法启动：本地端口不可用。',exc)
 input('按回车键退出…');sys.exit(1)
print('棋境 · 已在局域网开放访问')
print(f'电脑及同一 Wi-Fi 设备访问：http://{ip}:{port}/')
print('需允许 Windows 防火墙访问专用网络。请勿将该端口直接暴露公网。')
print('使用 Ctrl+C 停止网站。')
try:server.serve_forever()
except KeyboardInterrupt:pass
finally:
 server.server_close()
 serve.PLAY_ENGINE.close()
 serve.ANALYSIS_ENGINE.close()
