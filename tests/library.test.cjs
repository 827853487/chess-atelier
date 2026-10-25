const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const context=vm.createContext({});
for(const file of ['extra-collections.js','master-collections.js'])vm.runInContext(fs.readFileSync(path.resolve(__dirname,'..',file),'utf8').replace(/^import .*;\s*$/gm,'').replace(/^export /gm,''),context);
vm.runInContext('globalThis.api={ALL_PACKS,PACK_GROUPS,scoreCategory,scoreInCollection,scorePackName}',context);
const {ALL_PACKS,PACK_GROUPS,scoreCategory,scoreInCollection,scorePackName}=context.api;

test('every builtin collection belongs to exactly one of four distinct categories',()=>{
 assert.deepEqual(Array.from(PACK_GROUPS,g=>g.id),['openings','masters','training','mine']);
 for(const pack of ALL_PACKS){
  const score={id:'complete-'+pack.id,origin:pack.label,stage:'实战'};
  assert.equal(scoreCategory(score),pack.group);
  assert.equal(PACK_GROUPS.filter(group=>scoreInCollection(score,group.id)).length,1);
 }
});
test('imported and saved master games stay personal, including names matching builtin packs',()=>{
 for(const id of ['import-123','save-123']){
  const score={id,origin:'菲舍尔名局',stage:'实战'};
  assert.equal(scoreCategory(score),'mine');assert.equal(scoreInCollection(score,'masters'),false);
  assert.equal(scoreInCollection(score,'mine','extra:菲舍尔名局'),true);
 }
});
test('all means all within the current category, never a global mixture',()=>{
 const scores=[{id:'italian',origin:'开局示范',stage:'开局'},{id:'complete-fischer-1',origin:'菲舍尔名局',stage:'实战'},{id:'pawnend',origin:'残局练习',stage:'残局'},{id:'import-1',origin:'导入',stage:'实战'}];
 for(const category of PACK_GROUPS)assert.equal(scores.filter(x=>scoreInCollection(x,category.id,'*')).length,1);
 assert.equal(scoreInCollection(scores[1],'masters','fischer'),true);
 assert.equal(scoreInCollection(scores[1],'masters','tal'),false);
});
test('legacy aliases remain reachable while personal origins are preserved verbatim',()=>{
 assert.equal(scorePackName({id:'scotch',origin:'开局主线'}),'开局示范');
 assert.equal(scoreCategory({id:'complete-legacy',origin:'未知旧合集',stage:'实战'}),'masters');
 assert.equal(scoreInCollection({id:'complete-legacy',origin:'未知旧合集',stage:'实战'},'masters','legacy:未知旧合集'),true);
 assert.equal(scorePackName({id:'import-9',origin:'开局主线'}),'开局主线');
});
test('favorites appear separately in My Scores without changing their original collection',()=>{
 const game={id:'complete-world-1972-0',origin:'1972 菲舍尔—斯帕斯基',stage:'实战'};
 assert.equal(scoreInCollection(game,'mine','mine:starred',true),true);
 assert.equal(scoreInCollection(game,'mine','*',true),true);
 assert.equal(scoreInCollection(game,'mine','extra:1972 菲舍尔—斯帕斯基',true),false);
 assert.equal(scoreInCollection(game,'masters','world-1972',true),true);
 assert.equal(scoreInCollection(game,'mine','mine:starred',false),false);
 assert.equal(scoreCategory(game),'masters');
});
test('legacy imported and saved records share My Scores while custom collections keep their names',()=>{
 for(const id of ['import-17','save-28'])for(const origin of ['导入','我的保存','我的棋谱']){
  const game={id,origin};
  assert.equal(scorePackName(game),'我的棋谱');
  assert.equal(scoreInCollection(game,'mine','mine:我的棋谱'),true);
  assert.equal(scoreInCollection(game,'mine','mine:导入'),true);
  assert.equal(scoreInCollection(game,'mine','mine:我的保存'),true);
 }
 assert.equal(scorePackName({id:'import-12',origin:'我的开局笔记'}),'我的开局笔记');
 assert.equal(scoreInCollection({id:'save-15',origin:'我的开局笔记'},'mine','mine:我的棋谱'),false);
});
test('star persistence handles corrupt storage and keeps only string record IDs',()=>{
 vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../favorites.js'),'utf8').replace(/^export /gm,'')+';globalThis.stars={readStarredScores,writeStarredScores}',context);
 let value='invalid';const storage={getItem:()=>value,setItem:(_,v)=>value=v};
 assert.equal(context.stars.readStarredScores(storage).size,0);
 value='["game-1",null,3,"game-1"]';assert.equal(context.stars.readStarredScores(storage).size,1);
 context.stars.writeStarredScores(storage,new Set(['game-2','game-3']));
 assert.deepEqual(JSON.parse(value),['game-2','game-3']);
});
