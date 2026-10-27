import { cloneRecord } from './game-record.js';

export const RECENT_KEY='ChessAtelierRecentGamesV1';
export const RECENT_LIMIT=20;
// Preserve every legal move before the branch (including a custom starting FEN).
// The source record and its unplayed continuation are never mutated.
export function createTrialRecord(game,ply,origin){
 const copy=cloneRecord(game,Math.max(0,Math.min(ply,game.history().length)),origin);
 copy.header('Result','*');
 return copy;
}
export function readRecentGames(storage){
 try{
  const rows=JSON.parse(storage.getItem(RECENT_KEY)||'[]');
  if(!Array.isArray(rows))return [];
  const seen=new Set();
  return rows.filter(row=>{
   if(!row||typeof row.id!=='string'||!row.id.startsWith('recent-')||typeof row.pgn!=='string'||!row.pgn.trim()||seen.has(row.id))return false;
   seen.add(row.id);return true;
  }).slice(0,RECENT_LIMIT);
 }catch{return [];}
}
export function updateRecentGames(rows,entry){
 if(!entry||typeof entry.id!=='string'||!entry.id.startsWith('recent-')||!entry.pgn)return rows.slice(0,RECENT_LIMIT);
 return [{...entry},...rows.filter(row=>row.id!==entry.id)].slice(0,RECENT_LIMIT);
}
export function writeRecentGames(storage,rows){storage.setItem(RECENT_KEY,JSON.stringify(rows.slice(0,RECENT_LIMIT)));}
