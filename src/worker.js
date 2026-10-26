// Zaremperfumery API – Cloudflare Worker + D1. Secrets: ADMIN_PASSWORD, PAYSTACK_SECRET_KEY (optional)
const J=(d,s=200,h={})=>new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json',...h}});
const enc=new TextEncoder(),S=v=>String(v??'').trim().slice(0,1000);
const ref=p=>p+'-'+crypto.randomUUID().replace(/-/g,'').slice(0,7).toUpperCase();
const E=(m,s=400)=>Object.assign(new Error(m),{s});
const b64=u=>btoa(String.fromCharCode(...new Uint8Array(u)));
async function hmac(key,msg,hash='SHA-256'){const k=await crypto.subtle.importKey('raw',enc.encode(key),{name:'HMAC',hash},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(msg)))}
const sig=async(env,m)=>b64(await hmac(env.ADMIN_PASSWORD||'unset',m));
async function mk(env,kind,id){const e=Date.now()+(kind==='c'?6048e5:432e5);return`${kind}.${id}.${e}.${await sig(env,`${kind}.${id}.${e}`)}`}
async function chk(env,r,kind){const[k,id,e,s]=(r.headers.get('authorization')||'').replace('Bearer ','').split('.');return k===kind&&+e>Date.now()&&s===await sig(env,`${k}.${id}.${e}`)?id:null}
async function hashPw(pw,salt=crypto.getRandomValues(new Uint8Array(16))){const k=await crypto.subtle.importKey('raw',enc.encode(pw),'PBKDF2',false,['deriveBits']);return b64(salt)+':'+b64(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:100000},k,256))}
const unb=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const ALLP=['orders','enquiries','products','discounts','customers','reports','settings'],perms=a=>ALLP.filter(k=>Array.isArray(a)&&a.includes(k)).join(',');
const log=(env,W,a,d)=>env.DB.prepare('INSERT INTO activity(who,action,detail) VALUES(?,?,?)').bind(W.name,a,S(d)).run();
const NEED=[[/\/(orders|orders\.csv)/,'orders'],[/\/enquiries/,'enquiries'],[/\/(products|variants|upload)/,'products'],[/\/discounts/,'discounts'],[/\/customers/,'customers'],[/\/settings/,'settings'],[/\/stats/,'reports'],[/\/(staff|activity)/,'owner']];
async function who(env,r){const[k,id,e,s]=(r.headers.get('authorization')||'').replace('Bearer ','').split('.');if(!(k&&+e>Date.now()&&s&&s===await sig(env,`${k}.${id}.${e}`)))return null;
 if(k==='a')return{owner:true,name:'Owner',perms:ALLP};if(k==='s'){const st=await env.DB.prepare('SELECT * FROM staff WHERE id=? AND active=1').bind(+id).first();return st?{owner:false,name:st.name,perms:st.permissions.split(',').filter(Boolean)}:null}return null}
const IM=x=>{try{const a=JSON.parse(x.images||'[]');return a.length?a:(x.image_url?[x.image_url]:[])}catch{return x.image_url?[x.image_url]:[]}};
const PAID=['payment_confirmed','processing','ready_for_pickup','dispatched','delivered'];
const STAT=['pending_confirmation','awaiting_payment','payment_confirmed','processing','ready_for_pickup','dispatched','delivered','cancelled'];
const ENQ=['new','contacted','quotation_prepared','awaiting_response','converted_to_order','closed'];
async function setStatus(env,o,st){const it=(await env.DB.prepare('SELECT variant_id,qty FROM order_items WHERE order_id=?').bind(o.id).all()).results,b=[];
 if(PAID.includes(st)&&!o.stock_deducted){for(const i of it)b.push(env.DB.prepare('UPDATE variants SET stock=MAX(stock-?,0) WHERE id=? AND stock IS NOT NULL').bind(i.qty,i.variant_id),env.DB.prepare('INSERT INTO stock_log(variant_id,change,reason) VALUES(?,?,?)').bind(i.variant_id,-i.qty,'order '+o.ref));b.push(env.DB.prepare('UPDATE orders SET stock_deducted=1 WHERE id=?').bind(o.id))}
 if(st==='cancelled'&&o.stock_deducted){for(const i of it)b.push(env.DB.prepare('UPDATE variants SET stock=stock+? WHERE id=? AND stock IS NOT NULL').bind(i.qty,i.variant_id),env.DB.prepare('INSERT INTO stock_log(variant_id,change,reason) VALUES(?,?,?)').bind(i.variant_id,i.qty,'cancelled '+o.ref));b.push(env.DB.prepare('UPDATE orders SET stock_deducted=0 WHERE id=?').bind(o.id))}
 b.push(env.DB.prepare('UPDATE orders SET status=? WHERE id=?').bind(st,o.id));await env.DB.batch(b)}
// Server-side pricing: never trusts client prices
async function quote(env,items,code){if(!Array.isArray(items)||!items.length||items.length>50)throw E('Your cart is empty');const lines=[];let sub=0,priced=true;
 for(const i of items){const q=Math.floor(+i.qty);if(!(q>=1&&q<=500))throw E('Invalid quantity');
  const v=await env.DB.prepare('SELECT v.id,v.size,v.price_kobo,v.stock,p.name,p.category FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=? AND p.published=1').bind(+i.variant_id).first();
  if(!v)throw E('An item is no longer available');if(v.stock!==null&&v.stock<q)throw E(v.name+' has only '+v.stock+' left',409);
  if(v.price_kobo===null)priced=false;else sub+=v.price_kobo*q;lines.push({...v,q})}
 let disc=0,dcode=null;
 if(code){const d=await env.DB.prepare('SELECT * FROM discounts WHERE code=? AND active=1').bind(S(code).toUpperCase()).first(),now=new Date().toISOString().slice(0,10);
  if(!d||(d.starts&&now<d.starts)||(d.ends&&now>d.ends)||(d.max_uses&&d.used>=d.max_uses))throw E('Discount code is not valid');
  if(!priced)throw E('Discount codes apply once all items have prices');if(sub<(d.min_kobo||0))throw E('Minimum order for this code is ₦'+(d.min_kobo/100).toLocaleString());
  const base=d.category?lines.filter(l=>l.category===d.category).reduce((a,l)=>a+l.price_kobo*l.q,0):sub;
