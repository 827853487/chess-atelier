# 棋句与引语来源

此文件对应 `chess-quote-data.js`。新增内容为 **16 条可核对的短引语、150 条原创练习提示**。原有 `chess-notes.js` 中的练习提示由界面模块另行合并；本文件不实现随机队列或持久化。

## 数据格式

导出 `CHESS_QUOTE_DATA` 对象数组：`text` 原文、`translation` 项目自译中文（若有）、`source` 简短出处、`sourceUrl` 可核验链接、`kind` 类型。引语为 `quote`，原创提示为 `note`。界面应将译文和出处分别换行，出处不能挤进正文。原创提示没有棋手署名，也不冒称引擎对当前局面的结论。

引用的英语与德语译文由本项目自行撰写，不转载当代商业译本。保留原文语气与适用范围；小写开头的条目是原句中的连续节选，出处已标“节选”。不使用无法核验的网络“某棋手名言”。

## 卡帕布兰卡：6 条

原文：[Chess Fundamentals](https://www.gutenberg.org/files/33870/33870-h/33870-h.htm)，正文初版 1921，作者 José Raúl Capablanca；Gutenberg #33870。使用该历史正文的短摘句，不转载现代注释。

| 内容识别 | 位置 |
| --- | --- |
| The control of the centre… | §7 Control of the Centre |
| In all endings of this kind… | §1 Some Simple Mates，双象基础将杀段落 |
| It is generally advisable to advance… | §3 Pawn Endings，例10 |
| Naturally, these principles… | §14 The Relative Value of Knight and Bishop |
| the value of a piece… | §14，同色格兵与象活动性段落，连续节选 |
| the co-operation of the King… | §1，基础将杀总结，连续节选 |

这些是历史作者的教学原则，保留“usually / generally / sometimes”等限定的含义，不将其改为对所有局面都成立的绝对规则。基础将杀中的王协同不应误读为开局应立即出王。

## 富兰克林：5 条

原文：[“The Morals of Chess,” before 28 June 1779](https://founders.archives.gov/documents/Franklin/01-29-02-0608)，美国国家档案馆 Founders Online。页面所引历史正文重刊自 1786 年 12 月《The Columbian Magazine》；网站现代编者说明没有用于提示正文。

使用“not merely an idle amusement”、人生如棋、远见、谨慎及坚持寻找资源五处连续短摘句。较长句只摘一段时标注“节选”；不把本杰明·富兰克林误列为国际象棋世界冠军。

## 伊曼纽尔·拉斯克：4 条

原始扫描：[Common Sense in Chess，J. S. Ogilvie 旧版](https://archive.org/details/commonsenseinche00laskrich)。核对用的[同版 OCR](https://archive.org/download/commonsenseinche00laskrich/commonsenseinche00laskrich_djvu.txt)可搜索对应原文；[Wikimedia Commons 的扫描说明](https://commons.wikimedia.org/wiki/File:Common_sense_in_chess_(IA_commonsenseinche00laskrich).pdf)将此历史版本列为公版。

四处摘句分别讨论常识胜过诡计、不要求学生盲信、常识指引思考，以及攻击弱点（印刷页91）。清除了 OCR 中的跨页页码、换行和断词，不引用现代改写版的新增讲解。作者是 **Emanuel Lasker（伊曼纽尔·拉斯克）**，不是另一位作者 Edward Lasker。

## 茨威格：1 条

德文原文：[Bibliotheca Augustana《Schachnovelle》](https://www.tha.de/homes/harsch/germanica/Chronologie/20Jh/Zweig/zwe_scha.html)，Stefan Zweig，1942。位置为叙述者听完岑托维奇经历后谈及专注与“无限”的段落，原版页19附近。

采用连续短节选“je mehr sich einer begrenzt, umso mehr ist er andererseits dem Unendlichen nah”，附本项目中文自译。它来自小说叙述者对偏执型专注的复杂观察，不是棋手赛后发言，也不应脱离原作而当作鼓励极端沉迷的健康建议。不采用现代中文商业译本，也没有搬运小说长段落。

## 原创提示：150 条

十组各15条，覆盖开局、战术、战略与子力活动、兵形、残局、计算、防守、复盘与引擎、心态、打谱学习。均为针对学习过程撰写的独立提示，不用词语替换批量拼装“名言”；不附虚构作者。

随机展示应使用完整洗牌袋而非每次独立随机：一轮中不重复，耗尽后再洗牌，并避免两轮交界连续相同。可以持久化尚未展示的索引，但合并旧库后应按内容 ID 或稳定文本映射，避免更新条目顺序造成误认。界面关闭分析或双击更换时再取下一条，不要因每一步棋触发重抽。
