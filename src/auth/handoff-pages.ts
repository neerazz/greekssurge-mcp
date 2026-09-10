export interface HandoffPageOptions {
  origin: string;
  nonce: string;
  publicKey: string;
  expiresAt: number;
  scriptNonce: string;
}

const SITE = "https://csp.greekssurge.com";

export function createHandoffPages(options: HandoffPageOptions): {
  helper: string;
  receiver: string;
} {
  const config = JSON.stringify({ ...options, site: SITE }).replace(
    /</g,
    "\\u003c",
  );
  const base = `/connect/${options.nonce}/`;
  // Self-contained browser code: no external scripts and no runtime dependencies.
  const bookmark = `javascript:void(function(c){
    if(window!==window.top||location.origin!==c.site){alert('Use this bookmark on your signed-in GreeksSurge tab, not the connection guide or Google.');return;}
    if(Date.now()>=c.expiresAt){alert('This connection expired. Run auth login again and replace this bookmark.');return;}
    var popup,used=false;
    var timer=setTimeout(function(){window.removeEventListener('message',receive);},Math.max(1,c.expiresAt-Date.now()));
    function stop(){clearTimeout(timer);window.removeEventListener('message',receive);}
    async function receive(event){
      if(event.origin!==c.origin||event.source!==popup||!event.data||Object.keys(event.data).length!==2||event.data.type!=='gs-ready'||event.data.nonce!==c.nonce||used)return;
      used=true;stop();
      try{
        if(Date.now()>=c.expiresAt)throw new Error();
        var session=localStorage.getItem('gs_token');
        if(typeof session!=='string'||!session.length||session.length>16384||!/^[A-Za-z0-9._~+/=-]+$/.test(session))throw new Error();
        var decode=function(value){return Uint8Array.from(atob(value),function(x){return x.charCodeAt(0);});};
        var encode=function(value){return btoa(String.fromCharCode.apply(null,new Uint8Array(value)));};
        var key=crypto.getRandomValues(new Uint8Array(32));
        var iv=crypto.getRandomValues(new Uint8Array(12));
        var rsa=await crypto.subtle.importKey('spki',decode(c.publicKey),{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
        var aes=await crypto.subtle.importKey('raw',key,'AES-GCM',false,['encrypt']);
        var data=await crypto.subtle.encrypt({name:'AES-GCM',iv:iv,additionalData:new TextEncoder().encode(c.nonce)},aes,new TextEncoder().encode(session));
        session=null;
        var wrapped=await crypto.subtle.encrypt('RSA-OAEP',rsa,key);key.fill(0);
        if(Date.now()>=c.expiresAt)throw new Error();
        popup.postMessage({type:'gs-session',nonce:c.nonce,payload:{key:encode(wrapped),iv:encode(iv),data:encode(data)}},c.origin);
      }catch(e){popup.postMessage({type:'gs-failed',nonce:c.nonce},c.origin);}
    }
    window.addEventListener('message',receive);
    popup=window.open(c.origin+'/connect/'+c.nonce+'/receive','_blank','popup,width=600,height=560');
    if(!popup){stop();alert('The connection popup was blocked. Permit this user-opened popup or cancel the login.');}
  })(${config})`;

  const commonScript = `const c=${config};const base=${JSON.stringify(base)};const status=document.getElementById('status');const cancel=document.getElementById('cancel');
    const headers={'Content-Type':'application/json','x-greekssurge-nonce':c.nonce};
    cancel.addEventListener('click',async()=>{cancel.disabled=true;try{const response=await fetch(base+'cancel',{method:'POST',headers,body:'{}',credentials:'omit',redirect:'error'});if(!response.ok)throw new Error();clearTimeout(expiryTimer);status.textContent='Connection cancelled. Close this tab.';}catch{status.textContent='Cancellation was not confirmed. A storage commit may already be finishing; check the terminal.';}});
    const expiryTimer=setTimeout(()=>{status.textContent='This connection expired. Run auth login again and replace the bookmark.';document.querySelectorAll('button').forEach(b=>b.disabled=true);},Math.max(1,c.expiresAt-Date.now()));`;
  const helperScript = `${commonScript}
    document.getElementById('bookmark').addEventListener('click',e=>{e.preventDefault();status.textContent='Drag the Connect GreeksSurge link to your bookmarks bar first. Then use that bookmark on GreeksSurge.';});`;
  const receiverScript = `${commonScript}
    const opener=window.opener;const connect=document.getElementById('connect');let requested=false;let used=false;
    if(!opener){connect.disabled=true;status.textContent='Open this page using the one-time bookmark on GreeksSurge.';}
    connect.addEventListener('click',()=>{if(!opener||Date.now()>=c.expiresAt)return;requested=true;connect.disabled=true;status.textContent='Waiting for the encrypted session…';opener.postMessage({type:'gs-ready',nonce:c.nonce},c.site);});
    window.addEventListener('message',async event=>{
      if(!requested||used||event.origin!==c.site||event.source!==opener||!event.data||event.data.nonce!==c.nonce||Date.now()>=c.expiresAt)return;
      if(event.data.type==='gs-failed'&&Object.keys(event.data).length===2){used=true;status.textContent='No valid session was shared. Sign in on GreeksSurge and run auth login again.';return;}
      if(event.data.type!=='gs-session'||Object.keys(event.data).length!==3)return;
      const p=event.data.payload;
      if(!p||typeof p!=='object'||Object.keys(p).sort().join(',')!=='data,iv,key'||!['key','iv','data'].every(k=>typeof p[k]==='string'&&p[k].length<=24000&&/^[A-Za-z0-9+/]+={0,2}$/.test(p[k])))return;
      used=true;status.textContent='Validating your GreeksSurge account…';
      try{const response=await fetch(base+'session',{method:'POST',headers,body:JSON.stringify(p),credentials:'omit',redirect:'error'});const result=await response.json();if(!response.ok||result.ok!==true)throw new Error();clearTimeout(expiryTimer);status.textContent='Authenticated. Return to the terminal and delete the temporary bookmark.';cancel.disabled=true;}
      catch{status.textContent='Connection failed. No successful login was confirmed. Check the terminal and run auth login again.';}
    });`;

  const frame = (body: string, script: string) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect GreeksSurge MCP</title><style nonce="${options.scriptNonce}">body{font:17px/1.55 system-ui,sans-serif;max-width:660px;margin:6vh auto;padding:24px;color:#202124;background:#fff}h1{font-size:28px}li{margin:16px 0}a{color:#174ea6}button,.bookmark{display:inline-block;padding:10px 16px;border:1px solid #555;border-radius:6px;font:inherit;margin:8px 8px 8px 0}button{cursor:pointer;background:#fff}button:disabled{opacity:.6;cursor:default}.note{font-size:14px;color:#555}#status{min-height:3em}</style></head><body>${body}<p id="status" role="status" aria-live="polite">This connection expires in five minutes. Your browser stays open.</p><button id="cancel">Cancel connection</button><script id="handoff-config" type="application/json" nonce="${options.scriptNonce}">${config}</script><script nonce="${options.scriptNonce}">${script}</script></body></html>`;
  return {
    helper: frame(
      `<h1>Connect GreeksSurge MCP</h1><p>Sign in in your normal browser. Share your session only when you choose.</p><ol><li>Drag this one-time bookmark to your bookmarks bar:<br><a id="bookmark" class="bookmark" draggable="true" href="${escapeAttribute(bookmark)}">Connect GreeksSurge</a></li><li><a href="${SITE}/login" target="_blank" rel="noopener noreferrer">Open GreeksSurge and sign in</a> using the account that owns your subscription.</li><li>On the signed-in GreeksSurge tab, click the saved bookmark. Approve the connection in its popup.</li></ol><p class="note">No password or token copying. This bookmark works only on GreeksSurge and expires with this login. Delete it afterwards. If browser policy blocks it, do not disable browser security or paste code into developer tools.</p>`,
      helperScript,
    ),
    receiver: frame(
      `<h1>Share your GreeksSurge session?</h1><p>This gives the local MCP on this computer access through your current GreeksSurge account. The MCP provides read-only tools; the imported website session retains its upstream permissions.</p><p>No Google password is shared. Cancel if you did not start this login in your terminal.</p><button id="connect">Approve connection</button>`,
      receiverScript,
    ),
  };
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
