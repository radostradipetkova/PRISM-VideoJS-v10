/** Deliver a standalone, site-independent Video.js v10 skin package.
 * Not published to npm; files are ready to be copied into another site.
 */
import {cp,rm,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dest=path.join(project,'skin-dist');
await rm(dest,{recursive:true,force:true});
await mkdir(dest,{recursive:true});
for (const name of ['index.js','register-videojs.js','prism-player.js','control-hints.js','vanishing-interface.js','optical-touch.js','frame-preview.js','player-preferences.js','remember-settings.js','scene-loop.js','chapter-index.js','fullscreen-orientation.js','media-status.js','prism-skin.css','LICENSE','README.md']) {
 await cp(path.join(project,'skin',name),path.join(dest,name));
}
await writeFile(path.join(dest,'package.json'),JSON.stringify({
 name:'prism-optical-touch-skin',version:'2.3.1',private:false,type:'module',license:'Apache-2.0',
 description:'Reusable PRISM Optical Touch skin for Video.js v10',
 exports:{'.':'./index.js','./styles.css':'./prism-skin.css','./register-videojs':'./register-videojs.js'},
 sideEffects:['./prism-skin.css']
},null,2)+'\n');
console.log(`Portable PRISM skin assembled: ${dest}`);
