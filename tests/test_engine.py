import concurrent.futures
import json
from pathlib import Path
import sys
import threading
import time
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import chess
import chess.pgn
from local_engine import PLAY_ENGINE, ANALYSIS_ENGINE, board_from_request, LEVELS
from serve import Handler, ThreadingHTTPServer


class LocalEngineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        threading.Thread(target=cls.server.serve_forever,daemon=True).start()
        cls.url='http://127.0.0.1:'+str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close()
        PLAY_ENGINE.close();ANALYSIS_ENGINE.close()

    def request(self,path,data=None):
        req=Request(self.url+path,data=json.dumps(data).encode() if data else None,headers={'Content-Type':'application/json'})
        return urlopen(req,timeout=15)

    def test_discovery_and_real_difficulty_options(self):
        with self.request('/api/engine') as response:data=json.load(response)
        self.assertTrue(data['available']);self.assertIn('Stockfish',data['name']);self.assertEqual(len(data['levels']),6)
        self.assertIsNone(data['levels']['6']['elo'])

    def test_all_six_levels_return_legal_moves(self):
        board=chess.Board()
        for level in LEVELS:
            with self.subTest(level=level):
                result=PLAY_ENGINE.play(board,level)
                self.assertIn(chess.Move.from_uci(result['uci']),board.legal_moves)
                self.assertEqual(result['elo'],LEVELS[level]['elo'])

    def test_reject_invalid_fen_and_illegal_history(self):
        for data in [{'fen':'8/8/8/8/8/8/8/8 w - - 0 1'}, {'fen':chess.STARTING_FEN,'origin':chess.STARTING_FEN,'moves':['e2e5']}, {'fen':chess.STARTING_FEN,'level':99}]:
            with self.subTest(data=data),self.assertRaises(HTTPError) as raised:self.request('/api/play',data)
            self.assertEqual(raised.exception.code,400)

    def test_history_preserves_repetition(self):
        board=chess.Board();moves=['g1f3','g8f6','f3g1','f6g8']*2
        for move in moves:board.push_uci(move)
        restored=board_from_request({'fen':board.fen(),'origin':chess.STARTING_FEN,'moves':moves})
        self.assertTrue(restored.is_repetition(3))
        self.assertTrue(list(ANALYSIS_ENGINE.analyze(restored,.1))[-1]['terminal'])

    def test_stream_has_progress_and_three_unique_legal_pvs(self):
        with self.request('/api/analyze',{'fen':chess.STARTING_FEN,'stream':True}) as response:
            self.assertIn('text/event-stream',response.headers['Content-Type'])
            rows=[json.loads(line[6:]) for line in response.read().decode().splitlines() if line.startswith('data: ')]
        self.assertGreater(len(rows),1);self.assertTrue(rows[-1]['complete'])
        result=rows[-1];self.assertEqual(result['perspective'],'white');self.assertEqual(len(result['pvs']),3)
        roots=[]
        for pv in result['pvs']:
            board=chess.Board();roots.append(pv['moves'].split()[0])
            for move in pv['moves'].split():board.push_uci(move)
            self.assertEqual(pv['depth'],result['depth'])
        self.assertEqual(len(set(roots)),3)

    def test_play_does_not_wait_for_deep_analysis(self):
        started=threading.Event()
        def analyze():
            for info in ANALYSIS_ENGINE.analyze(chess.Board(),2.5):started.set()
        with concurrent.futures.ThreadPoolExecutor() as pool:
            future=pool.submit(analyze);self.assertTrue(started.wait(3))
            begin=time.monotonic();result=PLAY_ENGINE.play(chess.Board(),1)
            self.assertLess(time.monotonic()-begin,1.8);self.assertTrue(result['ok']);future.result()

    def test_abandoned_analysis_releases_engine(self):
        stream=ANALYSIS_ENGINE.analyze(chess.Board(),4)
        next(stream);stream.close()
        self.assertTrue(list(ANALYSIS_ENGINE.analyze(chess.Board(),.15))[-1]['complete'])

    def test_terminal_and_black_perspective(self):
        mate=chess.Board()
        for move in ['f2f3','e7e5','g2g4','d8h4']:mate.push_uci(move)
        data=list(ANALYSIS_ENGINE.analyze(mate,.1))[-1]
        self.assertTrue(data['terminal']);self.assertEqual(data['result'],'0-1')
        # Black to move, but White has a decisive material advantage.
        board=chess.Board('4k3/8/8/8/8/8/8/3QK3 b - - 0 1')
        result=list(ANALYSIS_ENGINE.analyze(board,.2))[-1]
        pv=result['pvs'][0];self.assertTrue(pv.get('cp',0)>0 or pv.get('mate',0)>0)

    def test_remote_engine_interfaces_removed(self):
        for path in ['/api/remote/explorer/masters','/api/remote/chess.js','/api/remote/cloud-eval']:
            with self.assertRaises(HTTPError) as raised:self.request(path)
            self.assertEqual(raised.exception.code,404)


if __name__=='__main__':unittest.main(verbosity=2)
