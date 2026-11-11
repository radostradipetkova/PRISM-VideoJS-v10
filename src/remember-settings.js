/** Optional, origin-local PRISM preferences. Nothing is written until opted in.
 * The saved record intentionally excludes source, history, chapters, touch
 * gestures, and other data unrelated to the requested viewing preferences.
 */
import {normalizePreferences} from './player-preferences.js';

export const DEFAULT_REMEMBER_KEY='prism:remember-settings:v1';
const VERSION=1;
// All browser storage access goes through this adapter. The *getter* for
// window.localStorage can throw (sandboxed frames, blocked cookies, privacy
// settings), and any storage method can fail independently (e.g. quota).
// Keep the most recent per-page choices in memory even if persistence fails.
// The memory map is shared by players in this window, but not across reloads.
const memoryByWindow=new WeakMap();
const serverMemory=new Map();
function memoryFor(win){
  if(win===null || (typeof win!=='object' && typeof win!=='function'))return serverMemory;
  let map=memoryByWindow.get(win);
  if(!map){map=new Map();memoryByWindow.set(win,map);}
  return map;
}
export function safeStorage(win=globalThis.window){
  const memory=memoryFor(win);
  let lastAccessPersistent=false;
  function attempt(action){
    try{
      const storage=win?.localStorage; // Even this property read belongs in try.
      if(!storage)return {ok:false};
      return {ok:true,value:action(storage)};
    }catch{return {ok:false};}
  }
  return {
    getItem(key){
      const name=String(key);
      // A memory override also masks an older value whose removal failed.
      if(memory.has(name)){
        const record=memory.get(name);
        lastAccessPersistent=record.persistent;
        return record.value;
      }
      const result=attempt(storage=>storage.getItem(name));
      lastAccessPersistent=result.ok;
      return result.ok ? result.value ?? null : null;
    },
    setItem(key,value){
      const name=String(key),text=String(value);
      const result=attempt(storage=>storage.setItem(name,text));
      memory.set(name,{value:text,persistent:result.ok});
      lastAccessPersistent=result.ok;
      // Use localStorage's standard void return; the fallback also succeeded.
    },
    removeItem(key){
      const name=String(key);
      const result=attempt(storage=>storage.removeItem(name));
      // Tombstone avoids resurrecting stale persistent data in this page.
      memory.set(name,{value:null,persistent:result.ok});
      lastAccessPersistent=result.ok;
    },
    get persistenceAvailable(){return lastAccessPersistent;}
  };
}
export function normalizePlaybackRate(value){
  if(value===null||value===undefined||value==='')return null;
  const rate=Number(value);
  return Number.isFinite(rate)&&rate>=0.25&&rate<=4 ? rate : null;
}
export function persistentPreferences(input={}){
  const value=normalizePreferences(input);
  return {
    surface:value.surface,
    motion:value.motion,
    captionSize:value.captionSize,
    captionBackground:value.captionBackground,
    videoFit:value.videoFit
  };
}
export function readRememberedSettings(storage,key=DEFAULT_REMEMBER_KEY){
  try{
    const json=storage?.getItem(key);
    if(!json)return null;
    const record=JSON.parse(json);
    if(!record || record.version!==VERSION || record.enabled!==true ||
       !record.preferences || typeof record.preferences!=='object' || Array.isArray(record.preferences))return null;
    return {
      preferences:persistentPreferences(record.preferences),
      playbackRate:normalizePlaybackRate(record.playbackRate)??1
    };
  }catch{return null;}
}
export function saveRememberedSettings(storage,key=DEFAULT_REMEMBER_KEY,{preferences={},playbackRate=1}={}){
  try{
    if(!storage?.setItem)return false;
    storage.setItem(key,JSON.stringify({
      version:VERSION,enabled:true,
      preferences:persistentPreferences(preferences),
      playbackRate:normalizePlaybackRate(playbackRate)??1
    }));
    return true;
  }catch{return false;}
}
export function clearRememberedSettings(storage,key=DEFAULT_REMEMBER_KEY){
  try{if(!storage?.removeItem)return false;storage.removeItem(key);return true;}
  catch{return false;}
}
