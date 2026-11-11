/** Build the static deployable showcase.
 * Video.js is loaded from a version-pinned official CDN. This builder copies
 * runtime assets only: never publish source generators, tests or raw project files.
 */
import {cp,mkdir,rm,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dst=path.join(root,'dist');
await rm(dst,{recursive:true,force:true});
await mkdir(path.join(dst,'assets'),{recursive:true});
for(const item of ['index.html','src','skin','examples','_headers']){
 await cp(path.join(root,item),path.join(dst,item),{recursive:true});
}
// Release contains ONLY referenced public media, not legacy motion studies or generators.
const releaseAssets=['mark.svg','prism-cinematic.mp4','prism-cinematic.jpg','prism-cinematic.vtt',
 'night-city.mp4','night-city.jpg','night-city.vtt',
 'coast-sunrise.mp4','coast-sunrise.jpg','coast-sunrise.vtt',
 'prism-cinematic-storyboard.jpg','prism-cinematic-storyboard.vtt','prism-cinematic-chapters.vtt',
 'tears-of-steel-fallback.svg','tears-of-steel-full.vtt',
 'night-city-storyboard.jpg','night-city-storyboard.vtt',
 'coast-sunrise-storyboard.jpg','coast-sunrise-storyboard.vtt'];
// Only ship the open-film option when its locally prepared MP4 exists.
// Never ship an empty placeholder or claim the licensed excerpt was bundled.
const optionalFilm=['tears-of-steel-excerpt.mp4','tears-of-steel-poster.jpg',
 'tears-of-steel-storyboard.jpg','tears-of-steel-storyboard.vtt',
 'tears-of-steel-chapters.vtt','tears-of-steel-excerpt.vtt'];
try{
 const m=await stat(path.join(root,'assets','tears-of-steel-excerpt.mp4'));
 if(m.size>100000)releaseAssets.push(...optionalFilm);
}catch(_){console.log('Optional licensed live-action film not yet prepared; run npm run prepare:film to add it.');}
for(const file of releaseAssets){
 await cp(path.join(root,'assets',file),path.join(dst,'assets',file));
}
console.log(`Production static site assembled at ${dst}. Video.js CDN connectivity is required at runtime.`);
