/** Cross-platform local server with byte-range support for seeking MP4 videos. */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4173);
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4',
  '.vtt': 'text/vtt; charset=utf-8', '.json': 'application/json; charset=utf-8'
};
const server=createServer(async (req,res)=>{
  if(req.method!=='GET'&&req.method!=='HEAD'){
    res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;
  }
  let url;
  try { url=new URL(req.url,'http://localhost'); }catch {res.writeHead(400);res.end();return;}
  let pathname;
  try { pathname=decodeURIComponent(url.pathname); }catch {res.writeHead(400);res.end();return;}
  const file=resolve(root, '.'+pathname, pathname.endsWith('/')?'index.html':'');
  const rel=relative(root,file);
  if(rel==='..'||rel.startsWith('..'+sep)||rel.startsWith('/')||rel.includes('node_modules')){
    res.writeHead(403);res.end();return;
  }
  let info;
  try { info=await stat(file); }catch {res.writeHead(404);res.end('Not found');return;}
  if(!info.isFile()){res.writeHead(404);res.end();return;}
  const headers={'Content-Type':mime[extname(file).toLowerCase()]||'application/octet-stream',
    'Accept-Ranges':'bytes','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  let start=0,end=info.size-1,code=200;
  const range=req.headers.range;
  if(range){
    const m=/^bytes=(\d*)-(\d*)$/.exec(range);
    if(!m || (!m[1]&&!m[2])){
      res.writeHead(416,{...headers,'Content-Range':`bytes */${info.size}`});res.end();return;
    }
    if(m[1])start=Number(m[1]);
    else start=Math.max(0,info.size-Number(m[2]));
    if(m[2]&&m[1])end=Number(m[2]);
    end=Math.min(end,info.size-1);
    if(start> end || start>=info.size){
      res.writeHead(416,{...headers,'Content-Range':`bytes */${info.size}`});res.end();return;
    }
    code=206; headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;
  }
  headers['Content-Length']=String(end-start+1);
  res.writeHead(code,headers);
  if(req.method==='HEAD'){res.end();return;}
  const stream=createReadStream(file,{start,end});
  stream.on('error',()=>res.destroy());
  stream.pipe(res);
});
server.listen(port,()=>console.log(`PRISM local demo: http://localhost:${port}/`));
