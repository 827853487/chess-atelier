const STAR_KEY='ChessAtelierStarredScoresV1';
export function readStarredScores(storage){
 try{const ids=JSON.parse(storage.getItem(STAR_KEY)||'[]');return new Set(Array.isArray(ids)?ids.filter(id=>typeof id==='string'):[]);}catch{return new Set();}
}
export function writeStarredScores(storage,ids){storage.setItem(STAR_KEY,JSON.stringify([...ids]));}
