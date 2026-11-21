import assert from 'node:assert/strict';import test from 'node:test';import {readFileSync} from 'node:fs';
const data=JSON.parse(readFileSync(new URL('../input/quiz-krawall-tts.json',import.meta.url),'utf8'));
const items=new Map(data.items.map(i=>[i.id,i]));
test('20 vollständige Fragen mit genau einer richtigen Antwort',()=>{assert.equal(data.question_count,20);for(let i=1;i<=20;i++){const id='q'+String(i).padStart(2,'0');assert.ok(items.has(id+'.question'));const options=Array.from({length:4},(_,n)=>items.get(id+'.answer.'+(n+1)));assert.ok(options.every(Boolean));assert.equal(options.filter(o=>o.correct).length,1);assert.ok(items.has(id+'.correct'));assert.ok(items.has(id+'.incorrect'));}});
