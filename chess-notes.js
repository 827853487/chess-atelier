// Original practice notes, not attributed quotations or position-specific engine advice.
export const CHESS_NOTES = [
 ...`落子之前，先看看对手上一着改变了什么。
将军、吃子、威胁，可以作为计算的起点。
好棋也需要一个合适的时机。
有时最有力的一步，是让最差的棋子找到工作。
中心不仅是一块地方，也是一组路线。
计划可以改变，王的安全始终值得检查。
先找到对手的想法，再决定自己的计划。
交换之前，看看交换后谁更活跃。
兵不能后退，推进前多看一眼身后的格子。
开放线的价值，常常取决于谁能先进入。
计算得慢一点，常能少走一次回头路。
一盘棋的故事，不只写在吃掉的棋子上。
优势需要耐心，劣势需要韧性。
没有直接威胁时，可以改善棋子的配合。
落子后留下的空格，也属于这步棋的一部分。
让每一枚棋子，都能看见同伴。
多问一句：对方最强的应手是什么？
看见好棋之后，仍可以寻找更好的选择。
短暂的安静，可能是重新布局的机会。
防守不是等待，也可以是在准备反击。
双象喜欢空间，马往往需要一个稳固的落脚点。
兵形决定路线，子力决定节奏。
一个被忽略的后排，可能比多出的兵更重要。
把注意力留给局面，而不是刚才的遗憾。
在残局里，王也可以走到舞台中央。
通路兵的价值，还要看它能否得到支持。
换后之后，再重新判断王的位置。
胜势之中，仍要检查对手最后的反击。
守和的资源，有时藏在逼和与重复局面里。
每次兵的交换，都可能打开一条新的线。
马的前哨，最好有兵与同伴共同照应。
不要只计算自己的进攻，也计算对手的回手。
一条斜线的尽头，也许正站着对方的王。
后走得很远，未必比轻子配合走得更好。
先检查悬空的棋子，再构想遥远的计划。
争夺空间时，也要为棋子留下退路。
开放中心之前，比较双方王的位置。
堵住一条路线，有时比追赶棋子更有效。
残局中的一步等待，可能改变整个局面。
学一盘名局，不妨先猜一猜大师的下一着。
同一个局面，可以从双方的视角各看一次。
记录一个疑问，常比背下一串着法更有价值。
复盘时，先寻找转折，再寻找答案。
别急着模仿妙手，先理解它成立的条件。
吃子是一种选择，保持压力也是一种选择。
多一兵时，可以考虑简化，也要注意剩下的兵形。
异色象残局里，活动性与王的安全仍然重要。
车后的通路兵，常常比眼前的一次将军更值得留意。
计算到局面安静下来，判断往往更清楚。
对手留给你的弱点，需要合适的棋子才能利用。
保住主动权，有时比立即收回一个兵更重要。
局面复杂时，先梳理最直接的威胁。
没有必要让每一步都显得惊人。
一着朴素的防守，也可以是整盘棋的关键。
棋盘上最安静的格子，有时藏着最好的路线。
不要把开局原则，当成不必计算的理由。
王车易位之前，仍要观察两翼的危险。
被将军时，比较走王、吃子与挡住攻击线的选择。
子力领先时，仍要留心自己的王是否暴露。
残局不只计算距离，也计算轮到谁走。
多给自己一次检查，会少给对手一次机会。
一盘棋可以结束，一个好问题可以继续研究。
研究棋谱时，停在你不理解的那一着。
耐心也是棋盘上的一种力量。
把复杂局面拆成几组小问题。
先看棋子，再看格子，最后看它们之间的联系。
优势不是终点，而是下一段计划的起点。
尝试解释一着棋，比只记住它更容易留下印象。
走得自然之前，先确认它走得安全。
当你不知道做什么时，看看哪枚棋子最需要帮助。`.split('\n').map(text=>({text})),
 {text:'A quiet move can carry a clear idea.',translation:'安静的一着，也可以承载清晰的想法。'},
 {text:'Before you move, ask what changed.',translation:'落子之前，先问局面发生了什么变化。'},
 {text:'Give your least active piece a better square.',translation:'为最不活跃的棋子，找一个更好的格子。'},
 {text:'A plan begins with the position in front of you.',translation:'计划，始于眼前的局面。'},
 {text:'Count the reply, not just the threat.',translation:'既看自己的威胁，也计算对手的应手。'},
 {text:'The king becomes a traveller in the endgame.',translation:'到了残局，王也可以成为远行者。'},
 {text:'An open file is an invitation, not a guarantee.',translation:'开放线提供机会，但并不保证优势。'},
 {text:'Make room for every piece to take part.',translation:'为每枚棋子留下参与战斗的空间。'},
 {text:'A good defence keeps asking questions.',translation:'好的防守，也不断向对手提出问题。'},
 {text:'Look once more before the final move.',translation:'在最后落子之前，再检查一次。'},
 {text:'Study the turning point, not only the result.',translation:'研究转折，不只关注结果。'},
 {text:'Patience can turn a small edge into a lasting one.',translation:'耐心，可以让微小优势变得持久。'}
];

export function setupRestNotes(){
 const rest=document.querySelector('#analysis-rest'),text=document.querySelector('#chess-note'),translation=document.querySelector('#chess-note-translation');
 let index=-1;
 function next(){
  let pick=Math.floor(Math.random()*(CHESS_NOTES.length-(index>=0?1:0)));
  if(index>=0&&pick>=index)pick++;
  index=pick;const note=CHESS_NOTES[index];
  text.textContent=note.text;text.lang=note.translation?'en':'zh-CN';
  translation.textContent=note.translation?'（'+note.translation+'）':'';translation.hidden=!note.translation;
 }
 rest.addEventListener('dblclick',event=>{event.preventDefault();next();});
 rest.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();next();}});
 next();return next;
}
