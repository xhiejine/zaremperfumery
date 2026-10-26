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
  if(!base)throw E('This code does not apply to your items');disc=Math.min(base,d.type==='percent'?Math.floor(base*d.value/100):d.value);dcode=d.code}
 return{lines,sub:priced?sub:null,priced,disc,dcode}}
async function markPaid(env,reference){const pay=await env.DB.prepare('SELECT * FROM payments WHERE reference=?').bind(reference).first();if(!pay||pay.status==='success'||!env.PAYSTACK_SECRET_KEY)return pay;
 const r=await fetch('https://api.paystack.co/transaction/verify/'+encodeURIComponent(reference),{headers:{authorization:'Bearer '+env.PAYSTACK_SECRET_KEY}}).then(x=>x.json()),d=r.data;if(!r.status||!d)return pay;
 if(d.status==='success'&&d.amount===pay.amount_kobo&&d.currency==='NGN'){const c=await env.DB.prepare("UPDATE payments SET status='success' WHERE reference=? AND status!='success'").bind(reference).run();
  if(c.meta.changes){const o=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(pay.order_id).first();await env.DB.prepare("UPDATE orders SET payment_status='paid' WHERE id=?").bind(o.id).run();if(o.status!=='cancelled')await setStatus(env,o,'payment_confirmed')}}
 else if(['failed','abandoned'].includes(d.status))await env.DB.prepare("UPDATE payments SET status=? WHERE reference=? AND status='pending'").bind(d.status,reference).run();
 return await env.DB.prepare('SELECT * FROM payments WHERE reference=?').bind(reference).first()}
const total=o=>o.subtotal_kobo===null||o.delivery_fee_kobo===null?null:o.subtotal_kobo-(o.discount_kobo||0)+o.delivery_fee_kobo;
const pub=async(DB,o)=>({ref:o.ref,status:o.status,payment_status:o.payment_status,fulfilment:o.fulfilment,payment_method:o.payment_method,subtotal_kobo:o.subtotal_kobo,discount_kobo:o.discount_kobo,delivery_fee_kobo:o.delivery_fee_kobo,total_kobo:total(o),created_at:o.created_at,items:(await DB.prepare('SELECT name,size,qty,price_kobo FROM order_items WHERE order_id=?').bind(o.id).all()).results});
const num=v=>v===''||v==null?null:+v,rows=async(DB,s,...a)=>(await DB.prepare(s).bind(...a).all()).results;
export default{async fetch(r,env){const u=new URL(r.url),p=u.pathname,m=r.method,DB=env.DB;let x;
try{
if(p==='/api/products'&&m==='GET'){const ps=await rows(DB,'SELECT * FROM products WHERE published=1 ORDER BY id DESC'),vs=await rows(DB,'SELECT id,product_id,size,price_kobo,stock FROM variants');
 return J(ps.map(x=>({...x,images:IM(x),variants:vs.filter(v=>v.product_id===x.id).map(v=>({id:v.id,size:v.size,price_kobo:v.price_kobo,in_stock:v.stock===null||v.stock>0}))})),200,{'cache-control':'public,max-age=30'})}
if((x=p.match(/^\/api\/media\/([\w-]+\.(jpg|png|webp))$/))&&m==='GET'){const o=await env.IMAGES.get(x[1]);if(!o)throw E('Not found',404);return new Response(o.body,{headers:{'content-type':o.httpMetadata?.contentType||'image/jpeg','cache-control':'public,max-age=31536000,immutable'}})}
if(p==='/api/settings'&&m==='GET'){const s=Object.fromEntries((await rows(DB,'SELECT k,v FROM settings')).map(x=>[x.k,x.v]));return J({announcement:s.announcement,bank_details:s.bank_details,paystack:!!env.PAYSTACK_SECRET_KEY})}
if(p==='/api/quote'&&m==='POST'){const b=await r.json(),q=await quote(env,b.items,b.code);return J({subtotal_kobo:q.sub,discount_kobo:q.disc,code:q.dcode})}
if(p==='/api/register'&&m==='POST'){const b=await r.json();if(!S(b.name)||!/^\S+@\S+\.\S+$/.test(S(b.email))||S(b.password).length<8||String(b.password).length>200)throw E('Name, valid email and a password of 8+ characters are required');
 try{const c=await DB.prepare('INSERT INTO customers(name,email,phone,pw) VALUES(?,?,?,?)').bind(S(b.name),S(b.email).toLowerCase(),S(b.phone),await hashPw(String(b.password))).run();return J({token:await mk(env,'c',c.meta.last_row_id)},201)}catch(e){throw E('That email is already registered',409)}}
if(p==='/api/login'&&m==='POST'){const b=await r.json(),c=await DB.prepare('SELECT * FROM customers WHERE email=?').bind(S(b.email).toLowerCase()).first();
 if(!c||await hashPw(String(b.password),unb(c.pw.split(':')[0]))!==c.pw)throw E('Wrong email or password',401);return J({token:await mk(env,'c',c.id)})}
if(p==='/api/me'&&m==='GET'){const id=await chk(env,r,'c');if(!id)throw E('Please log in',401);const c=await DB.prepare('SELECT name,email,phone FROM customers WHERE id=?').bind(+id).first(),os=await rows(DB,'SELECT * FROM orders WHERE customer_id=? ORDER BY id DESC',+id);
 return J({profile:c,orders:await Promise.all(os.map(o=>pub(DB,o))),enquiries:await rows(DB,'SELECT ref,status,created_at FROM enquiries WHERE customer_id=? ORDER BY id DESC',+id)})}
if(p==='/api/orders'&&m==='POST'){const b=await r.json();
 if(!S(b.name)||!/^[+\d\s-]{7,20}$/.test(S(b.phone))||!['delivery','pickup'].includes(b.fulfilment))throw E('Name, phone and delivery or pickup are required');
 if(b.fulfilment==='delivery'&&(!S(b.address)||!S(b.state)))throw E('Delivery address and state are required');
 const method=['paystack','bank_transfer','whatsapp'].includes(b.payment_method)?b.payment_method:'whatsapp';
 if(method==='paystack'&&(!env.PAYSTACK_SECRET_KEY||!/^\S+@\S+\.\S+$/.test(S(b.email))))throw E('Card payment needs a valid email address');
 const q=await quote(env,b.items,b.code),rf=ref('ZP'),cid=await chk(env,r,'c');
 await DB.batch([DB.prepare('INSERT INTO orders(ref,customer_id,name,phone,email,address,state,city,fulfilment,notes,payment_method,subtotal_kobo,discount_kobo,discount_code,delivery_fee_kobo) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(rf,cid?+cid:null,S(b.name),S(b.phone),S(b.email),S(b.address),S(b.state),S(b.city),b.fulfilment,S(b.notes),method,q.sub,q.disc,q.dcode,b.fulfilment==='pickup'?0:null),
  ...q.lines.map(l=>DB.prepare('INSERT INTO order_items(order_id,variant_id,name,size,qty,price_kobo) VALUES((SELECT id FROM orders WHERE ref=?),?,?,?,?,?)').bind(rf,l.id,l.name,l.size,l.q,l.price_kobo)),
  ...(q.dcode?[DB.prepare('UPDATE discounts SET used=used+1 WHERE code=?').bind(q.dcode)]:[])]);
 return J({ref:rf,note:'Order received. This is not yet paid or confirmed: we will confirm availability, delivery charge and payment details.'},201)}
if(p==='/api/orders/lookup'&&m==='GET'){const o=await DB.prepare('SELECT * FROM orders WHERE ref=?').bind(S(u.searchParams.get('ref')).toUpperCase()).first();
 if(!o||S(o.phone).replace(/\D/g,'').slice(-9)!==S(u.searchParams.get('phone')).replace(/\D/g,'').slice(-9)||!u.searchParams.get('phone'))throw E('Order not found. Check the reference and phone number.',404);
 const d=await pub(DB,o);d.can_pay=!!env.PAYSTACK_SECRET_KEY&&d.total_kobo>0&&!!o.email&&o.payment_status!=='paid'&&o.status!=='cancelled';return J(d)}
if(x=p.match(/^\/api\/orders\/(ZP-\w+)\/(transfer-made|pay)$/)){if(m!=='POST')throw E('Method not allowed',405);const b=await r.json(),o=await DB.prepare('SELECT * FROM orders WHERE ref=?').bind(x[1]).first();
 if(!o||!b.phone||S(o.phone).replace(/\D/g,'').slice(-9)!==S(b.phone).replace(/\D/g,'').slice(-9))throw E('Order not found',404);
 if(x[2]==='transfer-made'){await DB.prepare("UPDATE orders SET status='awaiting_payment',payment_status='transfer_claimed' WHERE id=? AND payment_status='unpaid'").bind(o.id).run();return J({ok:true})}
 const t=total(o);if(!env.PAYSTACK_SECRET_KEY)throw E('Card payment is not enabled');if(!t||t<=0)throw E('We are still confirming your delivery charge. We will contact you with the final amount.');if(o.payment_status==='paid')throw E('Already paid');if(!o.email)throw E('Email required for card payment');
 const rfr=o.ref+'_'+Date.now().toString(36),site=env.SITE_URL||u.origin;
 const pr=await fetch('https://api.paystack.co/transaction/initialize',{method:'POST',headers:{authorization:'Bearer '+env.PAYSTACK_SECRET_KEY,'content-type':'application/json'},body:JSON.stringify({email:o.email,amount:t,currency:'NGN',reference:rfr,callback_url:site+'/?pay='+rfr})}).then(x=>x.json());
 if(!pr.status)throw E('Could not start payment. Try again.',502);await DB.prepare('INSERT INTO payments(reference,order_id,amount_kobo) VALUES(?,?,?)').bind(rfr,o.id,t).run();return J({url:pr.data.authorization_url})}
if(p==='/api/paystack/verify'&&m==='GET'){const pay=await markPaid(env,S(u.searchParams.get('reference')));if(!pay)throw E('Unknown payment',404);const o=await DB.prepare('SELECT ref FROM orders WHERE id=?').bind(pay.order_id).first();return J({status:pay.status,ref:o.ref})}
if(p==='/api/paystack/webhook'&&m==='POST'){const raw=await r.text();if(!env.PAYSTACK_SECRET_KEY)return J({},400);
 const h=[...await hmac(env.PAYSTACK_SECRET_KEY,raw,'SHA-512')].map(b=>b.toString(16).padStart(2,'0')).join('');if(h!==r.headers.get('x-paystack-signature'))return J({},401);
 const ev=JSON.parse(raw);if(ev.event==='charge.success'&&ev.data?.reference)await markPaid(env,ev.data.reference);return J({ok:true})}
if(p==='/api/enquiries'&&m==='POST'){const b=await r.json();if(!S(b.name)||!S(b.phone)||!S(b.requested)||!b.consent)throw E('Name, phone, request and consent are required');
 const rf=ref('WH'),cid=await chk(env,r,'c');await DB.prepare('INSERT INTO enquiries(ref,customer_id,name,business,email,phone,location,categories,requested,contact_pref,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(rf,cid?+cid:null,S(b.name),S(b.business),S(b.email),S(b.phone),S(b.location),S(b.categories),S(b.requested),S(b.contact_pref),S(b.notes)).run();return J({ref:rf},201)}
if(p==='/api/subscribe'&&m==='POST'){const b=await r.json();if(!/^\S+@\S+\.\S+$/.test(S(b.email))||!b.consent)throw E('Valid email and consent required');await DB.prepare('INSERT OR IGNORE INTO subscribers(email) VALUES(?)').bind(S(b.email).toLowerCase()).run();return J({ok:true})}
if((x=p.match(/^\/api\/img\/([\w.-]+)$/))&&m==='GET'){if(!env.IMAGES)throw E('Not found',404);const o=await env.IMAGES.get(x[1]);if(!o)throw E('Not found',404);return new Response(o.body,{headers:{'content-type':o.httpMetadata?.contentType||'image/jpeg','cache-control':'public,max-age=31536000,immutable'}})}
if(p==='/api/admin/login'&&m==='POST'){const b=await r.json(),em=S(b.email).toLowerCase(),key=(em||'owner')+'|'+(r.headers.get('cf-connecting-ip')||'');
 if((await DB.prepare("SELECT COUNT(*) n FROM login_fail WHERE k=? AND ts>datetime('now','-15 minute')").bind(key).first()).n>=5)throw E('Too many attempts. Try again in 15 minutes.',429);
 let tk=null;if(!em||em==='owner'){if(env.ADMIN_PASSWORD&&await sig(env,'x'+S(b.password))===await sig(env,'x'+env.ADMIN_PASSWORD))tk=await mk(env,'a',1)}
 else{const s=await DB.prepare('SELECT * FROM staff WHERE email=? AND active=1').bind(em).first();if(s&&await hashPw(String(b.password),unb(s.pw.split(':')[0]))===s.pw)tk=await mk(env,'s',s.id)}
 if(!tk){await DB.prepare('INSERT INTO login_fail(k) VALUES(?)').bind(key).run();throw E('Wrong email or password',401)}return J({token:tk})}
if(p.startsWith('/api/admin/')){throw E('Unauthorized',401);const W=await who(env,r);if(!W)throw E('Unauthorized',401);
 const nd=(NEED.find(n=>n[0].test(p))||[])[1];if(nd==='owner'?!W.owner:(nd&&!W.perms.includes(nd)))throw E('You do not have permission for this',403);
 if(p==='/api/admin/me')return J({name:W.name,owner:W.owner,perms:W.perms});
 if(p==='/api/admin/upload'&&m==='POST'){const ct=r.headers.get('content-type')||'',ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[ct];if(!ext)throw E('Upload a JPG, PNG or WebP image');const buf=await r.arrayBuffer(),h=[...new Uint8Array(buf.slice(0,12))],ok=(h[0]===255&&h[1]===216)||(h[0]===137&&h[1]===80)||(h[0]===82&&h[8]===87);
  if(!buf.byteLength||buf.byteLength>5242880||!ok)throw E('Image must be a real JPG, PNG or WebP under 5MB');const key=crypto.randomUUID()+'.'+ext;await env.IMAGES.put(key,buf,{httpMetadata:{contentType:ct}});await log(env,W,'upload',key);return J({url:'/api/media/'+key},201)}
 if(p==='/api/admin/staff'&&m==='GET')return J(await rows(DB,'SELECT id,name,email,permissions,active,created_at FROM staff ORDER BY id'));
 if(p==='/api/admin/staff'&&m==='POST'){const b=await r.json();if(!S(b.name)||!/^\S+@\S+\.\S+$/.test(S(b.email))||String(b.password||'').length<8)throw E('Name, valid email and an 8+ character password are required');
  try{await DB.prepare('INSERT INTO staff(name,email,pw,permissions) VALUES(?,?,?,?)').bind(S(b.name),S(b.email).toLowerCase(),await hashPw(String(b.password)),perms(b.permissions)).run()}catch{throw E('That email is already used',409)}await log(env,W,'staff_created',b.email);return J({ok:true},201)}
 if((x=p.match(/^\/api\/admin\/staff\/(\d+)$/))&&m==='PATCH'){const b=await r.json(),id=+x[1];if(b.permissions!==undefined)await DB.prepare('UPDATE staff SET permissions=? WHERE id=?').bind(perms(b.permissions),id).run();if(b.active!==undefined)await DB.prepare('UPDATE staff SET active=? WHERE id=?').bind(b.active?1:0,id).run();
  if(b.password){if(String(b.password).length<8)throw E('Password must be 8+ characters');await DB.prepare('UPDATE staff SET pw=? WHERE id=?').bind(await hashPw(String(b.password)),id).run()}await log(env,W,'staff_updated','#'+id+' '+Object.keys(b).filter(k=>k!=='password').join(','));return J({ok:true})}
 if(p==='/api/admin/activity')return J(await rows(DB,'SELECT who,action,detail,created_at FROM activity ORDER BY id DESC LIMIT 100'));
 
 if(p==='/api/admin/orders'&&m==='GET'){const os=await rows(DB,'SELECT * FROM orders ORDER BY id DESC LIMIT 300');for(const o of os)o.items=(await rows(DB,'SELECT name,size,qty,price_kobo FROM order_items WHERE order_id=?',o.id));return J(os)}
 if(p==='/api/admin/orders.csv'){const os=await rows(DB,'SELECT ref,created_at,name,phone,email,fulfilment,state,city,status,payment_status,subtotal_kobo,discount_kobo,delivery_fee_kobo FROM orders ORDER BY id DESC'),c=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  return new Response(Object.keys(os[0]||{ref:1}).join(',')+'\n'+os.map(o=>Object.values(o).map(c).join(',')).join('\n'),{headers:{'content-type':'text/csv','content-disposition':'attachment; filename=orders.csv'}})}
 if(x=p.match(/^\/api\/admin\/orders\/(\d+)$/)){const o=await DB.prepare('SELECT * FROM orders WHERE id=?').bind(+x[1]).first(),b=await r.json();if(!o)throw E('Not found',404);await log(env,W,'order_update',o.ref+' '+JSON.stringify(b).slice(0,200));
  if(b.status){if(!STAT.includes(b.status))throw E('Bad status');await setStatus(env,o,b.status)}
  if(b.payment_status&&['unpaid','transfer_claimed','paid','failed'].includes(b.payment_status))await DB.prepare('UPDATE orders SET payment_status=? WHERE id=?').bind(b.payment_status,o.id).run();
  if(b.delivery_fee_kobo!==undefined){if(!Number.isInteger(b.delivery_fee_kobo)||b.delivery_fee_kobo<0)throw E('Invalid delivery fee');await DB.prepare('UPDATE orders SET delivery_fee_kobo=? WHERE id=?').bind(b.delivery_fee_kobo,o.id).run()}
  if(b.internal_notes!==undefined)await DB.prepare('UPDATE orders SET internal_notes=? WHERE id=?').bind(S(b.internal_notes),o.id).run();return J({ok:true})}
 if(p==='/api/admin/enquiries'&&m==='GET')return J(await rows(DB,'SELECT * FROM enquiries ORDER BY id DESC LIMIT 300'));
 if(x=p.match(/^\/api\/admin\/enquiries\/(\d+)$/)){const b=await r.json();if(b.status&&!ENQ.includes(b.status))throw E('Bad status');await DB.prepare('UPDATE enquiries SET status=COALESCE(?,status),quote_notes=COALESCE(?,quote_notes) WHERE id=?').bind(b.status??null,b.quote_notes===undefined?null:S(b.quote_notes),+x[1]).run();return J({ok:true})}
 if(p==='/api/admin/customers')return J(await rows(DB,'SELECT c.id,c.name,c.email,c.phone,c.created_at,(SELECT COUNT(*) FROM orders o WHERE o.customer_id=c.id) orders FROM customers c ORDER BY c.id DESC LIMIT 300'));
 if(p==='/api/admin/products'&&m==='GET'){const ps=await rows(DB,'SELECT * FROM products ORDER BY id DESC');for(const x of ps){x.variants=await rows(DB,'SELECT * FROM variants WHERE product_id=?',x.id);x.images=IM(x)}return J(ps)}
 if(p==='/api/admin/products'&&m==='POST'){const b=await r.json();if(!S(b.name)||!S(b.category))throw E('Name and category required');
  const vs=(b.variants||[]).map(v=>({s:S(v.size),p:num(v.price_naira)===null?null:Math.round(num(v.price_naira)*100),k:num(v.stock)}));if(vs.some(v=>(v.p!==null&&!(v.p>=0))||(v.k!==null&&!(Number.isInteger(v.k)&&v.k>=0))))throw E('Invalid price or stock');
  const res=await DB.prepare('INSERT INTO products(name,category,type,gender,description,notes,image_url,published,is_new,is_featured) VALUES(?,?,?,?,?,?,?,1,?,?)').bind(S(b.name),S(b.category),S(b.type),S(b.gender)||null,S(b.description),S(b.notes),S(b.image_url),b.is_new?1:0,b.is_featured?1:0).run();
  for(const v of vs)await DB.prepare('INSERT INTO variants(product_id,size,price_kobo,stock) VALUES(?,?,?,?)').bind(res.meta.last_row_id,v.s,v.p,v.k).run();return J({id:res.meta.last_row_id},201)}
 if((x=p.match(/^\/api\/admin\/products\/(\d+)$/))&&m==='PATCH'){const b=await r.json();for(const k of['published','is_new','is_featured'])if(b[k]!==undefined)await DB.prepare(`UPDATE products SET ${k}=? WHERE id=?`).bind(b[k]?1:0,+x[1]).run();if(b.images!==undefined){const im=(Array.isArray(b.images)?b.images:[]).map(S).filter(u=>/^\/(img|api\/media)\//.test(u)).slice(0,8);await DB.prepare('UPDATE products SET images=?,image_url=? WHERE id=?').bind(JSON.stringify(im),im[0]||'',+x[1]).run()}
  for(const k of['name','category','type','gender','description','notes','image_url'])if(b[k]!==undefined){if(k==='name'&&!S(b[k]))throw E('Name required');await DB.prepare(`UPDATE products SET ${k}=? WHERE id=?`).bind(S(b[k])||(k==='gender'?null:''),+x[1]).run()}return J({ok:true})}
 if((x=p.match(/^\/api\/admin\/variants\/(\d+)$/))&&m==='PATCH'){const b=await r.json(),pr=num(b.price_naira)===null?null:Math.round(+b.price_naira*100),st=num(b.stock);if((pr!==null&&!(pr>=0))||(st!==null&&!(Number.isInteger(st)&&st>=0)))throw E('Invalid price or stock');await DB.prepare('UPDATE variants SET price_kobo=?,stock=? WHERE id=?').bind(pr,st,+x[1]).run();return J({ok:true})}
 if(p==='/api/admin/upload'&&m==='POST'){if(!env.IMAGES)throw E('Image storage is not set up. Create an R2 bucket and add the IMAGES binding (see README), or put image files in public/img.');
  const t=r.headers.get('content-type')||'',ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[t];if(!ext)throw E('Use a JPG, PNG or WebP image');
  const buf=await r.arrayBuffer();if(buf.byteLength>5e6||!buf.byteLength)throw E('Image must be under 5 MB');const key=crypto.randomUUID().replace(/-/g,'').slice(0,16)+'.'+ext;await env.IMAGES.put(key,buf,{httpMetadata:{contentType:t}});return J({url:'/api/img/'+key})}
 if((x=p.match(/^\/api\/admin\/products\/(\d+)\/variants$/))&&m==='POST'){const b=await r.json(),pr=num(b.price_naira)===null?null:Math.round(+b.price_naira*100),st=num(b.stock);if((pr!==null&&!(pr>=0))||(st!==null&&!(Number.isInteger(st)&&st>=0)))throw E('Invalid price or stock');await DB.prepare('INSERT INTO variants(product_id,size,price_kobo,stock) VALUES(?,?,?,?)').bind(+x[1],S(b.size),pr,st).run();return J({ok:true},201)}
 if((x=p.match(/^\/api\/admin\/variants\/(\d+)$/))&&m==='DELETE'){await DB.prepare('DELETE FROM variants WHERE id=?').bind(+x[1]).run();return J({ok:true})}
 if((x=p.match(/^\/api\/admin\/products\/(\d+)$/))&&m==='DELETE'){const used=await DB.prepare('SELECT 1 FROM order_items WHERE variant_id IN (SELECT id FROM variants WHERE product_id=?) LIMIT 1').bind(+x[1]).first();if(used)throw E('This product has orders. Unpublish (archive) it instead.',409);await DB.batch([DB.prepare('DELETE FROM variants WHERE product_id=?').bind(+x[1]),DB.prepare('DELETE FROM products WHERE id=?').bind(+x[1])]);return J({ok:true})}
 if((x=p.match(/^\/api\/admin\/enquiries\/(\d+)\/convert$/))&&m==='POST'){const q=await DB.prepare('SELECT * FROM enquiries WHERE id=?').bind(+x[1]).first();if(!q)throw E('Not found',404);if(q.status==='converted_to_order')throw E('Already converted',409);const rf=ref('ZP');
  await DB.batch([DB.prepare("INSERT INTO orders(ref,customer_id,name,phone,email,fulfilment,notes,payment_method,internal_notes) VALUES(?,?,?,?,?,'delivery',?,'whatsapp',?)").bind(rf,q.customer_id,q.name,q.phone,q.email,S(q.requested),'From wholesale enquiry '+q.ref+'. Quote: '+S(q.quote_notes)),DB.prepare("UPDATE enquiries SET status='converted_to_order' WHERE id=?").bind(q.id)]);return J({ref:rf},201)}
 if((x=p.match(/^\/api\/admin\/customers\/(\d+)\/orders$/)))return J(await rows(DB,'SELECT ref,status,payment_status,subtotal_kobo,created_at FROM orders WHERE customer_id=? ORDER BY id DESC',+x[1]))
 if(p==='/api/admin/settings'&&m==='GET')return J(Object.fromEntries((await rows(DB,'SELECT k,v FROM settings')).map(x=>[x.k,x.v])));
 if(p==='/api/admin/settings'&&m==='POST'){const b=await r.json();for(const k of['announcement','bank_details'])if(b[k]!==undefined)await DB.prepare('INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').bind(k,S(b[k])).run();return J({ok:true})}
 if(p==='/api/admin/discounts'&&m==='GET')return J(await rows(DB,'SELECT * FROM discounts ORDER BY id DESC'));
 if(p==='/api/admin/discounts'&&m==='POST'){const b=await r.json(),val=Math.round(+b.value*(b.type==='fixed'?100:1));if(!S(b.code)||!['percent','fixed'].includes(b.type)||!(val>0)||(b.type==='percent'&&val>100))throw E('Invalid discount');
  try{await DB.prepare('INSERT INTO discounts(code,type,value,min_kobo,starts,ends,max_uses,category) VALUES(?,?,?,?,?,?,?,?)').bind(S(b.code).toUpperCase(),b.type,val,Math.round((+b.min||0)*100),S(b.starts)||null,S(b.ends)||null,num(b.max_uses),S(b.category)||null).run()}catch(e){throw E('Code already exists',409)}return J({ok:true},201)}
 if((x=p.match(/^\/api\/admin\/discounts\/(\d+)$/))&&m==='PATCH'){const b=await r.json();await DB.prepare('UPDATE discounts SET active=? WHERE id=?').bind(b.active?1:0,+x[1]).run();return J({ok:true})}
 if(p==='/api/admin/stats'){return J({orders_by_status:await rows(DB,'SELECT status,COUNT(*) n FROM orders GROUP BY status'),verified_sales_kobo:(await DB.prepare("SELECT COALESCE(SUM(subtotal_kobo-COALESCE(discount_kobo,0)+COALESCE(delivery_fee_kobo,0)),0) t FROM orders WHERE payment_status='paid' AND status!='cancelled'").first()).t,low_stock:await rows(DB,'SELECT p.name,v.size,v.stock FROM variants v JOIN products p ON p.id=v.product_id WHERE v.stock IS NOT NULL AND v.stock<=5'),enquiries_by_status:await rows(DB,'SELECT status,COUNT(*) n FROM enquiries GROUP BY status'),new_customers_30d:(await DB.prepare("SELECT COUNT(*) n FROM customers WHERE created_at>=datetime('now','-30 day')").first()).n,top_products:await rows(DB,"SELECT oi.name,SUM(oi.qty) sold FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.payment_status='paid' GROUP BY oi.name ORDER BY sold DESC LIMIT 5")})}}
throw E('Not found',404)}catch(e){return J({error:e.s?e.message:'Server error'},e.s||500)}}};
