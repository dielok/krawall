import {readFileSync} from 'node:fs';
const files=JSON.parse(readFileSync('coverage/coverage-final.json','utf8'));
for(const [filename,data] of Object.entries(files)){
 const failures=[];
 const source=readFileSync(filename,'utf8').split('\n');
 for(const [id,n] of Object.entries(data.f)){
  if(n===0){
   const loc=data.fnMap[id].loc.start;
   failures.push('  FUNC '+loc.line+': '+source[loc.line-1]?.trim().slice(0,110));
  }
 }
 for(const [id,counts] of Object.entries(data.b)){
  if(counts.some(n=>n===0)){
   const loc=data.branchMap[id].loc.start;
   failures.push('  BRANCH '+loc.line+': '+counts.join('/')+' '+source[loc.line-1]?.trim().slice(0,110));
  }
 }
 if(failures.length)console.log('\n'+filename+'\n'+failures.join('\n'));
}
