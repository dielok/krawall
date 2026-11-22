import data from '../input/quiz-krawall-tts.json';
import {questionIds} from './categories';
export type Option={label:string;spoken:string;correct:boolean;id:string};
export type Question={id:string;text:string;options:Option[];fun:string;wrong:string};
type Item={id:string;text:string;correct?:boolean;display_label?:string};
const items=new Map<string,Item>((data.items as Item[]).map(item=>[item.id,item]));
export function phrase(id:string):string{return items.get(id)?.text??'';}
export function shuffle<T>(list:readonly T[],random:()=>number=Math.random):T[]{
 const a=[...list];
 for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
 return a;
}
export function newRound(count:number,random:()=>number=Math.random,categoryId='all'):Question[]{
 const allIds=Array.from({length:data.question_count},(_,i)=>'q'+String(i+1).padStart(2,'0'));
 return shuffle(questionIds(categoryId,allIds),random).slice(0,count).map(id=>({
  id,text:phrase(id+'.question'),fun:phrase(id+'.correct'),wrong:phrase(id+'.incorrect'),
  options:shuffle(Array.from({length:4},(_,j)=>{const itemId=id+'.answer.'+(j+1);const entry=items.get(itemId);if(!entry)throw new Error('Missing TTS entry '+itemId);return {id:itemId,label:entry.display_label??entry.text,spoken:entry.text,correct:entry.correct===true};}),random)
 }));
}
export function result(points:number,total:number){return points===total?'results.perfect':points>=Math.ceil(total*.75)?'results.great':'results.encourage';}

