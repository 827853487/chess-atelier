// Cross-check the browser rules against the independently generated python-chess audit.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),report=JSON.parse(fs.readFileSync(path.join(root,'test-results/game-endings-audit.json'),'utf8'));
const box=vm.createContext({});
for(const file of ['vendor/chess.js','extra-collections.js','master-collections.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8').replace(/^import .*;\s*$/gm,'').replace(/^export default .*;\s*$/gm,'').replace(/^export /gm,''),box);
vm.runInContext('globalThis.api={Chess,SCORE_PACKS}',box);
const retry=process.argv.includes('--retry-failures')?JSON.parse(fs.readFileSync(path.join(root,'test-results/browser-endings-audit.json'),'utf8')):null;
const {Chess,SCORE_PACKS}=box.api,masterFiles=new Set(SCORE_PACKS.filter(p=>p.group==='masters').map(p=>p.file)),issues=[],masters=retry?retry.masters:{games:0,checkmate:0,recorded_win_without_mate:0,recorded_draw:0};let games=retry?.games||0,mates=retry?.mates||0;
for(const [file,reference] of Object.entries(report.reference)){
 const parts=fs.readFileSync(path.join(root,'data/complete',file),'utf8').replace(/\r\n/g,'\n').trim().split(/(?=^\[Event\s+")/m).filter(x=>x.trim());
 assert.equal(parts.length,reference.length,file+' game count');
 for(let i=0;i<parts.length;i++){
  if(retry&&!retry.issues.some(x=>x.file===file&&x.index===i+1))continue;
  const ref=reference[i],g=new Chess();
  try{
   g.loadPgn(parts[i]);const actual={plies:g.history().length,fen:g.fen(),mate:g.isCheckmate(),check:g.isCheck()};
   for(const key of ['plies','fen','mate','check'])if(actual[key]!==ref[key])issues.push({file,index:i+1,key,expected:ref[key],actual:actual[key]});
   games++;if(actual.mate)mates++;
   if(masterFiles.has(file)){masters.games++;if(ref.mate)masters.checkmate++;else if(['1-0','0-1'].includes(ref.result))masters.recorded_win_without_mate++;else if(ref.result==='1/2-1/2')masters.recorded_draw++;}
  }catch(error){issues.push({file,index:i+1,error:error.message});}
 }
 console.log(file,parts.length);
}
const result={games,mates,masters,issues,metadataWarnings:report.issues,recheckedFailures:retry?.issues.length||0};fs.writeFileSync(path.join(root,'test-results/browser-endings-audit.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));assert.equal(issues.length,0);assert.equal(games,report.totals.games);
