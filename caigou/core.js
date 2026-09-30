(function(root){
const digit={'零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
function number(s){if(/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(s))return String(Number(s)); if(s==='半')return s; if(s.includes('点')){const [a,b]=s.split('点');return number(a)+'.'+[...b].map(x=>digit[x]??x).join('');}let n=0,t=0;for(const x of s){if(x in digit)t=digit[x];else {n+=(t||1)*({'十':10,'百':100,'千':1000}[x]||0);t=0;}}return String(n+t);}
function parse(text){return text.split(/[\n\r、，,；;]+/).map(s=>s.trim()).filter(Boolean).map(raw=>{const clean=raw.replace(/\s+/g,' ').trim();const m=clean.match(/^(.+?)\s*([零〇一二两三四五六七八九十百千点\d.]+?|半)\s*(公斤|千克|毫升|斤|两|克|kg|g|升|ml|个|颗|棵|根|把|捆儿?|袋|盒|包|瓶|桶|只|条|块|份|元|块钱)?(半)?$/i);if(!m)return {text:clean,recognized:false};const qty=number(m[2]);const unit=(m[3]||'').replace('儿','').replace('块钱','元');return {text:m[1].trim()+' '+qty+unit+(m[4]||''),recognized:true,name:m[1].trim(),qty,unit};});}
function display(text){const m=text.match(/^(.+?)\s*((?:\d+(?:\.\d+)?|半)\s*(?:公斤|千克|毫升|斤|两|克|kg|g|升|ml|个|颗|棵|根|把|捆儿?|袋|盒|包|瓶|桶|只|条|块|份|元|块钱)?(?:半)?)$/i);return m?m[1].trim()+'\u3000\u3000'+m[2].replace(/\s+/g,''):text;}
root.ListCore={parse,number,display};if(typeof module!=='undefined')module.exports=root.ListCore;
})(typeof window!=='undefined'?window:globalThis);
