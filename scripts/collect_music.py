"""Vendor documented Wikimedia Commons recordings as browser-compatible MP3.

Maintenance only: python scripts/collect_music.py --ffmpeg <ffmpeg executable>
The website never calls this script. Recording permissions, not only composition
ages, are checked. MP3s retain each original recording's license and attribution.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import html
import json
from pathlib import Path
import re
import subprocess
import tempfile
import time
from urllib.parse import urlencode, quote, urlsplit, urlunsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'assets/music'
USER_AGENT = 'ChessAtelier/1.2 (+https://github.com/827853487/chess-atelier; licensed recording collection)'
# Filename, display title, composer, era, performer, attribution credit.
SPECS = [
 ('Bach Sinfonien01.ogg', '巴赫 · 三部创意曲 No.1，BWV 787', '巴赫', 'baroque', 'Randolph Hokanson', 'Randolph Hokanson; Al Goldstein collection, Pandora Music / ibiblio.org'),
 ('Bach Sinfonien02.ogg', '巴赫 · 三部创意曲 No.2，BWV 788', '巴赫', 'baroque', 'Randolph Hokanson', 'Randolph Hokanson; Al Goldstein collection, Pandora Music / ibiblio.org'),
 ('Vivaldi - Four Seasons 1 Spring mvt 2 Largo - John Harrison violin.oga', '维瓦尔第 · 四季《春》第二乐章', '维瓦尔第', 'baroque', 'John Harrison；Robert Turizziani；Wichita State University Chamber Players', 'Recording copyright John Harrison; violin John Harrison, conductor Robert Turizziani, Wichita State University Chamber Players'),
 ('Vivaldi - Four Seasons 2 Summer mvt 3 Presto - John Harrison violin.oga', '维瓦尔第 · 四季《夏》第三乐章', '维瓦尔第', 'baroque', 'John Harrison；Robert Turizziani；Wichita State University Chamber Players', 'Recording copyright John Harrison; violin John Harrison, conductor Robert Turizziani, Wichita State University Chamber Players'),
 ('Divertimento in E-flat major - KV 113 - 1st movement.oga', '莫扎特 · 降E大调嬉游曲 K.113 第一乐章', '莫扎特', 'classical', 'Tsumugi Orchestra；Takashi Inoue', 'The Tsumugi Orchestra, conducted by Takashi Inoue; recorded 15 August 2010, Fukuoka City Children’s Science and Culture Center Hall'),
 ('Divertimento in F major, K. 138 (125c) - 1st movement.oga', '莫扎特 · F大调嬉游曲 K.138 第一乐章', '莫扎特', 'classical', 'Tsumugi Orchestra；Takashi Inoue', 'The Tsumugi Orchestra, conducted by Takashi Inoue; recorded 15 August 2010, Fukuoka City Children’s Science and Culture Center Hall'),
 ('Wolfgang Amadeus Mozart - Flute Quartet No. 1 in D Major - 2. Adagio.ogg', '莫扎特 · D大调长笛四重奏 K.285 第二乐章', '莫扎特', 'classical', 'Felix Skowronek；Philadelphia Quartet', 'Felix Skowronek with the Philadelphia Quartet; Al Goldstein collection, Pandora Music / ibiblio.org'),
 ('Beethoven Moonlight 2nd movement.ogg', '贝多芬 · 月光奏鸣曲 第二乐章', '贝多芬', 'classical', 'Bernd Krueger（数码钢琴录制）', 'Bernd Krueger; piano-midi.de; created in MIDI and recorded from a digital piano'),
 ('Chopin-Berceuse.ogg', '肖邦 · 摇篮曲 Op.57', '肖邦', 'romantic', 'Veronica van der Knaap', 'Veronica van der Knaap; public concert, Christchurch, New Zealand'),
 ('Brahms Intermezzo Op. 76 No. 7.ogg', '勃拉姆斯 · 间奏曲 Op.76 No.7', '勃拉姆斯', 'romantic', 'Dysprosia', 'Copyright © Dysprosia; redistribution under the accompanying BSD notice'),
 ('Chopin Impromptus Op.29, JMC, Han.ogg', '肖邦 · 第一即兴曲 Op.29', '肖邦', 'romantic', 'Jason M. C., Han', 'Jason M. C., Han; own recording published on Wikimedia Commons'),
 ('Edvard-Grieg-Lyric-Pieces-Op-65 -No-6-Wedding-Day-at-Troldhaugen.ogg', '格里格 · 特罗尔豪根的婚礼日 Op.65 No.6', '格里格', 'romantic', 'Harald Vetter', 'Harald Vetter; recording made available through IMSLP / Wikimedia Commons'),
 ('Claude Debussy - 2nd Arabesque (JMC, Han).oga', '德彪西 · 第二阿拉伯风格曲', '德彪西', 'modern', 'Jason M. C., Han', 'Jason M. C., Han; own recording, 11 July 2017'),
 ('Claude Debussy - I Livre Prelude VIII... (...La fille aux cheveux de lin) - Patrizia Prati.ogg', '德彪西 · 亚麻色头发的少女', '德彪西', 'modern', 'Patrizia Prati', 'Patrizia Prati, piano; live performance at Museum of Romanticism, Madrid'),
 ('Kevin MacLeod - Erik Satie Gymnopedie No 1.ogg', '萨蒂 · 第一吉姆诺佩迪', '萨蒂', 'modern', 'Kevin MacLeod', 'Erik Satie: Gymnopedie No 1 by Kevin MacLeod'),
 ("Ravel Duo Campion-Vachon Ma Mere l'oye 1 Pavane de la Belle au bois dormant.OGG", '拉威尔 · 鹅妈妈《睡美人的帕凡舞曲》', '拉威尔', 'modern', 'Duo Campion/Vachon', 'Duo Campion/Vachon; piano duet interpretation'),
]
ERAS = {'baroque': '巴洛克', 'classical': '古典', 'romantic': '浪漫', 'modern': '近现代'}
ALLOWED = {'Public domain', 'CC0', 'CC BY 3.0', 'CC BY 4.0', 'CC BY-SA 2.0',
           'CC BY-SA 2.0 de', 'CC BY-SA 2.5', 'CC BY-SA 3.0', 'CC BY-SA 4.0', 'BSD'}
LICENSE_IDS = {'Public domain': 'LicenseRef-Public-Domain', 'CC0': 'CC0-1.0',
    'CC BY 3.0': 'CC-BY-3.0', 'CC BY 4.0': 'CC-BY-4.0',
    'CC BY-SA 2.0': 'CC-BY-SA-2.0', 'CC BY-SA 2.0 de': 'LicenseRef-CC-BY-SA-2.0-DE',
    'CC BY-SA 2.5': 'CC-BY-SA-2.5', 'CC BY-SA 3.0': 'CC-BY-SA-3.0',
    'CC BY-SA 4.0': 'CC-BY-SA-4.0', 'BSD': 'BSD-3-Clause'}


def fetch(url, cap=25_000_000):
    for attempt in range(5):
        try:
            with urlopen(Request(url, headers={'User-Agent': USER_AGENT}), timeout=45) as response:
                raw = response.read(cap + 1)
            if len(raw) > cap:
                raise ValueError('Remote file exceeded size bound')
            return raw
        except OSError as exc:
            if attempt == 4:
                raise
            retry_after = exc.headers.get('Retry-After', '') if isinstance(exc, HTTPError) else ''
            pause = max(60, int(retry_after) if retry_after.isdigit() else 60) if isinstance(exc, HTTPError) and exc.code == 429 else 3 * (attempt + 1)
            print(f'Download temporarily unavailable ({type(exc).__name__}); retrying in {pause}s.', flush=True)
            time.sleep(pause)


def metadata():
    query = urlencode({'action': 'query', 'format': 'json', 'formatversion': '2',
        'titles': '|'.join('File:' + spec[0] for spec in SPECS),
        'prop': 'imageinfo|revisions', 'rvprop': 'ids',
        'iiprop': 'url|size|mime|sha1|extmetadata'})
    data = json.loads(fetch('https://commons.wikimedia.org/w/api.php?' + query))
    return {page['title'][5:]: page for page in data['query']['pages']}


def plain(value):
    return html.unescape(re.sub('<[^>]*>', '\n', value)).strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ffmpeg', required=True)
    parser.add_argument('--source-cache', type=Path)
    args = parser.parse_args()
    ffmpeg = str(Path(args.ffmpeg).resolve())
    version = subprocess.check_output([ffmpeg, '-version'], text=True).splitlines()[0]
    DEST.mkdir(parents=True, exist_ok=True)
    pages = metadata()
    audit = []
    fetched_at = datetime.now(timezone.utc).isoformat()
    progress_path = DEST / '.collection-progress.json'
    progress = json.loads(progress_path.read_text(encoding='utf-8')) if progress_path.exists() else {}
    with tempfile.TemporaryDirectory(prefix='chess-licensed-music-') as temporary:
        temporary = Path(temporary)
        assert temporary.resolve().is_relative_to(Path(tempfile.gettempdir()).resolve())
        assert temporary.name.startswith('chess-licensed-music-')
        cache = args.source_cache.resolve() if args.source_cache else temporary
        cache.mkdir(parents=True, exist_ok=True)

        def collect(index_spec):
            index, spec = index_spec
            original, title, composer, era, performer, credit = spec
            if original in progress:
                prior = progress[original]
                path = DEST / prior['file']
                if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == prior['sha256']:
                    prior['licenseId'] = LICENSE_IDS[prior['license']]
                    print('Reusing verified', prior['file'], flush=True)
                    return index, prior
            page = pages[original]
            info = page['imageinfo'][0]
            meta = info['extmetadata']
            license_name = meta['LicenseShortName']['value']
            if license_name not in ALLOWED:
                raise ValueError('Unreviewed recording license: ' + license_name)
            license_url = meta.get('LicenseUrl', {}).get('value') or 'https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain'
            parts = urlsplit(info['url'])
            if parts.scheme != 'https' or parts.hostname != 'upload.wikimedia.org':
                raise ValueError('Untrusted audio origin')
            download = urlunsplit((parts.scheme, parts.netloc, parts.path, '', ''))
            source = cache / (str(index) + Path(original).suffix.lower())
            raw = source.read_bytes() if source.exists() else fetch(download)
            if len(raw) != info['size'] or hashlib.sha1(raw).hexdigest() != info['sha1']:
                raise ValueError('Original audio differs from Commons metadata: ' + original)
            if not raw.startswith((b'OggS', b'ID3', b'\xff')):
                raise ValueError('Not a recognized audio container: ' + original)
            source.write_bytes(raw)
            name = f'{era}-{index + 1:02d}.mp3'
            target = DEST / name
            result = subprocess.run([ffmpeg, '-nostdin', '-hide_banner', '-y', '-i', str(source),
                '-map_metadata', '-1', '-vn', '-c:a', 'libmp3lame', '-b:a', '96k',
                '-ar', '44100', '-ac', '2', str(target)], capture_output=True, text=True, encoding='utf-8', errors='replace')
            if result.returncode:
                raise RuntimeError(result.stderr[-1000:])
            duration = re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)', result.stderr)
            if not duration:
                raise ValueError('No decoded duration: ' + original)
            hours, minutes, seconds = map(float, duration.groups())
            seconds += hours * 3600 + minutes * 60
            if not 45 <= seconds <= 720:
                raise ValueError('Unexpected duration: ' + original)
            mp3 = target.read_bytes()
            record = {'file': name, 'title': title, 'composer': composer, 'era': era,
                'performer': performer, 'credit': credit, 'license': license_name,
                'licenseId': LICENSE_IDS[license_name],
                'licenseUrl': license_url, 'sourceUrl': 'https://commons.wikimedia.org/wiki/File:' + quote(original.replace(' ', '_')),
                'originalFile': original, 'downloadUrl': download, 'duration': round(seconds, 2),
                'bytes': len(mp3), 'sha256': hashlib.sha256(mp3).hexdigest(),
                'originalBytes': len(raw), 'originalSha256': hashlib.sha256(raw).hexdigest(),
                'commonsSha1': info.get('sha1'), 'commonsPageId': page['pageid'],
                'commonsRevisionId': page.get('revisions', [{}])[0].get('revid'),
                'changeNote': 'Transcoded from the original recording to MP3, stereo 44.1 kHz / 96 kbit/s; complete recording, no cuts or musical edits.',
                'fetchedAt': fetched_at}
            if license_name == 'BSD':
                notice = plain(meta.get('Artist', {}).get('value', ''))
                if 'this software is provided' not in notice.lower() or 'Dysprosia' not in notice or 'Redistribution and use' not in notice:
                    raise ValueError('Incomplete BSD recording notice')
                notice = notice[notice.index('Copyright'):].split('http://opensource.org')[0].strip()
                notice = '\n'.join(line.strip() for line in notice.splitlines() if line.strip())
                (DEST / 'LICENSE-Dysprosia-BSD.txt').write_text(notice + '\n', encoding='utf-8')
                record['licenseNotice'] = 'LICENSE-Dysprosia-BSD.txt'
            print(name, f'{seconds:.0f}s', len(mp3), license_name, flush=True)
            progress[original] = record
            progress_path.write_text(json.dumps(progress, ensure_ascii=False, indent=2), encoding='utf-8')
            time.sleep(1.2)
            return index, record

        rows = [collect(item) for item in enumerate(SPECS)]
        playlist = [record for _, record in rows]
    (DEST / 'playlist.json').write_text(json.dumps(playlist, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    audit = {'provider': 'Wikimedia Commons', 'fetchedAt': fetched_at, 'encoder': version,
        'encoding': 'MP3, stereo, 44100 Hz, 96 kbit/s; originals transcoded without cuts',
        'recordings': playlist}
    (DEST / 'source-metadata.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    total = sum(row['bytes'] for row in playlist)
    minutes = sum(row['duration'] for row in playlist) / 60
    lines = ['# 本地古典录音来源', '', f'共 {len(playlist)} 首完整录音/完整乐章，约 {minutes:.1f} 分钟，MP3 合计 {total:,} 字节。', '',
        '按作曲风格分为巴洛克、古典、浪漫、近现代，每时期 4 首。近现代涵盖德彪西、萨蒂与拉威尔，指作品时期，不表示录音年份。', '',
        '全部从 Wikimedia Commons 文件页核对录音本身的许可。作曲家不是演奏者；演奏者、录音署名、许可版本、原文件链接和校验值均分别保存。', '',
        '为兼容移动 Safari，转为 MP3 96 kbit/s、44.1 kHz 双声道；只转换编码，没有剪裁乐曲或改编音乐。转码文件沿用原录音许可，CC BY-SA 录音的改编权利继续按相同许可提供。', '',
        '| 时期 | 曲目 | 演奏/制作 | 录音许可 | 原始来源 |', '| --- | --- | --- | --- | --- |']
    for row in playlist:
        lines.append(f'| {ERAS[row["era"]]} | {row["title"]} | {row["performer"]} | [{row["license"]}]({row["licenseUrl"]}) | [Commons 文件页]({row["sourceUrl"]}) |')
    lines += ['', '## 分发与核验', '',
        '- `assets/music/playlist.json`：播放器目录，包含每首本地录音所需的署名、许可与来源。',
        '- `assets/music/source-metadata.json`：采集时间、转码版本、原始和本地 SHA-256、Commons 页面及修订 ID。',
        '- `assets/music/LICENSE-Dysprosia-BSD.txt`：Dysprosia 的勃拉姆斯演奏录音完整 BSD 版权、条件与免责声明；再分发该录音时必须一并保留。',
        '- 贝多芬《月光》第二乐章为 Bernd Krueger 制作并从数码钢琴录制的版本，已明确标注，没有冒称现场演奏。',
        '- 正常播放读取本站 MP3，不再依赖 Commons 实时下载；来源链接用于可追溯性。',
        '- 维护重新采集：`python scripts/collect_music.py --ffmpeg <ffmpeg路径>`；运行网站本身不需要 ffmpeg。', '']
    (ROOT / 'data/MUSIC_SOURCES.md').write_text('\n'.join(lines), encoding='utf-8')
    (DEST / 'README.txt').write_text('本目录含 16 首按录音许可再分发的古典音乐 MP3。\n完整署名、原文件、许可版本与校验值见 playlist.json、source-metadata.json 及 ../../data/MUSIC_SOURCES.md。\nDysprosia 的 BSD 录音须同时保留 LICENSE-Dysprosia-BSD.txt。\nMP3 仅重新编码，没有裁切或改编；不得将录音许可误解为整个网站的许可。\n', encoding='utf-8')
    progress_path.unlink(missing_ok=True)
    print(f'Completed {len(playlist)} recordings, {minutes:.1f} min, {total:,} bytes.', flush=True)


if __name__ == '__main__':
    main()
