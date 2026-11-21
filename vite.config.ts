import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {existsSync,statSync,createReadStream,readdirSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve,join,relative,extname} from 'node:path';
const output=resolve('output');
function copy(src:string,dest:string){if(!existsSync(src))return;for(const name of readdirSync(src)){const from=join(src,name),to=join(dest,name);if(statSync(from).isDirectory()){mkdirSync(to,{recursive:true});copy(from,to);}else if(name.endsWith('.wav'))copyFileSync(from,to);}}
export default defineConfig({base:'./',plugins:[react(),{
 name:'local-audio',
 configureServer(server){server.middlewares.use('/audio',(req,res,next)=>{
  const name=decodeURIComponent((req.url??'').split('?')[0]);const path=resolve(output,'.'+name);
  if(relative(output,path).startsWith('..')||extname(path)!=='.wav'||!existsSync(path)){next();return;}
  res.setHeader('Content-Type','audio/wav');createReadStream(path).pipe(res);
 });},
 closeBundle(){const dest=resolve('dist/audio');mkdirSync(dest,{recursive:true});copy(output,dest);}
}]});
