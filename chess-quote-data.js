// Verified short extracts and original practice prompts. See data/CHESS_QUOTES.md.
// Translations below were written for this project, not copied from modern editions.
const QUOTE_SOURCES={
 capablanca:'https://www.gutenberg.org/files/33870/33870-h/33870-h.htm',
 franklin:'https://founders.archives.gov/documents/Franklin/01-29-02-0608',
 lasker:'https://archive.org/details/commonsenseinche00laskrich',
 zweig:'https://www.tha.de/homes/harsch/germanica/Chronologie/20Jh/Zweig/zwe_scha.html'
};
const VERIFIED_QUOTES=[
 {text:'The control of the centre is of great importance.',translation:'控制中心具有重要意义。',source:'卡帕布兰卡《国际象棋基础》§7',sourceUrl:QUOTE_SOURCES.capablanca,kind:'quote'},
 {text:'In all endings of this kind, care must be taken not to drift into a stale mate.',translation:'在这类残局中，必须留意不要走成逼和。',source:'卡帕布兰卡《国际象棋基础》§1（基础将杀）',sourceUrl:QUOTE_SOURCES.capablanca,kind:'quote'},
 {text:'It is generally advisable to advance the Pawn that is free from opposition.',translation:'通常应优先考虑推进前方没有对方兵阻挡的兵。',source:'卡帕布兰卡《国际象棋基础》§3',sourceUrl:QUOTE_SOURCES.capablanca,kind:'quote'},
 {text:'Naturally, these principles have sometimes to be modified to suit the exigencies of the position.',translation:'这些原则有时也须依照具体局面的要求作出调整。',source:'卡帕布兰卡《国际象棋基础》§14',sourceUrl:QUOTE_SOURCES.capablanca,kind:'quote'},
 {text:'the value of a piece can often be measured by the number of squares it commands.',translation:'一枚棋子的价值，常可由它控制的格子数量来衡量。',source:'卡帕布兰卡《国际象棋基础》§14（节选）',sourceUrl:QUOTE_SOURCES.capablanca,kind:'quote'},
 {text:'the co-operation of the King is needed.',translation:'王的协同是必要的。',source:'卡帕布兰卡《国际象棋基础》§1（基础将杀，节选）',sourceUrl:QUOTE_SOURCES.capablanca,kind:'quote'},
 {text:'The game of Chess is not merely an idle amusement.',translation:'国际象棋并不只是消遣。',source:'本杰明·富兰克林《棋之道德》',sourceUrl:QUOTE_SOURCES.franklin,kind:'quote'},
 {text:'For life is a kind of chess',translation:'因为人生也如同一盘棋。',source:'本杰明·富兰克林《棋之道德》（节选）',sourceUrl:QUOTE_SOURCES.franklin,kind:'quote'},
 {text:'Foresight, which looks a little into futurity',translation:'远见，使人向未来多看一步。',source:'本杰明·富兰克林《棋之道德》（节选）',sourceUrl:QUOTE_SOURCES.franklin,kind:'quote'},
 {text:'Caution, not to make our moves too hastily.',translation:'谨慎，不要过于仓促地落子。',source:'本杰明·富兰克林《棋之道德》（节选）',sourceUrl:QUOTE_SOURCES.franklin,kind:'quote'},
 {text:'persevering in the search of resources.',translation:'坚持寻找可用的办法。',source:'本杰明·富兰克林《棋之道德》（节选）',sourceUrl:QUOTE_SOURCES.franklin,kind:'quote'},
 {text:'common sense triumphs over trickery, and rightly so.',translation:'常识战胜了诡计，理当如此。',source:'伊曼纽尔·拉斯克《国际象棋常识》（节选）',sourceUrl:QUOTE_SOURCES.lasker,kind:'quote'},
 {text:'However, I do not ask you to believe me blindly.',translation:'不过，我并不要求你盲目相信我。',source:'伊曼纽尔·拉斯克《国际象棋常识》',sourceUrl:QUOTE_SOURCES.lasker,kind:'quote'},
 {text:'common sense tells us exactly how to proceed.',translation:'常识会告诉我们该如何着手。',source:'伊曼纽尔·拉斯克《国际象棋常识》（节选）',sourceUrl:QUOTE_SOURCES.lasker,kind:'quote'},
 {text:'An attack will direct itself in the first instance against your weakest points',translation:'攻击首先会指向你最薄弱的地方。',source:'伊曼纽尔·拉斯克《国际象棋常识》（第91页，节选）',sourceUrl:QUOTE_SOURCES.lasker,kind:'quote'},
 {text:'je mehr sich einer begrenzt, umso mehr ist er andererseits dem Unendlichen nah',translation:'一个人越是专注于狭窄的领域，另一方面便越接近无限。',source:'斯蒂芬·茨威格《象棋的故事》（叙述者谈专注，节选）',sourceUrl:QUOTE_SOURCES.zweig,kind:'quote'}
];

// Original prompts: these are not quotations and carry no historical attribution.
const ORIGINAL_PRACTICE_NOTES=`
开局时，先问新走出的棋子是否给下一枚棋子让出了路线。
过早出后之前，数一数对手能带着节奏攻击它的着法。
同一枚轻子走第二次前，看看其余棋子是否仍停在原位。
易位不是仪式；先确认易位一侧的兵形和开放线。
中心紧闭时，侧翼行动才更有时间慢慢展开。
选择开局变例时，也要考虑自己愿意进入哪种残局。
遇到陌生开局，不必先猜名字，先辨认中心兵形。
对手偏离主线时，重新检查具体威胁，而不是机械惩罚。
出子受阻时，找到挡路的那枚兵，再考虑它该怎样前进。
开局里的多一个兵，可能要用几个出子节奏交换。
王还在中央时，开线的收益应同时从双方角度计算。
棋子看似都已出动，也要确认两辆车是否能够互相照应。
边兵的推进也会改变主教的斜线，不只是增加侧翼空间。
开局准备可以记住分岔点，不必只记一长串答案。
面对弃兵，先比较接受后能否安全完成出子。
每次后与车排成一线，都值得检查是否存在串击。
双重攻击的目标未必是两枚棋子，也可能是棋子与将杀。
发现牵制后，确认被牵制的子是否真的不能离开。
吃子时先检查回吃是否打开了另一条攻击线。
计算闪击时，别忽略移开棋子的落点也可能带着威胁。
一枚棋子承担两项防守任务时，尝试分别攻击这两个目标。
交换防守子之前，确认自己是否仍有力量进入弱点。
诱离一个防守者之后，还要算它能否沿另一条路线返回。
将杀网中的逃生格，有时比被攻击的格子更值得注意。
逼迫对手走王之前，先确定王的新位置是否反而安全。
计算中间着时，暂缓习惯性的回吃，再列出所有将军。
底线战术不仅取决于有没有通气孔，也取决于重子能否侵入。
马的叉击常以一个将军为起点，先查看双方王与后的距离。
寻找组合时，把所有未被保护的棋子圈在心里。
漂亮的弃子需要具体后续，不能只靠对手看起来难受。
评价一枚马的站位，既看现在的控制格，也看它能否被兵驱赶。
好象与坏象的区别，往往藏在己方兵占据的颜色里。
交换对手最活跃的棋子，可能比立刻改善自己的棋子更有效。
一个永久弱点只有在能够接近时，才成为实际目标。
空间优势需要支撑；过多推进也可能留下难以保护的格子。
在封闭局面中，找出双方能够打开局面的兵突破。
开放线被争夺时，先计算进入格是否能站稳。
把车放上半开放线之后，寻找可供重子进入的横线。
局面没有弱点可攻时，可以考虑迫使对手作出一次选择。
两翼都有目标时，比较转移子力需要多少步。
限制对手的反击，常常能让自己的计划更容易执行。
交换之前，分别想象双方剩下的最强与最差棋子。
兵形固定之后，留意哪一种轻子更适合留下来。
不要只给格子命名，也要判断对手能否利用它。
一枚暂时退后的棋子，有时正在为更好的路线让路。
兵链的根部通常比最前端更容易受到持续攻击。
孤兵带来的开放线与活动力，可能补偿它的防守负担。
叠兵并不总是缺点；先看它们打开了什么路线。
形成远方通路兵之前，计算己王是否还能守住另一翼。
兵突破往往要求精确次序，不妨把三种推进顺序都试算。
留住一枚兵，有时能为残局保留关键的等着。
翼兵多数的价值，需要能够推进的空间来兑现。
向前推兵前，确定它留下的格子会不会成为对方据点。
锁住中心时，也许同时锁住了自己的主教。
兵交换能打开线，也能替对手修复一个结构弱点。
过路兵权利只在当下有效；把它纳入这一着的计算。
兵残局中，先画出双方王能否进入的关键格。
通路兵进入第七横线后，升变格的控制常比保护兵本身更急。
面对边兵残局，务必单独检查角落是否造成逼和。
兵越少，每次交换所改变的局面性质可能越大。
车残局里，活跃的车常能比被动守兵的车制造更多机会。
让王参与残局时，仍要先确认对方是否拥有连续将军。
车在通路兵后方的原则很有用，但要检查是否有具体战术例外。
兵残局中多出一个节奏，可能改变整个对王关系。
同色象残局里，尝试把对方的兵固定在己象能够攻击的颜色。
异色象残局不要过早判和，王的进入路线仍须计算。
后残局的第一项检查，是自己的王会不会遭到长将。
残局转化为兵残局之前，把最后一段算到明确结果。
车兵将杀时，先减少对方王的活动范围，再靠近自己的王。
单后将杀时，为对方的王留意至少一个合法着法，避免逼和。
弱升变不仅为了战术，有时也是避免立即逼和的办法。
守残局时，可以把目标缩小为建立一个可重复维持的阵形。
领先一兵不代表可以忽略活跃度；交换前先比较剩余子力。
残局中的横向防守和侧面将军，常能比正面阻挡更灵活。
一旦进入熟悉的基本残局，先认出模型，再计算具体细节。
计算候选着法时，先写出两到三种真正不同的想法。
一条变化算到局面安静时，再停下来评价结果。
别把对手的自然应手当作唯一应手，专门寻找它的反击。
计算的最后一着也要做一次漏着检查。
连续强制着法结束后，重新清点双方子力与王的安全。
如果分支越来越乱，回到起点核对第一着的必要性。
想象棋盘时，特别留心已经移开的兵和新打开的斜线。
只有当局面确实相同，才能把两条变化合并计算。
估计一个计划之前，先数清它需要几着无强制性的准备。
候选着法难以区分时，比较哪一着给对手留下的选择更少。
将军不一定是最佳着法，但值得作为强制分支优先核对。
进攻需要计算终点；防守同样需要计算终点。
考虑重复局面时，把行棋方和易位权也纳入比较。
一条看似赢子的变化，可能在最后遇到逼和或长将。
停止计算之前，问一句：对方是否还有更强的将军？
防守时先区分真正的威胁与只让人不舒服的姿态。
对方准备进攻时，寻找能迫使其分心保护的目标。
主动交换一枚攻击子，有时比增加第三个防守者更省力。
遇到猛烈进攻，不妨先确认对手是否已经投入足够子力。
王的逃跑路线也可以提前准备，而不是等到被将军才找。
必须让步时，选择最容易恢复或最难被利用的弱点。
劣势局面中的每一着，都可以争取增加对手的技术难度。
防守要寻找资源，不必急着证明自己此前没有下错。
对手在一翼集中子力时，检查另一翼是否存在及时的突破。
不要因为一枚棋子被攻击，就自动移动它；也许有更强的反击。
阻挡进攻线时，比较挡线子是否还会继续受到攻击。
防守阵形的稳固程度，也取决于有没有足够的等待着法。
用将军争取节奏之前，确保不会把对方的王送到更好的格子。
守住一个威胁后，立即确认有没有新产生的第二个威胁。
顽强并不等于拒绝交换；有些简化正是守和的机会。
复盘可以先找最早的计划分歧，而不是只找最后的漏子。
先写下自己的判断，再查看引擎，比较才会更具体。
分析一盘大师棋时，可以在关键局面遮住后续着法。
同一开局看两盘不同兵形的实战，比只背一条长主线更有帮助。
把反复出错的局面按原因分类，而不是只记输赢。
复习一题时，试着解释为什么其他自然着法不行。
发现更好着法后，再找出它解决了自己原方案的哪个问题。
结束复盘时，带走一条下次能够执行的检查习惯。
一个引擎首选不是完整解释，继续观察它后续要求怎样配合。
比较候选线时，先确认分析的起点与行棋方一致。
评估值的轻微变化，不必立刻解释为一次明显失误。
学习残局时，可以从同一阵形更换行棋方再练一次。
重新做一题前，先独立回忆思路，而不是直接回忆答案。
研究开局时，为每个关键兵突破配上一盘示范对局。
PGN 能保存主线；重要的思考也可以另外写下自己的短笔记。
输掉上一盘，不必把急于追回的心情带进下一盘。
发现漏着之后，先检查当前局面，机会并没有因此自动消失。
用掉很多时间的一步，落子前仍值得做最后一次检查。
优势时可以放慢确认，劣势时也保留清醒判断的节奏。
不熟悉的局面是学习材料，不是必须立即摆脱的错误。
不要让刚看到的精彩战术遮住对手眼前的简单威胁。
面对名气更大的对手，仍然只需处理棋盘上的这一步。
一盘棋中的耐心，不是永远等待，而是愿意为计划做准备。
走出被迫的一着之后，把注意力重新放回可选择的未来。
如果思绪被结果占满，就回到棋子、格子和具体应手。
暂时看不见计划时，先确认最需要改善的是哪一枚棋子。
每盘棋都可以有一个小目标，例如少漏一条长斜线。
复盘自己的胜局，也能发现被结果掩盖的问题。
对手的好棋值得记录；它也是下一次训练的题目。
清楚地理解一个基本局面，比模糊地看过十个更可靠。
看谱时先认出上一着改变的线路，再按下一步。
在大师对局中暂停一次，自己决定何时交换后。
回放到转折点时，比较双方最差棋子的命运。
遇到漂亮组合，往前退几着，找出它赖以成立的准备。
收藏一盘棋时，可以给自己留下再次观看的理由。
分析关闭时的棋句是一般提示，不能代替当前局面的计算。
观察同一兵形的多盘棋，可以分清常见计划与偶然战术。
从中间续走参考谱时，先确认当前行棋方和起始局面。
放映可以帮助看整体，逐着暂停更适合练习独立判断。
如果一盘棋显得过于复杂，先只追踪双方的中心兵。
下一轮观看，可以改为追踪某一枚马如何找到据点。
研究将杀局时，数清限制逃生格的每一枚棋子。
不要把参考主线当成唯一合法答案，其他候选仍可独立检验。
将一段残局从双方视角各走一遍，会更容易记住防守资源。
学完一个主题后，回到完整实战中寻找它出现的条件。
`.trim().split('\n').map(text=>({text,kind:'note'}));

export const CHESS_QUOTE_DATA=[...VERIFIED_QUOTES,...ORIGINAL_PRACTICE_NOTES];
