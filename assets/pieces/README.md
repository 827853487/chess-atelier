# Lichess 棋子原图与授权

这四套 SVG 直接来自 [lichess-org/lila](https://github.com/lichess-org/lila)，固定提交 `e1ebe0e4b25bbd83c4524fbb3207c5dad6ff688a`。各目录中的 12 枚原始 SVG 未作修改；下载地址、SHA-256 和字节数记录于 `manifest.json`。上游授权原文保存在 `LICHESS-COPYING.md`。

| 界面名称 | 原始套装 | 作者 | 许可 |
| --- | --- | --- | --- |
| 经典（默认） | Cburnett | Colin M. L. Burnett | [GPL-2.0-or-later](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html) |
| 拟真 | Maestro | sadsnake1 | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) |
| 极简 | Mpchess | Maxime Chupin | [GPL-3.0-or-later](https://www.gnu.org/licenses/gpl-3.0.html) |
| 抽象 | Totoy | Kosal Sen | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

Maestro 素材及其配色衍生版本只用于非商业用途，并须署名、以相同许可共享；项目公开源码并不取消此项素材限制。各素材的许可分别适用，不能将其全部宣称为 CC0 或任意商用。

`scripts/import_lichess_pieces.py` 复现原图下载；`scripts/build_piece_themes.py` 从原图生成 `assets/pieces-themed/` 下六种主题色版本。只改变颜色属性，保留作者的路径、描边宽度、连接方式、内部细节、渐变与过滤器。拟真黑子的中间色压暗以提高棋盘对比度，仍保留原始渐变层次。衍生 SVG 内均注有作者、许可、精确来源和改动说明。运行时只加载本地 SVG，不用 CSS 强改 fill/stroke，不用其他字形替代图案。

Logo 的纯色马剪影取 Cburnett 黑马的两个外轮廓路径（移除内部亮色细节），GPL-2.0-or-later；尺寸保持 29 px。

本目录附许可全文 `GPL-2.0.txt`、`GPL-3.0.txt`、`CC-BY-NC-SA-4.0.txt`、`CC-BY-4.0.txt`。配色衍生版沿用对应原素材许可。
