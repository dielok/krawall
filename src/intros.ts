import data from '../input/quiz-krawall-tts.json';
import {categories} from './categories';
export type Intro = {id:string;text:string;categoryId:string};
const items = data.items.filter(item=>item.category === 'category_intro') as (typeof data.items[number] & {category_id?:string})[];
export const introductions:readonly Intro[] = items.map(item=>({
 id:item.id,text:item.text,categoryId:item.category_id??''
}));
export function introsFor(categoryId:string):Intro[]{
 return introductions.filter(intro=>intro.categoryId===categoryId);
}
export function validateIntroCatalog():boolean{
 return categories.every(category=>introsFor(category.id).length>0);
}
