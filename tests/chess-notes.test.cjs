const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({});for(const file of ['chess-quote-data.js','chess-notes.js'])vm.runInContext(fs.readFileSync(path.resolve(__dirname,'..',file),'utf8').replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')+';globalThis.notes=typeof CHESS_NOTES===\"undefined\"?null:CHESS_NOTES',context);
vm.runInContext('globalThis.createDeck=createNoteDeck',context);
test('rest notes provide a substantial varied local pool and translations for all English lines',()=>{
 const notes=Array.from(context.notes);assert.ok(notes.length>=80);assert.equal(new Set(notes.map(n=>n.text)).size,notes.length);
 assert.ok(notes.filter(n=>n.translation).length>=10);
 for(const note of notes){assert.ok(note.text.trim());if(/^[A-Za-z]/.test(note.text)&&!/[\u4e00-\u9fff]/.test(note.text))assert.ok(/[\u4e00-\u9fff]/.test(note.translation));}
});

test('note deck does not repeat during a full cycle and resumes after reload',()=>{
 const notes=Array.from(context.notes),memory=new Map(),storage={getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)};
 let next=context.createDeck(notes,{storage});const seen=new Set();for(let i=0;i<40;i++)seen.add(next().text);
 next=context.createDeck(notes,{storage});for(let i=40;i<notes.length;i++){const text=next().text;assert.ok(!seen.has(text));seen.add(text);}
 assert.equal(seen.size,notes.length);assert.ok(notes.filter(note=>note.source&&note.sourceUrl).length>=16);
});
