import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {existsSync,statSync,createReadStream,readdirSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve,join,relative,extname} from 'node:path';
const sources=[{root:resolve('output'),url:'/audio',extension:'.mp3',mime:'audio/mpeg'},{root:resolve('sounds'),url:'/sounds',extension:'.mp3',mime:'audio/mpeg'}];
function copy(src:string,dest:string,extension:string){
 if(!existsSync(src))return;
 for(const name of readdirSync(src)){
  const from=join(src,name),to=join(dest,name);
  if(statSync(from).isDirectory()){mkdirSync(to,{recursive:true});copy(from,to,extension);}
  else if(extname(name)===extension)copyFileSync(from,to);
 }
}
export default defineConfig({base:'./',plugins:[react(),{
 name:'local-audio',
 configureServer(server){
  for(const source of sources)server.middlewares.use(source.url,(req,res,next)=>{
   const name=decodeURIComponent((req.url??'').split('?')[0]);
   const path=resolve(source.root,'.'+name);
   if(relative(source.root,path).startsWith('..')||extname(path)!==source.extension){next();return;}
   if(!existsSync(path)){res.statusCode=404;res.end();return;}
   res.setHeader('Content-Type',source.mime);createReadStream(path).pipe(res);
  });
 },
 closeBundle(){
  for(const source of sources){
   const dest=resolve('dist'+source.url);mkdirSync(dest,{recursive:true});copy(source.root,dest,source.extension);
  }
 }
}]});
