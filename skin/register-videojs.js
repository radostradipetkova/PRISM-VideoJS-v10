/** Optional CDN registration helper for a static-site embed.
 * For npm/bundled apps, register equivalent @videojs/html components locally
 * rather than loading the CDN. Version-pinned to Video.js v10.3.0.
 */
const cdn='https://cdn.jsdelivr.net/npm/@videojs/cdn@10.3.0';
let registered;
export function registerVideoJS(){
  return registered ||= (async ()=>{
    // Load v10 base first, then the custom UI components PRISM actually uses.
    await import(`${cdn}/video.js`);
    await Promise.all([
      'ui/slider-preview.js', 'ui/slider-value.js', 'ui/slider-thumbnail.js',
      'ui/thumbnail.js', 'ui/seek-button.js', 'ui/gesture.js',
      'ui/playback-rate-radio-group.js', 'ui/quality-radio-group.js', 'ui/captions-radio-group.js',
      'ui/status-announcer.js', 'ui/menu-radio-item.js',
      'ui/menu-item-indicator.js', 'media/mux-video.js'
    ].map(path => import(`${cdn}/${path}`)));
    return true;
  })();
}
