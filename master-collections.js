import { EXTRA_SCORE_PACKS } from './extra-collections.js';
// 本地内置棋谱合集。文件位于 data/complete/，打开页面后即可阅读，无需逐个载入。
export const SCORE_PACKS = [
 ...EXTRA_SCORE_PACKS.filter(p=>p.id==='kasparov-career'),
 {id:'morphy-anderssen',label:'莫菲与安德森',group:'masters',file:'morphy-anderssen.pgn'},
 {id:'fischer',label:'菲舍尔名局',group:'masters',file:'fischer.pgn'},
 {id:'tal',label:'塔尔名局',group:'masters',file:'tal.pgn'},
 {id:'alekhine',label:'阿廖欣名局',group:'masters',file:'alekhine.pgn'},
 {id:'capablanca-1924',label:'卡帕布兰卡（纽约1924）',group:'masters',file:'capablanca-1924.pgn'},
 {id:'chess-classics',label:'世界名局',group:'masters',section:'名局选集',file:'chess-classics.pgn'},
 {id:'book-of-favorites',label:'名局佳作',group:'masters',section:'名局选集',file:'book-of-favorites.pgn'},
 {id:'instructive',label:'经典教学对局',group:'training',section:'教学实战',file:'instructive.pgn'},
 {id:'logical-chess',label:'逻辑棋谱',group:'training',section:'教学实战',file:'logical-chess.pgn'},
 ...EXTRA_SCORE_PACKS.filter(p=>p.id!=='kasparov-career')
];
export const VIRTUAL_PACKS = [
 {id:'openings',label:'开局示范',group:'openings'},
 {id:'tactics',label:'战术范例',group:'training',section:'主题练习'},
 {id:'endings',label:'残局练习',group:'training',section:'主题练习'}
];
export const PACK_GROUPS = [
 {id:'openings',label:'开局学习',allLabel:'全部开局'},
 {id:'masters',label:'大师对局',allLabel:'全部大师对局'},
 {id:'training',label:'专题训练',allLabel:'全部训练'},
 {id:'mine',label:'我的棋谱',allLabel:'全部我的棋谱'}
];
export const ALL_PACKS = [...VIRTUAL_PACKS, ...SCORE_PACKS];

// Provenance takes priority over subject: an imported master game is still the user's score.
export function personalPackName(label){return !label||['导入','我的保存','我的棋谱'].includes(label)?'我的棋谱':label;}
export function scorePackName(score){
 const origin=String(score.origin||'');
 if(/^(?:import|save)-/.test(String(score.id||'')))return personalPackName(origin);
 if(origin==='开局示范'||origin==='开局主线')return '开局示范';
 if(origin==='残局练习'||origin==='战术范例')return origin;
 return origin.replace(/\s*·\s*公开\s*(棋谱|PGN)$/,'').replace(/^大师实战$/,'大师名局').replace(/^内置经典实战$/,'世界名局').replace(/^Lichess CC0\s*·\s*开局谱系$/,'开局示范').replace(/^课程$/,'开局示范')||'大师对局';
}
export function scoreCategory(score){
 const id=String(score.id||'');
 if(/^(?:import|save)-/.test(id))return 'mine';
 const pack=ALL_PACKS.find(p=>p.label===scorePackName(score));
 if(pack)return pack.group;
 if(score.stage==='开局')return 'openings';
 if(['中局','残局'].includes(score.stage))return 'training';
 return id.startsWith('complete-')||score.stage==='实战'?'masters':'training';
}
export function scoreInCollection(score,category,packId='*',starred=false){
 if(category==='mine'){
  if(packId==='mine:starred')return starred;
  if(packId==='*')return scoreCategory(score)==='mine'||starred;
 }
 if(scoreCategory(score)!==category)return false;
 if(packId==='*')return true;
 const pack=ALL_PACKS.find(p=>p.id===packId);
 const rawLabel=pack?pack.label:packId.replace(/^(?:mine|extra|legacy):/,'');
 const label=category==='mine'?personalPackName(rawLabel):rawLabel;
 return scorePackName(score)===label;
}
