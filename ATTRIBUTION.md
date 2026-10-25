# 素材、代码与外部数据来源

- **本地字形棋子 SVG（经典、简约共 24 枚）**：提取 DejaVu Sans（Bitstream Vera / DejaVu 字体授权）、FreeSerif（GNU GPL 及字体例外）、Noto Sans Symbols 2（SIL Open Font License 1.1）中现有国际象棋 Unicode 字形的矢量轮廓，重新标准化 SVG 画布与尺寸。经典白子采用相应实心字形轮廓，重新设置近白填充和深色描边；六套主题为配色衍生版本。包内不包含原始字体文件；原著作者及适用的源字体许可继续有效。界面风格名称及素材目录标识不表示对其他人同名 Chessnut 等棋子原作品的重分发。
- **备用棋子**：Font Awesome Free（CC BY 4.0），https://fontawesome.com/license/free 。
- **浏览器棋规**：项目内置的 `vendor/chess.js`，提供合法着法、SAN 与 PGN；本次修正了 FEN 起始回合、PGN 转义和结果处理。
- **本地棋规及 UCI 桥接**：python-chess，GPL-3.0-or-later，https://github.com/niklasf/python-chess 。通过 Python 依赖安装，不从 CDN 加载。
- **本地分析和人机对弈**：Stockfish 19，GPLv3，https://stockfishchess.org/ ，https://github.com/official-stockfish/Stockfish 。使用用户提供的官方 Windows universal 程序，未修改引擎；`engines/Copying.txt`、`engines/AUTHORS`、`engines/Stockfish-README.md` 保留许可和署名。项目根目录原始 `stockfish-windows-x86-64-universal.zip` 包含对应源码 `stockfish/src/`、编译脚本及说明，分发本软件时请一并保留。
- **公开开局谱系**：https://github.com/lichess-org/chess-openings ，CC0。
- **大师棋谱**：https://github.com/brianerdelyi/ChessPGN ，CC0 标注；https://github.com/usefulmove/chessdb ，只提取事实性对局着法，不转载原作者文字注释。
- **新增经典赛事及专题棋谱**：[PGN Mentor 公开下载库](https://www.pgnmentor.com/files.html)、[usefulmove/chessdb](https://github.com/usefulmove/chessdb)。仅保留赛事、棋手、日期、结果、FEN 与合法主线；去除现代文字注释、变例和 NAG。实战残局由这些比赛和原有本地棋谱截取，保留原赛事、轮次、起始半回合等信息，不将其宣称为新比赛。逐合集来源、采集时间及 SHA-256 记录见 `data/library-sources.json`，汇总见 `data/LIBRARY_SOURCES.md`。
- **开局实战增补**：从 PGN Mentor 的十个开局 ZIP 谱库筛选 960 盘具名完整对局，覆盖九个开局合集。只保留事实性标签及主线；与原有本地主线去重。旧伦敦谱中的 30 条匿名内容改作「伦敦体系示范片段」，不再标作真实比赛。
- **大师棋手增补**：从 [PGN Mentor](https://www.pgnmentor.com/files.html) 收录卡斯帕罗夫本次谱源中合格的 2,126 盘及其他九位棋手的 1,400 盘年代精选；保留事实性标签与标准棋主线，移除文字讲解。
- **经典教材整理谱**：卡帕布兰卡《Chess Fundamentals》，原书参考 [Project Gutenberg #33870](https://www.gutenberg.org/ebooks/33870)；局面及主线来自 [lordlinks/Chess_Fundamentals](https://github.com/lordlinks/Chess_Fundamentals) 链接的两份公开整理谱，该项目标注 CC0。保留章节与出处，不打包整段原书或整理者注释；1 处错误易位标记的规范化有独立记录。
- **分级专题练习**：[Lichess 公开数据库](https://database.lichess.org/#puzzles)，CC0-1.0；本地收录 776 道、26 个主题。保留原始题目 ID、来源链接及原始 CSV 子集，先应用准备着后建立练习局面，分析仅由本机 Stockfish 提供。
- **关闭分析时的短句**：`chess-notes.js` 内含 82 条原创练习短句与常规提示，包括 12 条带中文翻译的英文短句；未冒用棋手名言署名，也不作为当前局面的引擎结论。
- **局面分析**：仅使用本机 Stockfish；已移除远程局面引擎和 Opening Explorer 接口。
- **公网浏览器引擎**：[Stockfish.js 19.0.1](https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.1)，Nathan Rugg、Stockfish 团队及贡献者，GPL-3.0。原样分发 lite-single JS/WASM，浏览器内计算，不调用远程棋力服务；较小网络与原生完整版强度不同。固定发行版源码、构建脚本、AUTHORS、GPL 和运行文件摘要均在 `vendor/stockfish/`，对应源码包可与运行文件从同一站点下载。
- **古典录音**：Wikimedia Commons，https://commons.wikimedia.org/wiki/Category:Audio_files_of_classical_music 。每条录音的著作权、演奏者与授权以其文件页面为准；项目未捆绑录音。
- **字体**：网站优先使用操作系统已有的中文无衬线字体。若能联网加载 Google Fonts 使用者需遵循对应字体许可；项目没有分发字体文件。
- **视觉原则**：参考 Google Material Design 3 的布局、触控目标及状态反馈原则，但没有声称由 Google 设计或使用其官方组件库。

- **本地音乐目录**：`assets/music/playlist.json` 默认为空。由使用者自行加入拥有合法使用许可的录音。

- **雅致 SVG 棋子**：沿用早前版本项目内的 Fantasy 棋子素材；其原始文件应按项目所列来源和适用许可使用。
