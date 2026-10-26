// Zaremperfumery storefront. Talks to the Worker API at /api/*.
const NO="2347063116408",$=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const wa=t=>`https://wa.me/${NO}?text=${encodeURIComponent(t)}`;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=k=>k==null?"Price on request":"₦"+(k/100).toLocaleString("en-NG");
const store={get(k,d){try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}};
let P=[],cart=store.get("zc",[]),tok=store.get("zt",""),S={},code="",disc=null;
async function api(path,method="GET",body){const r=await fetch("/api/"+path,{method,headers:{"content-type":"application/json",...(tok?{authorization:"Bearer "+tok}:{})},body:body?JSON.stringify(body):undefined});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Something went wrong");return d}
const findV=id=>{for(const p of P)for(const v of p.variants)if(v.id===id)return{p,v}};
const minPrice=p=>{const a=p.variants.map(v=>v.price_kobo).filter(x=>x!=null);return a.length?Math.min(...a):null};
const avail=p=>p.variants.some(v=>v.in_stock);
// ---------- product cards ----------
function card(p){const mp=minPrice(p),sizes=p.variants.map(v=>v.size).filter(Boolean).join(", ");
 return`<div class="p"><div class="ph" data-open="${p.id}">${p.image_url?`<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy">`:""}${p.is_new?'<span class="tag">New</span>':p.is_featured?'<span class="tag">Featured</span>':""}</div>
 <div class="pb"><b>${esc(p.name)}</b><span class="mut">${esc(p.type||"")}${sizes?" · "+esc(sizes):""}</span><span class="pr">${mp!=null&&p.variants.length>1?"From ":""}${money(mp)}</span><span class="mut">${avail(p)?"Available":"Out of stock"}</span>
 <div class="row"><button class="btn sm o" data-open="${p.id}">View</button>${avail(p)?`<button class="btn sm s" data-add="${p.id}">Add to cart</button>`:""}</div></div></div>`}
const filt=()=>{const g=k=>$(k).value,q=g("#q").toLowerCase(),mn=g("#fmin")?+g("#fmin")*100:null,mx=g("#fmax")?+g("#fmax")*100:null;
 let l=P.filter(p=>(!g("#fc")||p.category===g("#fc"))&&(!g("#fg")||p.gender===g("#fg"))&&(!g("#fs")||p.variants.some(v=>v.size===g("#fs")))&&(g("#fa")!=="in"||avail(p))
  &&(mn==null||p.variants.some(v=>v.price_kobo!=null&&v.price_kobo>=mn))&&(mx==null||p.variants.some(v=>v.price_kobo!=null&&v.price_kobo<=mx))
  &&(!q||[p.name,p.description,p.category,p.type,p.notes,...p.variants.map(v=>v.size)].join(" ").toLowerCase().includes(q)));
 const so=g("#so");if(so==="pa"||so==="pd")l=[...l].sort((a,b)=>((minPrice(a)??1e15)-(minPrice(b)??1e15))*(so==="pa"?1:-1));return l};
function draw(){const l=filt();$("#grid").innerHTML=l.map(card).join("");$("#empty").hidden=l.length>0;
 const n=P.filter(p=>p.is_new);$("#gnew").innerHTML=n.map(card).join("")||'<p class="mut">New products will appear here.</p>';
 const f=P.filter(p=>p.is_featured);$("#feat").hidden=!f.length;$("#gfeat").innerHTML=f.map(card).join("");
 $("#sug").innerHTML=P.map(p=>`<option value="${esc(p.name)}">`).join("")}
// ---------- product detail ----------
function openProduct(id){const p=P.find(x=>x.id==id);if(!p)return;const rel=P.filter(x=>x.id!==p.id&&x.category===p.category&&avail(x)).slice(0,3);
 $("#dp").innerHTML=`<button class="ic x" data-close>Close</button><div class="det"><div>${p.image_url?`<img id="dmi" src="${esc(p.image_url)}" alt="${esc(p.name)}">`:""}${(p.images||[]).length>1?`<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">${p.images.map(u=>`<img src="${esc(u)}" alt="" data-th="${esc(u)}" style="width:56px;height:56px;aspect-ratio:1;object-fit:cover;border-radius:8px;cursor:pointer">`).join("")}</div>`:""}</div><div><h2>${esc(p.name)}</h2><p class="mut">${esc(p.category)}${p.type?" · "+esc(p.type):""}${p.gender?" · "+esc(p.gender):""}</p>
 <p class="pr" id="dpr"></p><label class="mut">Size<br><select id="dv">${p.variants.map(v=>`<option value="${v.id}" ${v.in_stock?"":"disabled"}>${esc(v.size||"Standard")}${v.in_stock?"":" (out of stock)"}</option>`).join("")}</select></label>
 <label class="mut"> Quantity<br><input id="dq" type="number" min="1" max="500" value="1" style="width:80px"></label><div class="row" style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0"><button class="btn s" id="dadd">Add to cart</button><a class="btn o" id="dwa" target="_blank" rel="noopener">Order on WhatsApp</a></div>
 <p class="mut">The business confirms availability, delivery charges and payment instructions before an order is final.</p></div></div>
 ${p.description?`<p>${esc(p.description)}</p>`:""}${p.notes?`<p><b>Fragrance notes:</b> ${esc(p.notes)}</p>`:""}<p class="mut">Delivery within Lagos and other states, or pickup by arrangement. Charges confirmed before dispatch. <a href="#enq" data-close>Wholesale enquiry</a></p>
 ${rel.length?`<h3>Related products</h3><div class="grid">${rel.map(card).join("")}</div>`:""}`;
 const upd=()=>{const f=findV(+$("#dv").value);$("#dpr").textContent=money(f?.v.price_kobo);const q=Math.max(1,+$("#dq").value||1);
  $("#dwa").href=wa(`Hello Zaremperfumery, I'd like to order:\n${p.name} (${f?.v.size||"standard"}) x${q}\n${location.origin}/#p${p.id}\nPlease confirm availability, price and delivery.`)};
 $("#dv").onchange=$("#dq").oninput=upd;$("#dadd").onclick=()=>{addCart(+$("#dv").value,Math.max(1,+$("#dq").value||1));$("#dp").close()};
 const first=p.variants.find(v=>v.in_stock);if(first)$("#dv").value=first.id;upd();$("#dp").showModal();history.replaceState(null,"","#p"+p.id)}
// ---------- cart ----------
function addCart(vid,q=1){const i=cart.find(x=>x.v===vid);i?i.q+=q:cart.push({v:vid,q});saveCart();openCart()}
function saveCart(){store.set("zc",cart);$("#cn").textContent=cart.reduce((a,x)=>a+x.q,0)}
const items=()=>cart.map(x=>({variant_id:x.v,qty:x.q}));
const cartSub=()=>{let s=0,all=true;for(const x of cart){const f=findV(x.v);if(!f)continue;f.v.price_kobo==null?all=false:s+=f.v.price_kobo*x.q}return all&&cart.length?s:null};
function openCart(step){const d=$("#dc");d.innerHTML=`<button class="ic x" data-close>Close</button><h3>Your cart</h3><div id="cl"></div><div id="ct"></div><div id="cf"></div>`;renderCart();d.showModal()}
function renderCart(){const rows=cart.map(x=>({x,f:findV(x.v)})).filter(r=>r.f);$("#cl").innerHTML=rows.map(({x,f})=>`<div class="ci"><span>${esc(f.p.name)}<br><span class="mut">${esc(f.v.size||"")} · ${money(f.v.price_kobo)}</span></span><span><button class="chip" data-q="${x.v}:-1">−</button> ${x.q} <button class="chip" data-q="${x.v}:1">+</button></span></div>`).join("")||"<p>Your cart is empty.</p>";
 const s=cartSub();$("#ct").innerHTML=rows.length?`<p>Subtotal: <b>${money(s)}</b>${disc?`<br>Discount (${esc(disc.code)}): −${money(disc.discount_kobo)}`:""}</p><p class="mut">Delivery charge is confirmed by us; it is not added automatically.</p><div style="display:flex;gap:6px"><input id="dcode" placeholder="Discount code" value="${esc(code)}"><button class="chip" id="dapply">Apply</button></div><div id="dmsg" class="mut"></div><button class="btn s" id="tocheckout" style="margin-top:10px">Checkout</button>`:"";$("#cf").innerHTML=""}
function checkoutForm(){const pay=S.paystack;$("#cf").innerHTML=`<h3 style="margin-top:14px">Your details</h3><form class="f" id="fo"><label>Full name<input name="name" required></label><label>Phone<input name="phone" required inputmode="tel"></label><label>Email (needed for card payment)<input name="email" type="email"></label>
 <label>Delivery or pickup<select name="fulfilment" id="ffl"><option value="delivery">Delivery</option><option value="pickup">Pickup (by arrangement)</option></select></label><div id="addr" class="f"><label>Address<input name="address"></label><label>State<input name="state"></label><label>City / area<input name="city"></label></div>
 <label>Payment<select name="payment_method"><option value="whatsapp">Pay later – confirm on WhatsApp</option><option value="bank_transfer">Bank transfer</option>${pay?'<option value="paystack">Card (Paystack)</option>':""}</select></label><label>Notes<textarea name="notes" rows="2"></textarea></label>
 <p class="mut">Delivery cost is confirmed with you. Your order is not paid until payment is verified.</p><button class="btn s">Place order</button><div id="om" class="err"></div></form>`;
 $("#ffl").onchange=e=>$("#addr").hidden=e.target.value==="pickup";
 $("#fo").onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{const r=await api("orders","POST",{...f,items:items(),code});cart=[];code="";disc=null;saveCart();done(r.ref,f)}catch(er){$("#om").textContent=er.message}}}
function done(ref,f){const msg=`Hello Zaremperfumery, my order reference is ${ref}. Please confirm availability, delivery charge and payment details.`;
 $("#dc").innerHTML=`<button class="ic x" data-close>Close</button><h3>Order received</h3><p>Reference: <b>${ref}</b></p><div class="msg">This order is <b>not yet paid or confirmed</b>. We will confirm availability, delivery charge and payment instructions. Keep your reference and phone number to track it.</div>
 ${f.payment_method==="bank_transfer"?`<div class="msg"><b>Bank transfer</b><br>${esc(S.bank_details).replace(/\n/g,"<br>")}<br>Use <b>${ref}</b> as the payment reference. We confirm the exact amount including delivery.</div><button class="btn s" id="tm">I have made the transfer</button> `:""}
 ${f.payment_method==="paystack"?`<button class="btn s" id="pn">Pay by card</button> `:""}<a class="btn o" target="_blank" rel="noopener" href="${wa(msg)}">Message us on WhatsApp</a><div id="dm"></div>`;
 const ph=f.phone;if($("#tm"))$("#tm").onclick=async()=>{try{await api(`orders/${ref}/transfer-made`,"POST",{phone:ph});$("#dm").innerHTML='<div class="msg">Thanks. Your order is awaiting payment verification by our team.</div>'}catch(e){$("#dm").textContent=e.message}};
 if($("#pn"))$("#pn").onclick=()=>payCard(ref,ph)}
async function payCard(ref,phone){try{const r=await api(`orders/${ref}/pay`,"POST",{phone});location.href=r.url}catch(e){const m=$("#dm")||$("#tm2");alert(e.message)}}
// ---------- account & tracking ----------
function openAccount(){const d=$("#da");if(!tok){d.innerHTML=`<button class="ic x" data-close>Close</button><h3>Account</h3><form class="f" id="flog"><b>Log in</b><label>Email<input name="email" type="email" required></label><label>Password<input name="password" type="password" required></label><button class="btn s">Log in</button></form><hr><form class="f" id="freg"><b>Create account</b><label>Name<input name="name" required></label><label>Email<input name="email" type="email" required></label><label>Phone<input name="phone"></label><label>Password (8+ characters)<input name="password" type="password" minlength="8" required></label><button class="btn s">Register</button></form><div id="am" class="err"></div><p class="mut">Guest checkout is always available. Password reset: contact us on WhatsApp.</p>`;
  for(const [id,path] of [["flog","login"],["freg","register"]])$("#"+id).onsubmit=async e=>{e.preventDefault();try{const r=await api(path,"POST",Object.fromEntries(new FormData(e.target)));tok=r.token;store.set("zt",tok);openAccount()}catch(er){$("#am").textContent=er.message}}}
 else api("me").then(m=>{d.innerHTML=`<button class="ic x" data-close>Close</button><h3>Hello, ${esc(m.profile.name)}</h3><p class="mut">${esc(m.profile.email)}</p><h3>Your orders</h3>${m.orders.map(o=>`<div class="ci"><span><b>${o.ref}</b><br><span class="mut">${o.items.map(i=>esc(i.name)+" ×"+i.qty).join(", ")}</span></span><span>${o.status.replace(/_/g," ")}<br><span class="mut">${o.payment_status}</span></span></div>`).join("")||'<p class="mut">No orders yet.</p>'}<h3>Wholesale enquiries</h3>${m.enquiries.map(e=>`<div class="ci"><b>${e.ref}</b><span>${e.status.replace(/_/g," ")}</span></div>`).join("")||'<p class="mut">None yet.</p>'}<button class="btn o" id="lo">Log out</button>`;$("#lo").onclick=()=>{tok="";store.set("zt","");d.close()}}).catch(()=>{tok="";store.set("zt","");openAccount()});d.showModal()}
async function track(f){try{const o=await api(`orders/lookup?ref=${encodeURIComponent(f.ref)}&phone=${encodeURIComponent(f.phone)}`);const d=$("#da");
 d.innerHTML=`<button class="ic x" data-close>Close</button><h3>Order ${o.ref}</h3><p>Status: <b>${o.status.replace(/_/g," ")}</b> · Payment: <b>${o.payment_status.replace(/_/g," ")}</b></p>${o.items.map(i=>`<div class="ci"><span>${esc(i.name)} (${esc(i.size)}) ×${i.qty}</span><span>${money(i.price_kobo)}</span></div>`).join("")}<p>Subtotal ${money(o.subtotal_kobo)} · Delivery ${o.delivery_fee_kobo==null?"to be confirmed":money(o.delivery_fee_kobo)}${o.total_kobo!=null?`<br><b>Total ${money(o.total_kobo)}</b>`:""}</p>${o.can_pay?'<button class="btn s" id="pn">Pay by card</button> ':""}<a class="btn o" target="_blank" rel="noopener" href="${wa("Hello Zaremperfumery, update on order "+o.ref+"?")}">Ask on WhatsApp</a>`;
 if($("#pn"))$("#pn").onclick=()=>payCard(o.ref,f.phone);d.showModal()}catch(e){alert(e.message)}}
// ---------- events ----------
document.addEventListener("click",e=>{const t=e.target;let a;
 if(a=t.closest("[data-open]"))openProduct(a.dataset.open);else if(a=t.closest("[data-add]")){const p=P.find(x=>x.id==a.dataset.add),v=p.variants.filter(v=>v.in_stock);v.length===1?addCart(v[0].id):openProduct(p.id)}
 else if(a=t.closest("[data-th]"))$("#dmi").src=a.dataset.th;else if(t.closest("[data-close]"))t.closest("dialog").close();else if(a=t.closest("[data-q]")){const[v,d]=a.dataset.q.split(":"),i=cart.find(x=>x.v==v);i.q+=+d;if(i.q<1)cart=cart.filter(x=>x!==i);saveCart();renderCart()}
 else if(a=t.closest("[data-cat]")){$("#fc").value=a.dataset.cat;draw();location.hash="shop"}else if(a=t.closest("[data-g]")){$("#fg").value=a.dataset.g;draw();location.hash="shop"}
 else if(t.id==="tocheckout")checkoutForm();else if(t.id==="dapply"){code=$("#dcode").value.trim();api("quote","POST",{items:items(),code}).then(r=>{disc={code:r.code,discount_kobo:r.discount_kobo};renderCart()}).catch(er=>{disc=null;$("#dmsg").textContent=er.message;$("#dmsg").className="err"})}
 if(t.tagName==="DIALOG")t.close()});
$("#bc").onclick=()=>openCart();$("#ba").onclick=openAccount;$("#bs").onclick=()=>{location.hash="shop";$("#q").focus()};
$("#mb").onclick=()=>{const o=$("#nv").classList.toggle("o");$("#mb").setAttribute("aria-expanded",o)};$$("#nv a").forEach(a=>a.onclick=()=>{$("#nv").classList.remove("o");$("#mb").setAttribute("aria-expanded",false)});
["#q","#fc","#fg","#fs","#fa","#fmin","#fmax","#so"].forEach(s=>$(s).addEventListener("input",draw));$("#fr").onclick=()=>{["#q","#fc","#fg","#fs","#fa","#fmin","#fmax","#so"].forEach(s=>$(s).value="");draw()};
$("#fe").onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.consent=!!f.consent;try{const r=await api("enquiries","POST",f);$("#em").innerHTML=`<div class="msg">Enquiry received. Reference <b>${r.ref}</b>. We will follow up with pricing and availability. <a target="_blank" rel="noopener" href="${wa("Hello Zaremperfumery, wholesale enquiry "+r.ref+" from "+f.name)}">Follow up on WhatsApp</a></div>`;e.target.reset()}catch(er){$("#em").innerHTML=`<div class="err">${esc(er.message)}</div>`}};
$("#fn").onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{await api("subscribe","POST",{email:f.email,consent:!!f.consent});$("#nm").innerHTML='<div class="msg">Thanks, you are subscribed.</div>';e.target.reset()}catch(er){$("#nm").innerHTML=`<div class="err">${esc(er.message)}</div>`}};
$("#ft").onsubmit=e=>{e.preventDefault();track(Object.fromEntries(new FormData(e.target)))};
addEventListener("hashchange",()=>{const d=$(location.hash.startsWith("#pol-")?location.hash:"#none");if(d)d.open=true});
// ---------- start ----------
$("#wl").href=$("#wl2").href=$("#fab").href=wa("Hello Zaremperfumery, I have a wholesale enquiry.");saveCart();
(async()=>{try{S=await api("settings");if(S.announcement){$("#bar").textContent=S.announcement;$("#bar").hidden=false}}catch{}
 try{P=await api("products")}catch{$("#grid").innerHTML='<p class="err">Could not load products. Please refresh.</p>'}
 $("#fs").innerHTML='<option value="">All sizes</option>'+[...new Set(P.flatMap(p=>p.variants.map(v=>v.size)).filter(Boolean))].map(s=>`<option>${esc(s)}</option>`).join("");draw();
 if(location.hash.startsWith("#p")&&!location.hash.startsWith("#pol"))openProduct(location.hash.slice(2));
 const pr=new URLSearchParams(location.search).get("pay");if(pr){history.replaceState(null,"","/");try{const r=await api("paystack/verify?reference="+encodeURIComponent(pr)),d=$("#da");
  d.innerHTML=`<button class="ic x" data-close>Close</button><h3>${r.status==="success"?"Payment received":"Payment not completed"}</h3><p>Order <b>${r.ref}</b>. ${r.status==="success"?"Thank you. We will process your order and keep you updated.":"No payment was confirmed. You can try again from Track your order."}</p>`;d.showModal()}catch{}}})();
