import data from '../input/categories.json';

export type CategoryId = 'all' | string;
export type QuizCategory = {id:string;name:string;icon:string;question_ids:string[]};
export const categories:readonly QuizCategory[] = data.categories;
export const allCategory = {id:'all',name:'Alles gemischt',icon:'🎲'};

export function questionIds(categoryId:CategoryId, allIds:readonly string[]):string[]{
 if(categoryId==='all')return [...allIds];
 const category=categories.find(c=>c.id===categoryId);
 if(!category)throw new Error('Unknown category: '+categoryId);
 return [...category.question_ids];
}

export function categoryName(categoryId:CategoryId):string{
 return categoryId==='all'?allCategory.name:categories.find(c=>c.id===categoryId)?.name??categoryId;
}
