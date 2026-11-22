import {categories} from './categories';
import {newRound,shuffle,type Question} from './game';
import {introsFor,type Intro} from './intros';
export type CategoryBlock = {categoryId:string;start:number;length:number;intro:Intro};
export type ShowRound = {questions:Question[];blocks:CategoryBlock[]};

export function createShowRound(count:number,categoryId='all',random:()=>number=Math.random):ShowRound{
 if(categoryId!=='all'){
  const questions=newRound(count,random,categoryId);
  return {questions,blocks:[makeBlock(categoryId,0,questions.length,random)]};
 }
 if(!Number.isInteger(count)||count<1||count>20)
  throw new Error('Invalid round length: '+count);
 const pools=new Map(categories.map(category=>[category.id,newRound(category.question_ids.length,random,category.id)]));
 const questions:Question[]=[];
 const blocks:CategoryBlock[]=[];
 const usedIntros=new Set<string>();
 let order=categoryCycle(random);
 let blockNumber=0;
 while(questions.length<count){
  if(blockNumber>0&&blockNumber%categories.length===0){
   order=categoryCycle(random,blocks[blocks.length-1].categoryId);
  }
  const category=order[blockNumber%categories.length];
  const pool=pools.get(category.id)!;
  const remaining=count-questions.length;
  const desired=remaining<=3?remaining:remaining===4?2:random()<.5?2:3;
  const length=Math.min(desired,pool.length);
  if(length===0)throw new Error('Not enough questions in category: '+category.id);
  const start=questions.length;
  questions.push(...pool.splice(0,length));
  blocks.push(makeBlock(category.id,start,length,random,usedIntros));
  blockNumber++;
 }
 return {questions,blocks};
}

export function categoryCycle(random:()=>number,previousCategoryId?:string){
 const cycle=shuffle(categories,random);
 if(previousCategoryId&&cycle[0]?.id===previousCategoryId)
  [cycle[0],cycle[1]]=[cycle[1],cycle[0]];
 return cycle;
}

function makeBlock(categoryId:string,start:number,length:number,random:()=>number,usedIntros:Set<string>=new Set()):CategoryBlock{
 const options=introsFor(categoryId);
 if(!options.length)throw new Error('Missing introductions for category: '+categoryId);
 const remaining=options.filter(option=>!usedIntros.has(option.id));
 const choices=remaining.length?remaining:options;
 const intro=choices[Math.floor(random()*choices.length)];
 usedIntros.add(intro.id);
 return {categoryId,start,length,intro};
}
