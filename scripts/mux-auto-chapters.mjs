/**
 * One-time Mux Robots setup for PRISM. Never expose credentials in the browser.
 * Dry-run: node scripts/mux-auto-chapters.mjs
 * Create: node scripts/mux-auto-chapters.mjs --create-directive
 * Direct upload: node scripts/mux-auto-chapters.mjs --create-upload --directive=drv_... --cors=https://your-site
 * Existing asset: node scripts/mux-auto-chapters.mjs --run=ASSET_ID --directive=drv_...
 */
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export function prismChaptersDirective(){
  return {
    name:'PRISM / Auto speech chapters',
    subject:{type:'video.asset'},
    resources:[{
      reference_id:'captions',
      type:'video.asset.track',
      kind:'subtitles',
      source:{via:'mux_api',action:'generate_subtitles',parameters:{language_code:'auto'}}
    }],
    bindings:[{
      reference_id:'generate_chapters',
      workflow:'generate-chapters',
      inputs:['captions'],
      parameters:{
        update_asset_chapters:true,
        output_steering:{chapter_style:'descriptive',chapter_granularity:'balanced'}
      }
    }]
  };
}
export function prismUploadConfig(directiveId,corsOrigin){
  if(!/^drv_[A-Za-z0-9]+$/.test(directiveId))throw Error('Invalid directive ID');
  const origin=new URL(corsOrigin);
  if(origin.protocol!=='https:' && origin.hostname!=='localhost')throw Error('Use an HTTPS origin');
  return {
    cors_origin:origin.origin,
    new_asset_settings:{
      playback_policies:['public'],
      directives:[{id:directiveId}]
    }
  };
}
async function muxPost(endpoint,body){
  const {MUX_TOKEN_ID:id,MUX_TOKEN_SECRET:secret}=process.env;
  if(!id||!secret)throw Error('Set MUX_TOKEN_ID and MUX_TOKEN_SECRET as local environment variables first.');
  const authorization='Basic '+Buffer.from(id+':'+secret).toString('base64');
  const response=await fetch('https://api.mux.com'+endpoint,{
    method:'POST',headers:{authorization,'content-type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(15000)
  });
  const payload=await response.json().catch(()=>null);
  if(!response.ok)throw Error('Mux rejected the request ('+response.status+'): '+JSON.stringify(payload?.error||payload?.errors||{}));
  return payload?.data;
}
async function main(){
  const flags=new Map(process.argv.slice(2).filter(x=>x.startsWith('--')).map(x=>{
    const [key,...parts]=x.slice(2).split('=');
    return [key,parts.join('=')||true];
  }));
  if(flags.has('create-directive')){
    const result=await muxPost('/robots/v1/directives',prismChaptersDirective());
    console.log('Mux Directive created: '+result.id);
    console.log('Attach this directive to each new video upload (or use --create-upload).');
  }else if(flags.has('create-upload')){
    const config=prismUploadConfig(String(flags.get('directive')||''),String(flags.get('cors')||''));
    const result=await muxPost('/video/v1/uploads',config);
    console.log('Mux Direct Upload created. Its URL expires; keep it private.');
    console.log(JSON.stringify({upload_id:result.id,url:result.url},null,2));
  }else if(flags.has('run')){
    const assetId=String(flags.get('run'));
    const directiveId=String(flags.get('directive')||'');
    if(!/^[A-Za-z0-9]{5,128}$/.test(assetId)||!/^drv_[A-Za-z0-9]+$/.test(directiveId))throw Error('Provide valid --run=ASSET_ID and --directive=drv_...');
    const result=await muxPost('/robots/v1/directives/'+directiveId+'/runs',{asset_id:assetId});
    console.log('Existing asset scheduled for chaptering: '+result.id);
  }else{
    console.log(JSON.stringify(prismChaptersDirective(),null,2));
    console.log('Dry run only. To activate, see docs/MUX-AI-CHAPTERS.md.');
  }
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
