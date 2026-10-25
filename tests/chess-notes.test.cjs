const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../chess-notes.js'),'utf8').replace(/^export /gm,'')+';globalThis.notes=CHESS_NOTES',context);
test('rest notes provide a substantial varied local pool and translations for all English lines',()=>{
 const notes=Array.from(context.notes);assert.ok(notes.length>=80);assert.equal(new Set(notes.map(n=>n.text)).size,notes.length);
 assert.ok(notes.filter(n=>n.translation).length>=10);
 for(const note of notes){assert.ok(note.text.trim());if(/^[A-Za-z]/.test(note.text))assert.ok(/[\u4e00-\u9fff]/.test(note.translation));}
});
