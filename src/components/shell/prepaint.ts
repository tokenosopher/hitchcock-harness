// The columns' remembered widths and folds, read before the first paint. The server cannot know them (they live
// in this browser's localStorage), so without this the page painted at the default widths and jumped once React
// had read them: a folded films list opened and closed again on every load. The script sets CSS variables and two
// data attributes on <html>; the frame (Shell.tsx) uses them until it has hydrated. Not a client module, so the
// root layout can inline it. It also marks each Back and Forward (popstate) for the frame's scroll memory, ahead
// of the router's own listener. Keys and limits are those of lib/sizes.ts SIZES and Shell.tsx, PAGE_MIN (400; EDIT_PAGE_MIN, 680, on an Edit page; SHOT_PAGE_MIN, 900, on Shot details) included:
// a window too narrow for both columns and the page folds the films list to its rail and narrows Alma's column.
export const PREPAINT_SCRIPT = `(function(){addEventListener('popstate',function(){window.__hhPop=1},true);try{var s=localStorage,d=document.documentElement;
function n(k,lo,hi,v){var r=s.getItem(k),x=r===null?NaN:Number(r);return isFinite(x)?Math.min(hi,Math.max(lo,x)):v}
var nw=n('hh-size-sidebar',180,480,248),tw=n('hh-size-thread',300,760,384);
var nh=s.getItem('hh-sidebar-hidden')==='1',th=s.getItem('hh-thread-hidden')==='1';
var W=innerWidth,P=location.pathname,col=W>760&&(/^\\/films\\/(?!new(\\/|$))[^/]+/.test(P)||/^\\/(library|settings)(\\/|$)/.test(P));
var pm=/^\\/films\\/[^/]+\\/edit\\/?$/.test(P)?680:/^\\/films\\/[^/]+\\/shots\\/[^/]+\\/?$/.test(P)?900:400;var tw6=Math.min(tw,W*0.6);if(col&&!nh&&W-nw-(th?52:tw6)<pm){nh=1;}
var tcap=Math.round(Math.max(300,Math.min(tw6,W-(nh?52:nw)-pm)));if(col&&!th)d.style.setProperty('--hh-thread-cap',tcap+'px');
d.style.setProperty('--hh-nav-w',nw+'px');d.style.setProperty('--hh-nav-frame',(nh?52:nw)+'px');
d.style.setProperty('--hh-thread-w',tw+'px');d.style.setProperty('--hh-thread-frame',th?'52px':col?tcap+'px':'min('+tw+'px, 60vw)');
if(nh)d.setAttribute('data-nav-hidden','');if(th)d.setAttribute('data-thread-hidden','');}catch(e){}})();`;
