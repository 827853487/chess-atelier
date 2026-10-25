"""Local Stockfish only. Play and full-strength analysis use separate UCI processes."""
from __future__ import annotations

import atexit
import os
from pathlib import Path
import shutil
import subprocess
import threading
import time

try:
    import chess
    import chess.engine
except ImportError:
    chess = None

ROOT = Path(__file__).resolve().parent
LEVELS = {
    1: {'name': '入门', 'elo': 1320, 'ms': 350},
    2: {'name': '休闲', 'elo': 1600, 'ms': 500},
    3: {'name': '进阶', 'elo': 1900, 'ms': 700},
    4: {'name': '高手', 'elo': 2200, 'ms': 1000},
    5: {'name': '大师', 'elo': 2600, 'ms': 1400},
    6: {'name': '全力', 'elo': None, 'ms': 2200},
}


class EngineUnavailable(RuntimeError):
    pass


class EngineBusy(RuntimeError):
    pass


def board_from_request(data):
    """Keep the complete move stack so Stockfish sees repetition and the 50-move rule."""
    if chess is None:
        raise EngineUnavailable('缺少棋规依赖，请运行 python -m pip install chess 后重启。')
    fen = data.get('fen', '')
    if not isinstance(fen, str) or len(fen) > 160:
        raise ValueError('无效 FEN')
    origin = data.get('origin', fen)
    if not isinstance(origin, str) or len(origin) > 160:
        raise ValueError('无效起始局面')
    board = chess.Board(origin)
    if not board.is_valid():
        raise ValueError('起始局面不符合国际象棋规则')
    moves = data.get('moves', [])
    if not isinstance(moves, list) or len(moves) > 2048:
        raise ValueError('无效着法记录')
    for uci in moves:
        if not isinstance(uci, str) or len(uci) > 5:
            raise ValueError('无效 UCI 着法')
        board.push_uci(uci)
    expected = chess.Board(fen)
    if not expected.is_valid() or board.fen() != expected.fen():
        raise ValueError('局面与着法记录不一致')
    return board


class LocalStockfish:
    def __init__(self, role):
        self.role = role
        self.lock = threading.Lock()
        self.engine = None
        self.error = ''
        self.name = 'Stockfish'
        self.elo_min, self.elo_max = 1320, 3190

    def _ensure(self):
        if chess is None:
            raise EngineUnavailable('缺少 chess 依赖，请运行 python -m pip install chess。')
        if self.engine is not None and self.engine.returncode.done():
            self.close()
        if self.engine is not None:
            return self.engine
        paths = [ROOT / 'engines' / 'stockfish.exe', ROOT / 'engines' / 'stockfish', ROOT / 'stockfish.exe']
        exe = next((str(p) for p in paths if p.is_file()), None) or shutil.which('stockfish')
        if not exe:
            raise EngineUnavailable('未找到本地 Stockfish，请将程序放入 engines 文件夹。')
        kwargs = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}
        try:
            self.engine = chess.engine.SimpleEngine.popen_uci(exe, timeout=8, **kwargs)
            self.name = self.engine.id.get('name', 'Stockfish')
            elo = self.engine.options.get('UCI_Elo')
            if elo:
                self.elo_min, self.elo_max = elo.min, elo.max
            self.engine.configure({'Threads': 1, 'Hash': 64, 'UCI_ShowWDL': True})
            self.error = ''
        except Exception as exc:
            self.close()
            self.error = '本地 Stockfish 启动失败：' + type(exc).__name__
            raise EngineUnavailable(self.error) from exc
        return self.engine

    def status(self):
        try:
            with self.lock:
                self._ensure()
            available = True
        except EngineUnavailable as exc:
            self.error = str(exc)
            available = False
        return {'available': available, 'source': 'stockfish', 'name': self.name,
                'local': True, 'message': self.error, 'eloRange': [self.elo_min, self.elo_max],
                'levels': {str(k): {**v, 'elo': min(self.elo_max, max(self.elo_min, v['elo']))
                                   if v['elo'] is not None else None} for k, v in LEVELS.items()}}

    def close(self):
        engine, self.engine = self.engine, None
        if engine:
            engine.close()

    def play(self, board, level):
        if level not in LEVELS:
            raise ValueError('难度应为 1–6')
        if not self.lock.acquire(timeout=3):
            raise EngineBusy('电脑正在计算，请稍后重试。')
        try:
            engine = self._ensure()
            spec = LEVELS[level]
            elo = spec['elo']
            options = {'UCI_LimitStrength': elo is not None, 'Skill Level': 20}
            if elo is not None:
                options['UCI_Elo'] = min(self.elo_max, max(self.elo_min, elo))
            engine.configure(options)
            if board.is_game_over() or board.is_repetition(3) or board.halfmove_clock >= 100:
                return {'ok': True, 'terminal': True, 'uci': None, 'result': board.result(claim_draw=True)}
            result = engine.play(board, chess.engine.Limit(time=spec['ms'] / 1000),
                                 info=chess.engine.INFO_BASIC)
            if not result.move or result.move not in board.legal_moves:
                raise EngineUnavailable('Stockfish 未返回合法着法，请重试。')
            return {'ok': True, 'source': 'stockfish', 'name': self.name, 'uci': result.move.uci(),
                    'level': level, 'elo': options.get('UCI_Elo'), 'depth': result.info.get('depth', 0)}
        except (chess.engine.EngineError, TimeoutError, OSError) as exc:
            self.close()
            raise EngineUnavailable('Stockfish 对弈中断，请重试。') from exc
        finally:
            self.lock.release()

    def analyze(self, board, seconds=1.2):
        if not self.lock.acquire(timeout=2):
            raise EngineBusy('分析引擎正忙，正在等待上一项分析结束。')
        try:
            engine = self._ensure()
            engine.configure({'UCI_LimitStrength': False, 'Skill Level': 20})
            base = {'available': True, 'source': 'stockfish', 'name': self.name,
                    'fen': board.fen(en_passant='fen'), 'perspective': 'white'}
            if board.is_game_over() or board.is_repetition(3) or board.halfmove_clock >= 100:
                cp = None if board.is_checkmate() else 0
                yield {**base, 'terminal': True, 'result': board.result(claim_draw=True), 'depth': 0,
                       'pvs': [], 'cp': cp, 'complete': True}
                return
            depths, rows, last_emit = {}, {}, 0
            count = min(3, board.legal_moves.count())
            with engine.analysis(board, chess.engine.Limit(time=seconds), multipv=3) as analysis:
                for info in analysis:
                    if not info.get('pv') or not info.get('score') or info.get('upperbound') or info.get('lowerbound'):
                        continue
                    score = info['score'].white()
                    row = {'moves': ' '.join(m.uci() for m in info['pv']), 'depth': info.get('depth', 0)}
                    if score.is_mate():
                        row['mate'] = score.mate()
                    else:
                        row['cp'] = score.score()
                    if info.get('wdl'):
                        wdl = info['wdl'].white()
                        row['wdl'] = [wdl.wins, wdl.draws, wdl.losses]
                    depth = row['depth']
                    batch = depths.setdefault(depth, {})
                    batch[info.get('multipv', 1)] = row
                    # Never mix PV ranks from different iterations: their root moves can duplicate.
                    if len(batch) < count:
                        continue
                    rows = batch.copy()
                    if len(depths) > 24:
                        del depths[min(depths)]
                    now = time.monotonic()
                    if 1 in rows and now - last_emit >= .12:
                        last_emit = now
                        yield {**base, 'pvs': [rows[i] for i in sorted(rows)], 'depth': rows[1]['depth'],
                               'nodes': info.get('nodes', 0), 'nps': info.get('nps', 0), 'complete': False}
            if 1 not in rows:
                raise EngineUnavailable('Stockfish 未返回分析，请重试。')
            yield {**base, 'pvs': [rows[i] for i in sorted(rows)], 'depth': rows[1]['depth'],
                   'complete': True}
        except (chess.engine.EngineError, TimeoutError, OSError) as exc:
            self.close()
            raise EngineUnavailable('本地分析中断，请重试。') from exc
        finally:
            self.lock.release()


PLAY_ENGINE = LocalStockfish('play')
ANALYSIS_ENGINE = LocalStockfish('analysis')
atexit.register(PLAY_ENGINE.close)
atexit.register(ANALYSIS_ENGINE.close)
