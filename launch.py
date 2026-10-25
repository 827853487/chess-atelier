"""One-command cross-platform launcher. Requires Python >=3.10; no PowerShell."""
import os
import sys
import socket
import json
import webbrowser
import traceback
import threading
from pathlib import Path
from http.server import ThreadingHTTPServer
from urllib.request import urlopen
from runtime_setup import ensure_chess
ensure_chess()
import serve

ROOT=Path(__file__).resolve().parent
PORT_FILE=ROOT/'data'/'server-port.json'
os.chdir(ROOT)

def read_proxy():
    f=ROOT/'代理配置.txt'
    if not f.is_file():return ''
    for row in f.read_text(encoding='utf-8-sig').splitlines():
        row=row.strip()
        if row and not row.startswith('#'):
            if not row.startswith(('http://127.0.0.1:', 'http://localhost:', 'https://127.0.0.1:')):
                print('提示：代理配置仅支持本机代理地址，已忽略。')
                return ''
            return row
    return ''

def preferred_ports():
    try:
        saved=int(json.loads(PORT_FILE.read_text(encoding='utf-8'))['port'])
        if not 1024<=saved<=65535:raise ValueError('Invalid port')
    except (OSError,ValueError,TypeError,KeyError):saved=None
    return list(dict.fromkeys(([saved] if saved else [])+[8765,18765,18766,18767,18768]))


def create_server(host='127.0.0.1'):
    """Remember the first usable port; Windows may reserve 8765 without a listener."""
    last_error=None
    for port in preferred_ports():
        try:
            server=serve.AtelierServer((host,port),serve.Handler)
        except OSError as exc:
            last_error=exc
            try:
                with urlopen(f'http://127.0.0.1:{port}/api/health',timeout=1) as response:
                    running=json.load(response)
                if running.get('app_id')==serve.APP_ID:
                    if running.get('revision')==serve.APP_REVISION and host=='127.0.0.1':return None,port
                    raise RuntimeError('此项目的旧窗口或另一种启动模式正在运行，请关闭该启动窗口后重试。')
            except (OSError,ValueError):pass
            continue
        PORT_FILE.parent.mkdir(parents=True,exist_ok=True)
        PORT_FILE.write_text(json.dumps({'port':port}),encoding='utf-8')
        return server,port
    raise RuntimeError('没有可用的本地端口，请关闭旧的棋境启动窗口后重试。') from last_error


def main():
    proxy=read_proxy()
    if proxy:
        from urllib.request import build_opener, ProxyHandler
        serve.PROXY_URL=proxy
        serve.HTTP_OPENER=build_opener(ProxyHandler({'http':proxy,'https':proxy}))
        print('已使用代理：'+proxy)
    serve.Handler.dbfile=ROOT/'chess-games.sqlite'
    # IndexedDB belongs to an origin, including the port. Reuse the remembered address.
    server,port=create_server()
    url=f'http://127.0.0.1:{port}/?app=chessatelier'
    if server is None:
        print('棋境已经运行，正在打开原有页面。')
        webbrowser.open(url)
        return
    print('\n棋境 · 国际象棋练习 已启动：'+url)
    print('请保持此窗口打开。关闭窗口即停止网站。')
    print('如网页没有自动打开，将上面的地址粘贴到浏览器。')
    threading.Timer(.6,lambda:webbrowser.open(url)).start()
    try:server.serve_forever(poll_interval=.3)
    except KeyboardInterrupt:pass
    finally:
        server.server_close()
        serve.PLAY_ENGINE.close()
        serve.ANALYSIS_ENGINE.close()

if __name__=='__main__':
    try:main()
    except Exception:
        print('\n启动失败，原因如下：',file=sys.stderr)
        traceback.print_exc()
        input('\n按回车键退出…')
        sys.exit(1)
