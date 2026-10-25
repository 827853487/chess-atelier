"""Install the existing chess requirement once; subsequent launches are fully offline."""
import importlib.util
import subprocess
import sys


def ensure_chess():
    if importlib.util.find_spec('chess') is not None:
        return
    print('首次运行：正在安装本地 Stockfish 桥接所需的 chess 棋规库。', flush=True)
    try:
        subprocess.run([sys.executable, '-m', 'pip', 'install', '--disable-pip-version-check',
                        'chess>=1.11.0,<2'], check=True)
    except (OSError, subprocess.CalledProcessError) as exc:
        raise RuntimeError('无法安装棋规库。请联网运行 python -m pip install chess，然后重新启动。') from exc
