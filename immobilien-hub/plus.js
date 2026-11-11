/* ImmoHub Plus: Kontoauszug-Import, Berichte (Bank, Steuer), Fristen, Einstieg und Objekt-Import.
   Läuft nach dem Hauptskript des Hubs und nutzt dessen Funktionen (rd, hub, render, bookPay …). */
(function(){
'use strict';
const $=s=>document.querySelector(s);
const NORM=s=>String(s||'').toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();
const px={ mode:null };
window.PX=px;

/* ================= Gemeinsam: Overlay ================= */
function host(){ let h=$('#pxHost'); if(!h){ h=document.createElement('div'); h.id='pxHost'; document.body.appendChild(h); } return h; }
function open(mode,st){ if(typeof closeSheet==='function') closeSheet(); px.mode=mode; px.st=st||{}; draw(); ImmoCore.haptic('light'); }
function close(){ px.mode=null; px.st=null; host().innerHTML=''; }
function draw(){ const h=host(); if(!px.mode){ h.innerHTML=''; return; }
  const body=px.mode==='bank'?bankHtml():px.mode==='objimp'?objImpHtml():px.mode==='wiz'?wizHtml():px.mode==='recur'?recurHtml():'';
  const y=(h.querySelector('.ui-sheet')||{}).scrollTop||0;
  h.innerHTML=`<div class="ui-dim" data-px="close"></div><div class="ui-sheet px-sheet" role="dialog" aria-modal="true" aria-label="${esc(TITLES[px.mode]||'')}"><div class="grab"></div>${body}<button type="button" class="ui-btn wide" data-px="close">Schließen</button></div>`;
  const s=h.querySelector('.ui-sheet'); if(s) s.scrollTop=y; }
const TITLES={bank:'Kontoauszug einlesen',objimp:'Objekte importieren',wiz:'Einrichten',recur:'Wiederkehrender Termin'};
px.open=open; px.close=close;

/* ================= CSV lesen ================= */
function decode(buf){ let t; try{ t=new TextDecoder('utf-8',{fatal:true}).decode(buf); }catch(e){ try{ t=new TextDecoder('windows-1252').decode(buf); }catch(_){ t=new TextDecoder().decode(buf); } } return t.replace(/^﻿/,''); }
function delim(txt){ const L=txt.split(/\r?\n/).slice(0,40); let best=';',bn=-1; [';','\t',',','|'].forEach(d=>{ const n=L.reduce((a,l)=>a+(l.split(d).length-1),0); if(n>bn){ bn=n; best=d; } }); return best; }
function parseCSV(txt,d){ d=d||delim(txt); const rows=[]; let row=[],f='',q=false;
  for(let i=0;i<txt.length;i++){ const c=txt[i];
    if(q){ if(c==='"'){ if(txt[i+1]==='"'){ f+='"'; i++; } else q=false; } else f+=c; }
    else if(c==='"'&&f==='') q=true;
    else if(c===d){ row.push(f); f=''; }
    else if(c==='\n'||c==='\r'){ if(c==='\r'&&txt[i+1]==='\n') i++; row.push(f); f=''; if(row.some(x=>x.trim()!=='')) rows.push(row.map(x=>x.trim())); row=[]; }
    else f+=c; }
  row.push(f); if(row.some(x=>x.trim()!=='')) rows.push(row.map(x=>x.trim())); return rows; }
function num(s){ if(s==null) return NaN; let v=String(s).replace(/\s|€|EUR| /gi,''); if(!v) return NaN;
  let neg=false; if(/^\(.*\)$/.test(v)){ neg=true; v=v.slice(1,-1); } if(/-$/.test(v)){ neg=true; v=v.slice(0,-1); } if(/^[+-]/.test(v)){ neg=v[0]==='-'; v=v.slice(1); }
  const lc=v.lastIndexOf(','), ld=v.lastIndexOf('.');
  if(lc>-1&&ld>-1){ v=lc>ld?v.replace(/\./g,'').replace(',','.'):v.replace(/,/g,''); }
  else if(lc>-1){ v=v.replace(/\./g,'').replace(',','.'); }
  else if(ld>-1&&/^\d{1,3}(\.\d{3})+$/.test(v)){ v=v.replace(/\./g,''); }
  const n=parseFloat(v); return isFinite(n)?(neg?-n:n):NaN; }
function date(s){ s=String(s||'').trim(); let m=s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/); if(m){ let y=+m[3]; if(y<100) y+=2000; return y+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0'); }
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return m[1]+'-'+m[2]+'-'+m[3];
  m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if(m) return m[3]+'-'+String(m[1]).padStart(2,'0')+'-'+String(m[2]).padStart(2,'0');
  return ''; }
function findCol(H,tests){ for(const t of tests){ const i=H.findIndex(h=>t(h)); if(i>-1) return i; } return -1; }

/* ================= 1. Kontoauszug ================= */
const BK={ date:[h=>/^buchungstag$|^buchungsdatum$/.test(h),h=>/^buchung$/.test(h),h=>/^datum$|^date$|^booking date$/.test(h),h=>/buchung/.test(h)&&/dat|tag/.test(h),h=>/valuta|wertstellung/.test(h)],
  amt:[h=>/^betrag/.test(h)&&!/saldo/.test(h),h=>/^umsatz/.test(h),h=>/^amount/.test(h),h=>/betrag|umsatz/.test(h)&&!/saldo|waehrung/.test(h)],
  sh:[h=>/^soll haben$|^s h$/.test(h)],
  name:[h=>/zahlungspflichtig/.test(h)&&!/empfaeng/.test(h),h=>/beguenstigter|auftraggeber|zahlungsbeteiligter|payee|partner/.test(h),h=>/^name/.test(h),h=>/empfaeng/.test(h)],
  purp:[h=>/verwendungszweck|payment reference|reference/.test(h),h=>/buchungstext|vorgang/.test(h)] };
function bankParse(txt){ const rows=parseCSV(txt); let hi=-1;
  for(let i=0;i<Math.min(rows.length,40);i++){ const H=rows[i].map(NORM); if(findCol(H,BK.date)>-1&&findCol(H,BK.amt)>-1){ hi=i; break; } }
  if(hi<0) return {err:'In der Datei wurden keine Spalten für Datum und Betrag gefunden. Exportiere die Umsätze bitte als CSV (nicht als PDF) und versuche es erneut.'};
  const H=rows[hi].map(NORM), col={date:findCol(H,BK.date),amt:findCol(H,BK.amt),sh:findCol(H,BK.sh),name:findCol(H,BK.name),purp:findCol(H,BK.purp)};
  return {head:rows[hi],rows:rows.slice(hi+1).filter(r=>r.length>=Math.min(3,rows[hi].length)),col}; }
function bankTx(P){ const c=P.col, out=[]; let neg=0;
  P.rows.forEach((r,i)=>{ const d=date(r[c.date]); let a=num(r[c.amt]); if(!d||!isFinite(a)) return; if(c.sh>-1&&/^s/i.test(r[c.sh]||'')) a=-Math.abs(a);
    if(a<=0){ neg++; return; }
    const name=c.name>-1?r[c.name]:'', purp=c.purp>-1?r[c.purp]:'';
    const hay=NORM(r.filter((_,k)=>k!==c.amt&&k!==c.date).join(' '));
    out.push({i,d,a:Math.round(a*100)/100,name:name||r.filter((_,k)=>k!==c.amt&&k!==c.date&&k!==c.purp).find(x=>/[a-z]{3}/i.test(x))||'',purp,hay,key:[d,a.toFixed(2),NORM(name).slice(0,30),NORM(purp).slice(0,40)].join('|')}); });
  return {tx:out,neg}; }
const MON={jan:1,januar:1,feb:2,februar:2,maerz:3,mrz:3,mar:3,apr:4,april:4,mai:5,jun:6,juni:6,jul:7,juli:7,aug:8,august:8,sep:9,sept:9,september:9,okt:10,oktober:10,nov:11,november:11,dez:12,dezember:12};
function monthHint(purp,d){ const p=NORM(purp); let m=p.match(/\b(0?[1-9]|1[0-2])\s(20\d{2}|\d{2})\b/)||String(purp||'').match(/\b(0?[1-9]|1[0-2])[\/.\-](20\d{2}|\d{2})\b/);
  if(m){ let y=+m[2]; if(y<100) y+=2000; return y+'-'+String(+m[1]).padStart(2,'0'); }
  const w=p.split(' '); for(let k=0;k<w.length;k++){ const mm=MON[w[k]]; if(mm){ let y=+(w[k+1]||''); if(!(y>=2000&&y<2100)){ y=+d.slice(0,4); if(mm>+d.slice(5,7)+1) y--; } return y+'-'+String(mm).padStart(2,'0'); } }
  return ''; }
function tenantTokens(t){ return NORM(t.mieter).split(' ').filter(x=>x.length>=3&&!['herr','frau','familie','und','gbr','eheleute','mieter'].includes(x)); }
function bankMatch(V,tx){ const td=todayS(), T=(V.tens||[]).filter(t=>validD(t.start)), alloc={}, pm=hub.payMap||{};
  const openOf=(t,ym)=>{ const so=soll(t,ym); if(!so) return 0; return Math.max(0,so.total-istV(V,t,ym)-(alloc[t.id+'|'+ym]||0)); };
  return tx.map(x=>{ const pt=pm[NORM(x.name)], booked=(V.pays||[]).some(p=>p.imp===x.key||(p.datum===x.d&&Math.abs((p.betrag||0)-x.a)<0.005&&(p.note||'').indexOf('Kontoauszug')>-1&&(!pt||p.tid===pt)));
    let best=null, bs=0;
    T.forEach(t=>{ if(t.start>ImmoCore.addMonths(x.d,2)) return; if(validD(t.ende)&&t.ende<ImmoCore.addMonths(x.d,-3)) return;
      let s=0; const tk=tenantTokens(t); if(tk.length){ const hit=tk.filter(k=>x.hay.indexOf(k)>-1); if(hit.length===tk.length) s+=60; else if(hit.includes(tk[tk.length-1])) s+=45; else if(hit.some(k=>k.length>=4)) s+=30; }
      if(pm[NORM(x.name)]===t.id) s+=70;
      const ym=ymOf(x.d), so=soll(t,ym)||soll(t,addM(ym,1)); if(so&&Math.abs(so.total-x.a)<0.01) s+=25; else if(so&&Math.abs(so.total-x.a)/so.total<0.02) s+=10;
      if(s>bs){ bs=s; best=t; } });
    let mon=''; if(best){ mon=monthHint(x.purp,x.d);
      if(!mon){ const from=ymOf(best.start)>addM(ymOf(x.d),-12)?ymOf(best.start):addM(ymOf(x.d),-12); for(const m of monthsList(from,ymOf(x.d))){ if(openOf(best,m)>0.5){ mon=m; break; } }
        if(!mon) mon=+x.d.slice(8,10)>=20?addM(ymOf(x.d),1):ymOf(x.d); }
      if(!booked&&bs>=40) alloc[best.id+'|'+mon]=(alloc[best.id+'|'+mon]||0)+x.a; }
    return Object.assign({},x,{tid:best?best.id:'',score:bs,mon:mon||ymOf(x.d),on:!booked&&bs>=40,booked}); }); }
function bankHtml(){ const S=px.st, V=rd('vermietung-v1');
  let h='<h3>Kontoauszug einlesen</h3>';
  if(!V||!(V.tens||[]).length) return h+'<div class="ui-empty"><b>Noch keine Mieter</b>Lege zuerst in der Vermietung Wohnungen und Mieter an. Dann ordnet der Hub die Zahlungseingänge zu.</div>';
  if(!S.list){
    h+=`<p class="note" style="margin:0">Exportiere in deinem Online-Banking die Umsätze als <b>CSV-Datei</b>, zum Beispiel die letzten 60 Tage. Der Hub sucht die Mieteingänge heraus und ordnet sie deinen Mietern zu. Du prüfst und bestätigst, erst dann wird gebucht.</p>
    <label class="ui-btn primary wide px-file" style="--c:var(--c-ver)"><input type="file" accept=".csv,.txt,text/csv,text/plain" data-pxf="bank" hidden>CSV-Datei wählen</label>
    <p class="note" style="margin:0">Funktioniert mit den üblichen Exporten von Sparkasse, Volksbank, DKB, ING, comdirect, N26 und vielen anderen. Die Datei bleibt auf deinem Gerät.</p>`;
    if(S.err) h+=`<div class="warn">${esc(S.err)}</div>`;
    return h; }
  const L=S.list, act=L.filter(x=>!x.booked), sel=act.filter(x=>x.on&&x.tid), sum=sel.reduce((a,x)=>a+x.a,0), bk=L.filter(x=>x.booked);
  const tens=(V.tens||[]).filter(t=>validD(t.start)).sort((a,b)=>(a.mieter||'').localeCompare(b.mieter||''));
  const unit=t=>((V.objs||[]).find(o=>o.id===t.objId)||{}).name||'';
  h+=`<p class="note" style="margin:0">${L.length} Eingänge in der Datei${S.neg?', '+S.neg+' Abbuchungen übersprungen':''}. ${sel.length} als Miete erkannt${bk.length?', '+bk.length+' schon gebucht':''}. Prüfe Mieter und Monat, dann buchen.</p>`;
  const card=x=>{ const k=L.indexOf(x);
    return `<div class="px-tx${x.on&&x.tid?' on':''}"><label class="px-chk"><input type="checkbox" data-pxb="on" data-k="${k}" ${x.on&&x.tid?'checked':''} aria-label="Buchen"><span><b>${eur2(x.a)}</b> · ${fmtD(x.d)}<br><span class="px-nm">${esc(x.name||'Unbekannt')}</span>${x.purp?`<br><small>${esc(x.purp.slice(0,120))}</small>`:''}</span></label>
      <div class="ui-row2"><label class="ui-field">Mieter<select data-pxb="tid" data-k="${k}"><option value="">– keine Miete –</option>${tens.map(t=>`<option value="${esc(t.id)}" ${t.id===x.tid?'selected':''}>${esc((t.mieter||'Mieter')+(unit(t)?' · '+unit(t):''))}</option>`).join('')}</select></label>${x.tid?`<label class="ui-field">Für Monat<input type="month" data-pxb="mon" data-k="${k}" value="${esc(x.mon)}"></label>`:''}</div>
      ${x.tid&&!x.on?'<p class="note" style="margin:0">Unsicher zugeordnet, bitte prüfen.</p>':''}</div>`; };
  const main=act.filter(x=>x.tid||x.on), rest=act.filter(x=>!(x.tid||x.on));
  h+='<div class="px-list">'+main.map(card).join('')+'</div>';
  if(!main.length) h+='<div class="ui-empty"><b>Keine Mieteingänge erkannt</b>Ordne Eingänge unten von Hand einem Mieter zu. Beim nächsten Mal erkennt der Hub den Absender.</div>';
  if(rest.length) h+=`<details class="fold"${main.length?'':' open'}><summary><span>Weitere Eingänge (${rest.length})</span></summary><div class="fb"><div class="px-list">${rest.map(card).join('')}</div></div></details>`;
  if(bk.length) h+=`<details class="fold"><summary><span>Schon gebucht (${bk.length})</span></summary><div class="fb">${bk.map(x=>`<p class="note" style="margin:4px 0">${fmtD(x.d)} · ${eur2(x.a)} · ${esc(x.name||'')}</p>`).join('')}</div></details>`;
  h+=`<details class="fold"><summary><span>Spalten der Datei prüfen</span></summary><div class="fb">${['date','amt','name','purp'].map(f=>`<label class="ui-field">${{date:'Datum',amt:'Betrag',name:'Name',purp:'Verwendungszweck'}[f]}<select data-pxb="col" data-f="${f}"><option value="-1">– keine –</option>${S.P.head.map((c,i)=>`<option value="${i}" ${S.P.col[f]===i?'selected':''}>${esc(c||('Spalte '+(i+1)))}</option>`).join('')}</select></label>`).join('')}</div></details>`;
  h+=`<button type="button" class="ui-btn primary wide" data-px="bankBook" style="--c:var(--c-ver)" ${sel.length?'':'disabled'}>${sel.length?sel.length+' Zahlung'+(sel.length===1?'':'en')+' buchen · '+eur2(sum):'Keine Zahlung ausgewählt'}</button>
    <button type="button" class="ui-btn wide" data-px="bankNew">Andere Datei wählen</button>`;
  return h; }
function bankLoad(file){ const r=new FileReader(); r.onload=()=>{ const txt=decode(r.result), P=bankParse(txt); if(P.err){ px.st={err:P.err}; draw(); return; } bankRun(P); }; r.onerror=()=>{ px.st={err:'Die Datei konnte nicht gelesen werden.'}; draw(); }; r.readAsArrayBuffer(file); }
function bankRun(P){ const V=rd('vermietung-v1'), T=bankTx(P); if(!T.tx.length&&!T.neg){ px.st={err:'In der Datei wurden keine Umsätze erkannt. Prüfe, ob es der CSV-Export der Umsätze ist.'}; draw(); return; }
  px.st={P,list:bankMatch(V,T.tx),neg:T.neg}; draw(); }
function bankBook(){ const V=rd('vermietung-v1'); if(!V) return; const L=px.st.list.filter(x=>!x.booked&&x.on&&x.tid&&/^\d{4}-\d{2}$/.test(x.mon)); if(!L.length) return;
  const ids=[]; hub.payMap=hub.payMap||{};
  L.forEach(x=>{ const t=(V.tens||[]).find(y=>y.id===x.tid); if(!t) return; const id=bookPay(V,t,x.mon,Math.round(x.a*100)/100); const p=V.pays.find(y=>y.id===id); if(p){ p.datum=x.d; p.note='Kontoauszug'; p.imp=x.key; } ids.push(id); if(x.name) hub.payMap[NORM(x.name)]=t.id; });
  if(!wV(V)) return; refreshSummary(V); saveHub(); const n=ids.length, s=L.reduce((a,x)=>a+x.a,0); close(); render(true); ImmoCore.haptic('success');
  ImmoCore.undoToast(n+' Zahlung'+(n===1?'':'en')+' gebucht, '+eur2(s),()=>{ const W=rd('vermietung-v1'); if(W){ W.pays=(W.pays||[]).filter(p=>!ids.includes(p.id)); if(wV(W)) refreshSummary(W); } render(true); }); }
px.mieteBtn=()=>`<div class="row-actions" style="margin:10px 0 0"><button class="btn primary" data-px="bank">Kontoauszug einlesen</button></div><p class="note" style="margin:4px 0 0">CSV-Export deiner Bank: Mieteingänge werden erkannt und nach deiner Bestätigung gebucht.</p>`;

/* ================= 2. Berichte und PDF ================= */
function printHtml(title,html){ let a=$('#printArea'); if(!a){ a=document.createElement('div'); a.id='printArea'; document.body.appendChild(a); }
  a.innerHTML=html; const t0=document.title; document.title=title; setTimeout(()=>{ try{ window.print(); }catch(e){} setTimeout(()=>{ document.title=t0; },800); },60); }
const P2=v=>nf(v,2)+' €', P0=v=>nf(Math.round(v),0)+' €';
function fixEndOf(m){ try{ return ImmoCore.nextFixEnd({loan:m.loan,zins:m.zins,tilg:m.tilg,fix:m.fix,fixEnd:m.fixEnd,fin2:m.fin2,ratebk:m.ratebk,sonder:m.sonder},m.rate1||'',todayS())||''; }catch(e){ return ''; } }
function bankRows(incKauf){ const S=ImmoCore.sums(), B=bestandRows(S); return B.filter(x=>x.inB||incKauf).map(x=>{ const m=x.m, pl=planOf(m), cur=pl&&pl.rows?pl.rows.find(r=>r.ym===ymOf(todayS())):null;
  return {m,inB:x.inB,val:x.val,mw:+m.mw||0,kp:+m.kp||0,debt:x.debt,rate:x.p,rent:x.held?x.r:0,zins:cur&&cur.z!=null?cur.z:(+m.zins||0),fixEnd:fixEndOf(m),kd:kaufDate(m)}; }); }
function bankReport(){ const o=ui['pxRep']||{}, R=bankRows(!!o.kauf), td=todayS();
  const T=R.reduce((a,r)=>{ a.val+=r.val; a.debt+=r.debt; a.rent+=r.rent; a.rate+=r.rate; return a; },{val:0,debt:0,rent:0,rate:0});
  let h=`<div class="pr"><h1>Vermögensaufstellung Immobilien</h1><p class="pr-sub">${o.name?esc(o.name)+' · ':''}Stand ${fmtD(td)}</p>
  <table class="pr-k"><tr><td>Verkehrswert gesamt<b>${P0(T.val)}</b></td><td>Restschuld gesamt<b>${P0(T.debt)}</b></td><td>Beleihung<b>${T.val>0?nf(T.debt/T.val*100,0)+' %':'–'}</b></td><td>Nettovermögen<b>${P0(T.val-T.debt)}</b></td></tr>
  <tr><td>Nettokaltmiete p. a.<b>${P0(T.rent*12)}</b></td><td>Kapitaldienst p. a.<b>${P0(T.rate*12)}</b></td><td>Überschuss p. a.<b>${P0((T.rent-T.rate)*12)}</b></td><td>Objekte<b>${R.length}</b></td></tr></table>
  <h2>Übersicht</h2><table class="pr-t"><thead><tr><th>Objekt</th><th>Verkehrswert</th><th>Restschuld</th><th>Kaltmiete p. m.</th><th>Rate p. m.</th><th>Zinsbindung bis</th></tr></thead><tbody>`
  +R.map(r=>`<tr><td>${esc(r.m.name||'Objekt')}${r.inB?'':' <i>(im Kauf)</i>'}</td><td>${P0(r.val)}</td><td>${P0(r.debt)}</td><td>${r.rent?P2(r.rent):'–'}</td><td>${r.rate?P2(r.rate):'–'}</td><td>${r.fixEnd?fmtD(r.fixEnd):'–'}</td></tr>`).join('')
  +`<tr class="sum"><td>Summe</td><td>${P0(T.val)}</td><td>${P0(T.debt)}</td><td>${P2(T.rent)}</td><td>${P2(T.rate)}</td><td></td></tr></tbody></table><h2>Objekte im Einzelnen</h2>`;
  R.forEach(r=>{ const m=r.m, kv=[['Adresse',m.adresse||'–'],['Wohnfläche',+m.qm?nf(+m.qm,0)+' m²':'–'],['Baujahr',+m.bj?String(m.bj):'–'],['Kaufdatum',r.kd?fmtD(r.kd):'–'],['Kaufpreis',r.kp?P0(r.kp):'–'],['Marktwert',r.mw?P0(r.mw)+(m.mwDate?' (Stand '+fmtD(m.mwDate)+')':''):'– (Kaufpreis angesetzt)'],['Darlehen ursprünglich',+m.loan?P0(+m.loan):'–'],['Restschuld heute',P0(r.debt)],['Sollzins',r.zins?nf(r.zins,2)+' %':'–'],['Zinsbindung bis',r.fixEnd?fmtD(r.fixEnd):'–'],['Monatsrate',r.rate?P2(r.rate):'–'],['Kaltmiete p. m. (Ist)',r.rent?P2(r.rent):'–']];
    h+=`<div class="pr-o"><h3>${esc(m.name||'Objekt')}</h3><table class="pr-kv">${kv.map((x,i)=>(i%2?'':'<tr>')+`<td>${x[0]}</td><td>${esc(x[1])}</td>`+(i%2?'</tr>':'')).join('')}</table></div>`; });
  h+=`<p class="pr-f">Angaben nach bestem Wissen aus ImmoHub. Marktwerte sind Schätzungen des Eigentümers, Restschulden laut Tilgungsplan oder letzter Bankmitteilung. Mieten laut Mietverträgen, ohne Nebenkosten.</p></div>`;
  return h; }
function taxReport(Y,ids){ const O=hObjs().filter(m=>ids.includes(m.id)); let tot={ein:0,wk:0,res:0}; let h=`<div class="pr"><h1>Einkünfte aus Vermietung ${Y}</h1><p class="pr-sub">Übersicht für die Anlage V · erstellt am ${fmtD(todayS())}</p>`;
  O.forEach(m=>{ const c=taxCalc(m,Y); tot.ein+=c.ein; tot.wk+=c.wk; tot.res+=c.res;
    const row=(l,v,sub,neg)=>`<tr><td>${l}${sub?`<small>${sub}</small>`:''}</td><td>${neg&&v?'− ':''}${P2(Math.abs(v))}</td></tr>`;
    h+=`<div class="pr-o"><h3>${esc(m.name||'Objekt')}${m.adresse?' · '+esc(m.adresse):''}</h3><table class="pr-t pr-tax">`
      +row('Mieteinnahmen',c.tx.miete,'Kaltmiete und Stellplatz, nach Zahlungseingang')+row('Umlagen',c.tx.umlage,'Nebenkosten-Vorauszahlungen')
      +row('Schuldzinsen',c.zins,c.plan?'laut Tilgungsplan, Rest des Jahres geplant':'laut Tilgungsplan',1)
      +row('AfA '+nf(c.rate,1)+' %'+(c.mon<12?' für '+c.mon+' Monate':''),c.afa,c.bb?'Gebäudewert '+P0(c.bb.v):'Kaufpreis fehlt',1)
      +row('Erhaltungsaufwand',c.er,'',1)+row('Betriebskosten',c.bk,'',1)+row('Verwaltung und Sonstiges',c.vw,'',1)
      +`<tr class="sum"><td>${c.res>=0?'Überschuss':'Verlust'}</td><td>${c.res>=0?'':'− '}${P2(Math.abs(c.res))}</td></tr></table>`;
    const D=docsOf(m.id).filter(d=>(d.year||String(d.date||'').slice(0,4))===String(Y)&&d.amount>0).sort((a,b)=>a.date<b.date?-1:1);
    if(D.length) h+=`<table class="pr-t pr-docs"><thead><tr><th>Datum</th><th>Beleg</th><th>Art</th><th>Betrag</th></tr></thead><tbody>${D.map(d=>`<tr><td>${fmtD(d.date)}</td><td>${esc(d.name||'')}</td><td>${esc(ImmoCore.docKindName(d.kind))}</td><td>${P2(d.amount)}</td></tr>`).join('')}</tbody></table>`;
    h+='</div>'; });
  if(O.length>1) h+=`<table class="pr-k"><tr><td>Einnahmen gesamt<b>${P2(tot.ein)}</b></td><td>Werbungskosten gesamt<b>${P2(tot.wk)}</b></td><td>${tot.res>=0?'Überschuss':'Verlust'} gesamt<b>${P2(Math.abs(tot.res))}</b></td></tr></table>`;
  h+='<p class="pr-f">Orientierung, keine Steuerberatung. Zahlungen zählen im Jahr des Eingangs. Belege laut Ablage in ImmoHub.</p></div>'; return h; }
px.reportsView=function(){ const o=ui['pxRep']||{}, cy=new Date().getFullYear(), Y=+ui['taxYear']||cy-1, O=hObjs().filter(m=>!m.archived), R=bankRows(!!o.kauf);
  let h=`<h2>Vermögensaufstellung für die Bank</h2><div class="ui-card"><p class="note" style="margin:0">Für Finanzierungsanfragen: alle Objekte mit Wert, Restschuld, Miete, Rate und Zinsbindung auf einer Seite, als PDF zum Weitergeben.</p>
    <label class="ui-field">Name auf dem Bericht<input data-pxr="name" value="${esc(o.name||'')}" placeholder="z. B. Vor- und Nachname" autocomplete="name"></label>
    <label class="px-chk2"><input type="checkbox" data-pxr="kauf" ${o.kauf?'checked':''}> Objekte im Kauf mit aufführen</label>
    <p class="note" style="margin:0">${R.length} Objekt${R.length===1?'':'e'} · Wert ${P0(R.reduce((a,r)=>a+r.val,0))} · Restschuld ${P0(R.reduce((a,r)=>a+r.debt,0))}</p>
    <button type="button" class="ui-btn primary wide" data-px="repBank" ${R.length?'':'disabled'}>Als PDF sichern oder drucken</button></div>`;
  h+=`<h2>Steuerjahr als PDF</h2><div class="ui-card"><div class="ui-chips" role="group" aria-label="Jahr">${[cy-3,cy-2,cy-1,cy].map(y=>`<button type="button" data-act="taxYear" data-v="${y}" aria-pressed="${y===Y}">${y}</button>`).join('')}</div>
    <label class="ui-field">Objekte<select data-pxr="taxObj"><option value="">Alle Objekte im Bestand</option>${O.map(m=>`<option value="${esc(m.id)}" ${o.taxObj===m.id?'selected':''}>${esc(m.name||'Objekt')}</option>`).join('')}</select></label>
    <button type="button" class="ui-btn primary wide" data-px="repTax">Anlage-V-Übersicht ${Y} als PDF</button><p class="note" style="margin:0">Je Objekt Einnahmen, Werbungskosten, Ergebnis und die Belegliste, für dich oder den Steuerberater.</p></div>
    <p class="note">Auf dem iPhone öffnet sich das Druckmenü. Dort oben auf Teilen tippen, dann „In Dateien sichern“ oder direkt per Mail senden.</p>`;
  return h; };
function taxIds(){ const o=ui['pxRep']||{}; if(o.taxObj&&getM(o.taxObj)) return [o.taxObj]; const S=ImmoCore.sums(); return bestandRows(S).filter(x=>x.inB).map(x=>x.m.id).concat([]).filter((v,i,a)=>a.indexOf(v)===i); }

/* ================= 3. Fristen ================= */
const PRESETS=[['Rauchmelder prüfen',12],['Heizungswartung',12],['Schornsteinfeger',12],['Gebäudeversicherung prüfen',12],['Trinkwasser auf Legionellen prüfen',36],['Dachrinnen reinigen',12],['Feuerlöscher prüfen',24],['Eigentümerversammlung',12]];
const recurs=()=>{ if(!Array.isArray(hub.recur)) hub.recur=[]; return hub.recur; };
px.recurIcs=()=>recurs().filter(r=>ImmoCore.isDate(r.next)).map(r=>{ const m=getM(r.obj); return {uid:'rec-'+r.id+'-'+r.next,date:r.next,t:r.text+(m?': '+(m.name||''):''),sub:'Wiederkehrend alle '+r.every+' Monate',warn:7}; });
px.todayRows=()=>{ const td=todayS(), in14=ImmoCore.localIso(new Date(Date.now()+14*864e5)).slice(0,10);
  return recurs().filter(r=>ImmoCore.isDate(r.next)&&r.next<=in14).map(r=>{ const m=getM(r.obj); return {date:r.next,over:r.next<td,ic:'↻',col:r.next<td?'var(--bad)':'var(--c-pv)',t:r.text,s:(m?m.name+' · ':'')+fmtD(r.next),act:`<button class="act" data-px="recDone" data-id="${esc(r.id)}">Erledigt</button>`}; }); };
function fristItems(){ const td=todayS(), L=[], S=rd(SUMKEY), vu=urlOf(appDef('ver'));
  if(S&&Array.isArray(S.dlAll)) S.dlAll.forEach(d=>{ if(d.kind==='pay') return; L.push({date:d.date,cat:'miete',t:d.t,s:d.sub||'',ic:'€',col:'var(--c-ver)',act:vu?`<a class="act" href="${esc(vu)}">Öffnen</a>`:''}); });
  icsItems().filter(x=>/^cp-/.test(x.uid)).forEach(x=>L.push({date:x.date,cat:'fin',t:x.t,s:x.sub||'',ic:'%',col:'var(--c-cp)',act:'<button class="act" data-act="tab" data-v="fin">Ansehen</button>'}));
  loans().forEach(l=>{ const d=ImmoCore.addMonths(l.E,-36); if(d>=td) L.push({date:d,cat:'fin',t:'Forward-Darlehen möglich: '+(l.m.name||'Objekt'),s:'Ab jetzt lässt sich der Zins für die Anschlussfinanzierung bis zu 3 Jahre im Voraus sichern.',ic:'%',col:'var(--c-cp)',act:'<button class="act" data-act="tab" data-v="fin">Ansehen</button>'}); });
  recurs().forEach(r=>{ if(!ImmoCore.isDate(r.next)) return; const m=getM(r.obj); L.push({date:r.next,cat:'obj',t:r.text,s:(m?m.name+' · ':'')+'alle '+r.every+' Monate',ic:'↻',col:'var(--c-pv)',act:`<button class="act" data-px="recDone" data-id="${esc(r.id)}">Erledigt</button>`}); });
  hItems().filter(x=>!x.done&&ImmoCore.isDate(x.date)).forEach(x=>{ const m=getM(x.obj); L.push({date:x.date,cat:'obj',t:x.text,s:(m?m.name+' · ':'')+(x.kind==='termin'?'Termin':'Aufgabe'),ic:x.kind==='termin'?'◷':'✓',col:'var(--c-hub)',act:`<button class="act" data-act="taskDone" data-id="${esc(x.id)}">Erledigt</button>`}); });
  return L.map(x=>Object.assign(x,{over:x.date<td})).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0); }
function loans(){ const td=todayS(); return hObjs().filter(m=>!m.archived).map(m=>{ const E=fixEndOf(m); if(!E||E<td) return null; const pl=planOf(m); if(!pl) return null;
  const ym=ymOf(E), row=pl.rows.find(r=>r.ym===ym)||pl.rows.filter(r=>r.ym<=ym).pop(); const bal=row?(row.bal!=null?row.bal:row.rest):null; const cb=ImmoCore.currentBalance(m);
  return {m,E,bal,pay:cb?cb.pay:0,tilg:+m.tilg||2}; }).filter(x=>x&&x.bal>0); }
px.fristCard=function(){ const td=todayS(), in60=ImmoCore.addMonths(td,2), L=fristItems().filter(x=>x.date<=in60);
  const n=fristItems().filter(x=>x.date>=td||x.over).length;
  let h='<h2>Fristen</h2><div class="ui-card ui-today">'+(L.length?L.slice(0,4).map(r=>rowHtml(Object.assign({},r,{s:fmtD(r.date)+' · '+r.s,ic:r.ic}))).join(''):'<p class="note" style="margin:0">In den nächsten zwei Monaten steht nichts an.</p>')+'</div>';
  h+=`<div class="row-actions" style="margin:8px 0 0"><button class="btn" data-px="fristen">Alle Fristen${n?' ('+n+')':''}</button></div>`; return h; };
px.fristView=function(){ const f=ui['pxFr']||'all', td=todayS(), L=fristItems().filter(x=>f==='all'||x.cat===f);
  let h=bar('Termine, Verträge, Finanzierung','Fristen')+'<main>';
  h+=`<div class="row-actions" style="margin:10px 0 0"><button class="btn" data-act="tab" data-v="home">‹ Übersicht</button></div>`;
  h+=`<div class="ui-chips" role="group" aria-label="Bereich" style="margin:10px 0">${[['all','Alle'],['miete','Mieten'],['fin','Finanzierung'],['obj','Objekte']].map(([k,l])=>`<button type="button" data-px="frF" data-v="${k}" aria-pressed="${f===k}">${l}</button>`).join('')}</div>`;
  const G=[['Überfällig',x=>x.over],['Nächste 30 Tage',x=>!x.over&&x.date<=ImmoCore.addMonths(td,1)],['Nächste 12 Monate',x=>!x.over&&x.date>ImmoCore.addMonths(td,1)&&x.date<=ImmoCore.addMonths(td,12)],['Später',x=>x.date>ImmoCore.addMonths(td,12)]];
  let any=false; G.forEach(([t,fn])=>{ const R=L.filter(fn); if(!R.length) return; any=true; h+=`<h2>${t}</h2><div class="ui-card ui-today">`+R.slice(0,40).map(r=>rowHtml(Object.assign({},r,{s:fmtD(r.date)+(r.s?' · '+r.s:'')}))).join('')+'</div>'; });
  if(!any) h+='<div class="ui-empty"><b>Keine Fristen</b>Sobald Darlehen, Mietverträge oder wiederkehrende Termine eingetragen sind, erscheinen hier alle Fristen.</div>';
  if(f==='all'||f==='fin'){ const LO=loans(), z=+ui['pxZins']||4;
    if(LO.length){ h+=`<h2>Anschlussfinanzierung</h2><div class="ui-card"><label class="ui-field">Angenommener Anschlusszins (% p. a.)<input inputmode="decimal" data-pxr="zins" value="${esc(nf(z,2))}"></label>`+LO.map(l=>{ const nr=l.bal*(z+l.tilg)/100/12, d=nr-l.pay;
      return `<div class="kv"><div>${esc(l.m.name||'Objekt')}<small>Zinsbindung endet ${fmtD(l.E)} · Restschuld dann ca. ${eur(l.bal)}<br>Neue Rate bei ${nf(z,2)} % Zins und ${nf(l.tilg,1)} % Tilgung: ca. ${eur(nr)} statt ${eur(l.pay)}</small></div><b class="${d>0.5?'t-bad':'t-good'}">${d>=0?'+':'−'}${eur(Math.abs(d))}</b></div>`; }).join('')+'<p class="note" style="margin:0">Schätzung. Die Tilgung bleibt wie heute, die Restschuld stammt aus dem Tilgungsplan.</p></div>'; } }
  if(f==='all'||f==='obj'){ const R=recurs(); h+='<h2>Wiederkehrende Termine</h2><div class="ui-card">'+(R.length?R.slice().sort((a,b)=>(a.next||'')<(b.next||'')?-1:1).map(r=>{ const m=getM(r.obj); return `<div class="kv"><div>${esc(r.text)}<small>${m?esc(m.name||'')+' · ':''}alle ${r.every} Monate · nächster ${fmtD(r.next)}</small></div><span style="display:flex;gap:6px"><button class="btn small" data-px="recDone" data-id="${esc(r.id)}">Erledigt</button><button class="btn small" data-px="recDel" data-id="${esc(r.id)}" aria-label="Löschen">✕</button></span></div>`; }).join(''):'<p class="note" style="margin:0">Zum Beispiel Rauchmelder, Heizungswartung oder Versicherung. Die App erinnert rechtzeitig und plant den nächsten Termin automatisch.</p>')+'</div><div class="row-actions" style="margin:8px 0 0"><button class="btn primary" data-px="recNew">Wiederkehrenden Termin hinzufügen</button></div>'; }
  return h+'</main>'+tabbar(); };
function recurHtml(){ const S=px.st, O=hObjs().filter(m=>!m.archived);
  return `<h3>Wiederkehrender Termin</h3><div class="ui-chips">${PRESETS.map((p,i)=>`<button type="button" data-px="recPre" data-i="${i}" aria-pressed="${S.text===p[0]}">${esc(p[0])}</button>`).join('')}</div>
    <label class="ui-field">Was<input id="pr_txt" value="${esc(S.text||'')}" placeholder="z. B. Rauchmelder prüfen"></label>
    <div class="ui-row2"><label class="ui-field">Alle … Monate<input id="pr_every" inputmode="numeric" value="${esc(String(S.every||12))}"></label><label class="ui-field">Nächster Termin<input type="date" id="pr_next" value="${esc(S.next||todayS())}"></label></div>
    <label class="ui-field">Objekt<select id="pr_obj"><option value="">– alle / kein Objekt –</option>${O.map(m=>`<option value="${esc(m.id)}" ${m.id===S.obj?'selected':''}>${esc(m.name||'Objekt')}</option>`).join('')}</select></label>
    <button type="button" class="ui-btn primary wide" data-px="recSave">Speichern</button>`; }

/* ================= 4. Einstieg und Objekt-Import ================= */
px.welcome=function(){ return `<div class="ui-hero px-welcome" style="margin-top:12px"><div class="l">Willkommen</div><div class="px-wt">Richte ImmoHub in 3 Schritten ein</div>
  <ol class="px-steps"><li>Objekt anlegen</li><li>Darlehen eintragen</li><li>Mieter zuordnen</li></ol>
  <div class="row-actions"><button class="btn primary" data-px="wiz">Jetzt einrichten</button><button class="btn" data-px="objimp">Aus Tabelle importieren</button></div></div>
  <div class="row-actions" style="margin:10px 0 0"><button class="btn" data-px="demoLoad">Nur ausprobieren: Beispieldaten laden</button></div><p class="note">Hast du ein Backup, spielst du es unter „Mehr“ ein.</p>`; };
function wizHtml(){ const S=px.st, st=S.step||1, m=S.obj&&getM(S.obj);
  let h=`<h3>Einrichten · Schritt ${st} von 3</h3><div class="px-prog" aria-hidden="true">${[1,2,3].map(i=>`<span class="${i<=st?'on':''}"></span>`).join('')}</div>`;
  if(st===1) h+=`<p class="note" style="margin:0">Beginne mit einem Objekt, das du schon besitzt. Weitere legst du später unter „Objekte“ an.</p>
    <label class="ui-field">Name<input id="pw_name" placeholder="z. B. Wohnung Hauptstraße" value="${esc(m?m.name:'')}"></label><label class="ui-field">Adresse<input id="pw_adr" value="${esc(m?m.adresse||'':'')}" autocomplete="street-address"></label>
    <div class="ui-row2"><label class="ui-field">Kaufpreis (€)<input id="pw_kp" inputmode="decimal" value="${m&&m.kp?esc(nf(m.kp,0)):''}"></label><label class="ui-field">Kaufdatum<input type="date" id="pw_kauf" value="${esc(m&&m.kauf||'')}"></label></div>
    <div class="ui-row2"><label class="ui-field">Wohnfläche (m²)<input id="pw_qm" inputmode="decimal" value="${m&&m.qm?esc(nf(m.qm,0)):''}"></label><label class="ui-field">Baujahr<input id="pw_bj" inputmode="numeric" value="${m&&m.bj?esc(String(m.bj)):''}"></label></div>
    <button type="button" class="ui-btn primary wide" data-px="wiz1">Weiter</button>`;
  if(st===2) h+=`<p class="note" style="margin:0">Die Angaben stehen im Darlehensvertrag. Daraus rechnet die App Restschuld, Tilgungsplan und Zinsbindung.</p>
    <div class="ui-row2"><label class="ui-field">Darlehen (€)<input id="pw_loan" inputmode="decimal" value="${m&&m.loan?esc(nf(m.loan,0)):''}"></label><label class="ui-field">Erste Rate am<input type="date" id="pw_r1" value="${esc(m&&m.rate1||'')}"></label></div>
    <div class="ui-row2"><label class="ui-field">Sollzins (%)<input id="pw_zins" inputmode="decimal" value="${m&&m.zins?esc(nf(m.zins,2)):''}"></label><label class="ui-field">Tilgung (%)<input id="pw_tilg" inputmode="decimal" value="${m&&m.tilg?esc(nf(m.tilg,2)):''}"></label></div>
    <div class="ui-row2"><label class="ui-field">Zinsbindung (Jahre)<input id="pw_fix" inputmode="numeric" value="${m&&m.fix?esc(String(m.fix)):''}"></label><label class="ui-field">Rate laut Bank (€)<input id="pw_rbk" inputmode="decimal" value="${m&&m.ratebk?esc(nf(m.ratebk,2)):''}"></label></div>
    <button type="button" class="ui-btn primary wide" data-px="wiz2">Weiter</button><button type="button" class="ui-btn wide" data-px="wizSkip">Kein Darlehen, überspringen</button>`;
  if(st===3){ const vu=urlOf(appDef('ver'));
    h+=`<p class="note" style="margin:0">Mieter und Mieten verwaltest du in der Vermietung. Lege dort die Wohnung von „${esc(m?m.name:'deinem Objekt')}“ und den Mieter an. Der Hub ordnet sie über den Namen zu. Sobald ein Mieter eingetragen ist, zählt das Objekt zum Bestand.</p>
    ${vu?`<a class="ui-btn primary wide" href="${esc(vu)}" data-px="wizDone">Vermietung öffnen</a>`:''}<button type="button" class="ui-btn wide" data-px="wizDone">Fertig, später erledigen</button>`; }
  return h; }
const OF=[['name','Name',[/^name$|bezeichnung|^objekt$|objektname/]],['adresse','Adresse',[/adresse|anschrift|strasse/]],['ort','Ort / PLZ',[/^ort$|^plz|^stadt$/]],['kp','Kaufpreis',[/kaufpreis/]],['kauf','Kaufdatum',[/kaufdatum|^kauf$|erwerb/]],['qm','Wohnfläche',[/wohnflaeche|flaeche|^qm$|^m2$/]],['bj','Baujahr',[/baujahr/]],['kalt','Kaltmiete',[/kaltmiete|^miete/]],['mw','Marktwert',[/marktwert|verkehrswert|^wert$/]],['loan','Darlehen',[/^darlehen$|darlehensbetrag|kredit|darlehen urspr/]],['rest','Restschuld',[/restschuld/]],['restDate','Restschuld Stand',[/restschuld.*(stand|datum)|^stand$/]],['zins','Sollzins',[/zins/]],['tilg','Tilgung',[/tilgung/]],['ratebk','Monatsrate',[/rate/]],['fixEnd','Zinsbindung bis',[/zinsbindung.*(bis|ende)|zinsbindungsende|festschreibung/]],['rate1','Erste Rate',[/erste rate|rate1|ratenbeginn/]]];
function objAuto(H){ const N=H.map(NORM), col={}; const used=new Set();
  ['restDate','fixEnd','rate1','name','adresse','ort','kp','kauf','qm','bj','kalt','mw','loan','rest','zins','tilg','ratebk'].forEach(k=>{ const f=OF.find(x=>x[0]===k); const i=N.findIndex((h,j)=>!used.has(j)&&f[2].some(re=>re.test(h))); col[k]=i; if(i>-1) used.add(i); });
  return col; }
function objImpHtml(){ const S=px.st;
  let h='<h3>Objekte aus Tabelle importieren</h3>';
  if(!S.rows){ h+=`<p class="note" style="margin:0">In Excel oder Numbers die Tabelle mit Überschriften markieren, kopieren und hier einfügen. Oder eine CSV-Datei wählen. Eine Zeile pro Objekt.</p>
    <label class="ui-field">Tabelle einfügen<textarea id="po_txt" rows="6" placeholder="Name	Adresse	Kaufpreis	Kaufdatum	Wohnfläche	Darlehen	Zins	Tilgung …"></textarea></label>
    <button type="button" class="ui-btn primary wide" data-px="objPaste">Übernehmen</button>
    <label class="ui-btn wide px-file"><input type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" data-pxf="obj" hidden>CSV-Datei wählen</label>
    <button type="button" class="ui-btn wide" data-px="objTpl">Vorlage herunterladen</button>${S.err?`<div class="warn">${esc(S.err)}</div>`:''}`; return h; }
  const ex=new Set(hObjs().map(m=>NORM(m.name)));
  const val=(r,k)=>S.col[k]>-1?(r[S.col[k]]||'').trim():'';
  h+=`<details class="fold"><summary><span>Spalten zuordnen</span></summary><div class="fb">${OF.map(f=>`<label class="ui-field">${f[1]}<select data-pxo="col" data-f="${f[0]}"><option value="-1">– keine –</option>${S.head.map((c,i)=>`<option value="${i}" ${S.col[f[0]]===i?'selected':''}>${esc(c||('Spalte '+(i+1)))}</option>`).join('')}</select></label>`).join('')}</div></details>`;
  if(S.col.name<0) h+='<div class="warn">Keine Spalte für den Namen gefunden. Ordne sie unter „Spalten zuordnen“ zu.</div>';
  h+='<div class="px-list">'+S.rows.map((r,k)=>{ const nm=val(r,'name'), dup=ex.has(NORM(nm)), on=S.on[k]!==false&&!!nm&&!dup;
    const bits=[val(r,'adresse'),val(r,'kp')&&('Kaufpreis '+val(r,'kp')),val(r,'loan')&&('Darlehen '+val(r,'loan')),val(r,'zins')&&('Zins '+val(r,'zins'))].filter(Boolean).join(' · ');
    return `<div class="px-tx${on?' on':''}"><label class="px-chk"><input type="checkbox" data-pxo="on" data-k="${k}" ${on?'checked':''} ${!nm||dup?'disabled':''}><span><b>${esc(nm||'(ohne Name)')}</b>${dup?' · schon vorhanden':''}<br><small>${esc(bits)}</small></span></label></div>`; }).join('')+'</div>';
  const n=S.rows.filter((r,k)=>S.on[k]!==false&&val(r,'name')&&!ex.has(NORM(val(r,'name')))).length;
  h+=`<button type="button" class="ui-btn primary wide" data-px="objDo" ${n?'':'disabled'}>${n} Objekt${n===1?'':'e'} anlegen</button><button type="button" class="ui-btn wide" data-px="objNew">Andere Tabelle</button>`;
  return h; }
function objLoad(txt){ const rows=parseCSV(txt); if(rows.length<2){ px.st={err:'Es wurden keine Zeilen erkannt. Die erste Zeile muss die Überschriften enthalten.'}; draw(); return; }
  const head=rows[0], col=objAuto(head); px.st={head,rows:rows.slice(1),col,on:{}}; draw(); }
function objDo(){ const S=px.st, ex=new Set(hObjs().map(m=>NORM(m.name))), val=(r,k)=>S.col[k]>-1?(r[S.col[k]]||'').trim():''; const u=undoHub(); let n=0;
  S.rows.forEach((r,k)=>{ const nm=val(r,'name'); if(!nm||S.on[k]===false||ex.has(NORM(nm))) return;
    const o={name:nm}; const adr=[val(r,'adresse'),val(r,'ort')].filter(Boolean).join(', '); if(adr) o.adresse=adr;
    ['kp','qm','kalt','mw','loan','rest','zins','tilg','ratebk'].forEach(f=>{ const v=num(val(r,f)); if(isFinite(v)&&v>0) o[f]=f==='zins'||f==='tilg'||f==='ratebk'?Math.round(v*100)/100:Math.round(v); });
    const bj=parseInt(val(r,'bj'),10); if(bj>1700&&bj<2100) o.bj=bj;
    ['kauf','restDate','fixEnd','rate1'].forEach(f=>{ const d=date(val(r,f)); if(d) o[f]=d; });
    if(o.rest&&!o.restDate) o.restDate=todayS();
    newMaster(o); ex.add(NORM(nm)); n++; });
  if(!n) return; saveHub(); close(); tab='obj'; objSel=''; render(); window.scrollTo(0,0); u(n+' Objekt'+(n===1?'':'e')+' importiert'); }
const TPL='Name;Adresse;Ort;Kaufpreis;Kaufdatum;Wohnfläche;Baujahr;Kaltmiete;Marktwert;Darlehen;Sollzins;Tilgung;Monatsrate;Erste Rate;Zinsbindung bis;Restschuld;Restschuld Stand\nWohnung Beispielstraße;Beispielstraße 1;70173 Stuttgart;250000;01.06.2021;68;1995;850;280000;200000;1,2;2,0;533,33;30.06.2021;30.06.2031;;\n';
px.objBtn=()=>'<button class="btn" data-px="objimp">Aus Tabelle importieren</button>';


/* ================= 5. Ist-Cashflow ================= */
/* Kassensicht je Monat: Mieteingänge (Zahlungsdatum) minus Darlehensrate laut Plan minus Kosten laut Belegen (Belegdatum). */
function cfOf(m,n){ n=n||12; const V=rd('vermietung-v1'), cur=ymOf(todayS()), M=monthsList(addM(cur,-(n-1)),cur), ids=verIds(m);
  const tids=new Set((V&&V.tens||[]).filter(t=>ids.includes(String(t.objId))).map(t=>t.id)), pl=planOf(m), byYm={}; if(pl&&pl.rows) pl.rows.forEach(r=>{ byYm[r.ym]=r; });
  const D=docsOf(m.id).filter(d=>ImmoCore.docIsCost(d.kind)&&d.amount>0&&ImmoCore.isDate(d.date));
  const rows=M.map(ym=>{ const inc=(V&&V.pays||[]).filter(p=>tids.has(p.tid)&&((ImmoCore.isDate(p.datum)?p.datum.slice(0,7):p.monat)===ym)).reduce((a,p)=>a+(p.betrag||0),0);
    const r=byYm[ym], rate=r?(r.pay||0):0, cost=D.filter(d=>d.date.slice(0,7)===ym).reduce((a,d)=>a+d.amount,0);
    const so=(V&&V.tens||[]).filter(t=>tids.has(t.id)).reduce((x,t)=>{ const q=soll(t,ym); return x+(q?q.total:0); },0);
    return {ym,inc,rate,cost,so,cf:inc-rate-cost}; });
  const miss=rows.filter(r=>r.so>0.5&&r.inc<0.5).length;
  const T=rows.reduce((a,r)=>{ a.inc+=r.inc; a.rate+=r.rate; a.cost+=r.cost; a.cf+=r.cf; return a; },{inc:0,rate:0,cost:0,cf:0});
  const plan=((ImmoCore.sums().cp||{})[m.id]||{}).cfm;
  return {rows,T,n,has:tids.size>0||!!pl||D.length>0,plan:typeof plan==='number'?plan:null,nDocs:D.filter(d=>d.date.slice(0,7)>=M[0]).length,miss}; }
px.cfSum=function(objs){ let cf=0,n=0; objs.forEach(m=>{ const c=cfOf(m,12); if(c.has){ cf+=c.T.cf; n++; } }); return {cf,n}; };
function bars(rows){ const W=300,H=70,mx=Math.max(1,...rows.map(r=>Math.abs(r.cf))), bw=W/rows.length, z=H/2;
  return `<svg viewBox="0 0 ${W} ${H}" class="px-bars" role="img" aria-label="Cashflow je Monat">`+rows.map((r,i)=>{ const h=Math.max(1,Math.abs(r.cf)/mx*(z-4)); return `<rect x="${(i*bw+2).toFixed(1)}" y="${(r.cf>=0?z-h:z).toFixed(1)}" width="${(bw-4).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${r.cf>=0?'var(--good)':'var(--bad)'}"><title>${fmtYm(r.ym)}: ${(r.cf>=0?'+':'−')+eur(Math.abs(r.cf))}</title></rect>`; }).join('')+`<line x1="0" x2="${W}" y1="${z}" y2="${z}" stroke="var(--line)" stroke-width="1"/></svg>`; }
px.cfCard=function(m){ const c=cfOf(m,12); if(!c.has) return ''; const T=c.T, avg=T.cf/12, sg=v=>(v>=0?'+':'−')+eur(Math.abs(v));
  let h=`<h2>Ist-Cashflow</h2><div class="ui-card"><div style="display:flex;justify-content:space-between;align-items:flex-end;gap:10px;flex-wrap:wrap"><div><div class="note" style="margin:0">Letzte 12 Monate</div><div style="font-size:26px;font-weight:700" class="${T.cf>=0?'t-good':'t-bad'}">${sg(T.cf)}</div></div><div style="text-align:right"><div class="note" style="margin:0">Ø pro Monat</div><b>${sg(avg)}</b>${c.plan!=null?`<div class="note" style="margin:0">Plan laut Cockpit ${sg(c.plan)}</div>`:''}</div></div>
    ${bars(c.rows)}<div class="px-ax"><span>${fmtYm(c.rows[0].ym)}</span><span>${fmtYm(c.rows[c.rows.length-1].ym)}</span></div>
    <div class="kv"><div>Mieteingänge<small>Zahlungen laut Vermietung, mit Nebenkosten</small></div><b>${eur(T.inc)}</b></div>
    <div class="kv"><div>Darlehensraten<small>Zins und Tilgung laut Tilgungsplan</small></div><b>−${eur(T.rate)}</b></div>
    <div class="kv"><div>Kosten laut Belegen<small>${c.nDocs} Beleg${c.nDocs===1?'':'e'}: Erhaltung, Betriebskosten, Verwaltung</small></div><b>−${eur(T.cost)}</b></div>
    ${c.miss?`<div class="warn" style="margin:8px 0 0">In ${c.miss} Monat${c.miss===1?'':'en'} ist keine Miete gebucht. Sind die Zahlungen eingegangen, buche sie (zum Beispiel über „Kontoauszug einlesen“ unter Mieten), sonst ist der Cashflow zu niedrig.</div>`:''}
    ${c.plan!=null?`<p class="note" style="margin:6px 0 0">${avg>=c.plan?'Besser':'Schlechter'} als geplant um ${eur(Math.abs(avg-c.plan))} pro Monat. Das Cockpit rechnet mit Annahmen für Leerstand, Kosten und Rücklage, hier zählen nur echte Zahlungen und Belege.</p>`:'<p class="note" style="margin:6px 0 0">Nur echte Zahlungen und abgelegte Belege. Tilgung ist enthalten, obwohl sie Vermögen aufbaut. Fehlen Belege, wirkt der Cashflow besser als er ist.</p>'}</div>`;
  return h; };


/* ================= 6. Beispieldaten ================= */
const isDemo=x=>!!(x&&x.demo);
function realData(){ const V=rd('vermietung-v1'); return hObjs().some(m=>!isDemo(m))||((V&&V.tens)||[]).some(t=>!isDemo(t)); }
function demoThere(){ return hObjs().some(isDemo); }
px.demoCard=function(){ const has=demoThere(), real=realData();
  return `<h2>Beispieldaten</h2><div class="card pad"><p style="margin:0 0 10px">Zum Ausprobieren: drei erfundene Objekte mit Darlehen, drei Mietern, Zahlungen, einem Beleg und Terminen. Alles ist mit „Beispiel“ markiert und lässt sich mit einem Tipp wieder entfernen, ohne deine eigenen Daten anzufassen.</p>
    <div class="row-actions">${has?'<button class="btn" data-px="demoDel">Beispieldaten entfernen</button>':real?'':'<button class="btn primary" data-px="demoLoad">Beispieldaten laden</button>'}</div>
    ${!has&&real?'<p class="note" style="margin:6px 0 0">Nicht verfügbar, weil schon eigene Objekte oder Mieter erfasst sind. So vermischen sich Beispiel und echte Zahlen nicht.</p>':''}</div>`; };
function demoLoad(){ if(realData()||demoThere()) return; const y=new Date().getFullYear(), td=todayS(), cur=ymOf(td), uid=()=>'d'+Math.random().toString(36).slice(2,10);
  const A=newMaster({name:'Beispiel: Wohnung Musterstraße'}), Bo=newMaster({name:'Beispiel: Altbau Lindenweg'}), C=newMaster({name:'Beispiel: Inserat Gartenstraße'});
  Object.assign(A,{demo:true,adresse:'Musterstraße 12, 70173 Stuttgart',kp:240000,kauf:(y-4)+'-03-01',qm:64,bj:1994,mw:275000,mwDate:td,loan:190000,zins:1.4,tilg:2,rate1:(y-4)+'-03-30',fix:10,kalt:780});
  Object.assign(Bo,{demo:true,adresse:'Lindenweg 5, 72072 Tübingen',kp:420000,kauf:(y-2)+'-06-01',qm:138,bj:1912,mw:450000,mwDate:td,loan:330000,zins:3.4,tilg:2,rate1:(y-2)+'-06-30',fix:10,kalt:1450});
  Object.assign(C,{demo:true,adresse:'Gartenstraße 8, 71034 Böblingen',kp:199000,qm:55,bj:1972,kalt:690});
  const V=rd('vermietung-v1')||{v:1,objs:[],tens:[],pays:[],abr:{},settings:{kappung:20}}; ['objs','tens','pays'].forEach(k=>{ if(!Array.isArray(V[k])) V[k]=[]; }); V.abr=V.abr||{}; V.settings=V.settings||{kappung:20};
  const U=(name,hubId,qm)=>{ const o={id:uid(),name,adresse:'',qm,hubId,demo:true}; V.objs.push(o); return o; };
  const T=(objId,x)=>{ const t=Object.assign({id:uid(),objId,mieter:'',tel:'',mail:'',personen:0,start:'',ende:'',kalt0:0,nk:0,stell:0,art:'fest',idxBasis:null,idxMonat:'',kaution:{betrag:0,eingang:'',anlage:'',rueck:''},changes:[],notiz:'',demo:true},x); V.tens.push(t); return t; };
  const wA=U('Beispiel: Musterstraße 12',A.id,64), w1=U('Beispiel: Lindenweg EG',Bo.id,70), w2=U('Beispiel: Lindenweg OG',Bo.id,68);
  const ts=[T(wA.id,{mieter:'Beispiel: Familie Berger',start:(y-4)+'-05-01',kalt0:720,nk:160,stell:40,kaution:{betrag:2160,eingang:(y-4)+'-05-01',anlage:'Mietkautionskonto',rueck:''},changes:[{ab:(y-1)+'-06',kalt:780,nk:null,grund:'vergleich',note:''}]}),
    T(w1.id,{mieter:'Beispiel: Laura Kern',start:(y-2)+'-08-01',kalt0:690,nk:150,art:'index',idxBasis:117.8,idxMonat:(y-2)+'-08',kaution:{betrag:2070,eingang:(y-2)+'-08-01',anlage:'',rueck:''}}),
    T(w2.id,{mieter:'Beispiel: Jonas Weber',start:(y-1)+'-01-01',kalt0:720,nk:140,art:'staffel',changes:[{ab:y+'-01',kalt:750,nk:null,grund:'staffel',note:''},{ab:(y+1)+'-01',kalt:780,nk:null,grund:'staffel',note:''}]})];
  ts.forEach(t=>monthsList(ymOf(t.start),addM(cur,-1)).forEach(m=>{ const so=soll(t,m); if(so) V.pays.push({id:uid(),tid:t.id,datum:m+'-02',monat:m,betrag:so.total,note:'Beispiel',demo:true}); }));
  recurs().push({id:nid('r'),text:'Rauchmelder prüfen',every:12,next:ImmoCore.addMonths(td,1),obj:A.id,demo:true});
  hItems().push({id:nid('i'),kind:'aufgabe',text:'Beispiel: Angebot Dachrinne einholen',obj:Bo.id,date:ImmoCore.addMonths(td,0).slice(0,8)+'28',time:'',done:false,ts:Date.now(),demo:true});
  A.links.ver=wA.id; Bo.links.ver=w1.id;
  if(!wV(V)) return;
  /* Kurzfassung wie sie die Vermietung schreibt, damit der Hub sofort rechnet (die Vermietung ersetzt sie beim nächsten Öffnen) */
  try{ const sm=rd(SUMKEY)||{}; const keep=(sm.mieten||[]).filter(x=>!ts.some(t=>t.id===x.tid));
    sm.mieten=keep.concat(ts.map(t=>{ const o=V.objs.find(u=>u.id===t.objId)||{}, so=soll(t,cur)||{kalt:t.kalt0,stell:t.stell,nk:t.nk}; return {tid:t.id,oid:o.id,name:o.name||'',qm:o.qm||0,mieter:t.mieter,art:t.art,kalt:so.kalt,nk:so.nk!=null?so.nk:t.nk,stell:so.stell!=null?so.stell:(t.stell||0)}; }));
    sm.ts=Date.now(); localStorage.setItem(SUMKEY,JSON.stringify(sm)); }catch(e){}
  refreshSummary(V); saveHub();
  const blob=new Blob(['Beispielbeleg ImmoHub'],{type:'text/plain'});
  ImmoCore.docs.add({obj:A.id,kind:'rechnung',name:'Beispiel: Heizungswartung',date:(y)+'-03-14',year:String(y),amount:285},blob).catch(()=>{}).then(()=>loadDocs()).then(()=>{ tab='home'; render(); window.scrollTo(0,0); ImmoCore.haptic('success'); toast('Beispieldaten geladen. Entfernen unter „Mehr“.'); }); }
function demoDel(){ const ids=hObjs().filter(isDemo).map(m=>m.id); const V=rd('vermietung-v1');
  if(V){ const tids=new Set((V.tens||[]).filter(isDemo).map(t=>t.id)); V.objs=(V.objs||[]).filter(o=>!isDemo(o)); V.tens=(V.tens||[]).filter(t=>!isDemo(t)); V.pays=(V.pays||[]).filter(p=>!isDemo(p)&&!tids.has(p.tid));
    Object.keys(V.abr||{}).forEach(k=>{ if([...tids].some(t=>k.indexOf(t+'-')===0)) delete V.abr[k]; }); wV(V); refreshSummary(V); }
  hub.objs=hub.objs.filter(m=>!isDemo(m)); hub.recur=recurs().filter(r=>!isDemo(r)); hub.items=hItems().filter(i=>!isDemo(i)&&!ids.includes(i.obj));
  if(!hObjs().length) hub.vh={}; if(hub.payMap) Object.keys(hub.payMap).forEach(k=>{ if(!(V&&(V.tens||[]).some(t=>t.id===hub.payMap[k]))) delete hub.payMap[k]; });
  saveHub();
  Promise.all((DOCS||[]).filter(d=>ids.includes(d.obj)).map(d=>ImmoCore.docs.del(d.id).catch(()=>{}))).then(()=>loadDocs()).then(()=>{ objSel=''; render(true); toast('Beispieldaten entfernt.'); }); }

/* ================= Ereignisse ================= */
document.addEventListener('click',e=>{ const b=e.target.closest('[data-px]'); if(!b) return; const a=b.dataset.px; const v=id=>{ const x=$('#'+id); return x?x.value.trim():''; };
  if(a==='close'){ close(); return; }
  if(a==='demoLoad'){ demoLoad(); return; }
  if(a==='demoDel'){ demoDel(); return; }
  if(a==='bank'){ open('bank',{}); return; }
  if(a==='bankNew'){ px.st={}; draw(); return; }
  if(a==='bankBook'){ bankBook(); return; }
  if(a==='repBank'){ printHtml('Vermögensaufstellung '+fmtD(todayS()),bankReport()); return; }
  if(a==='repTax'){ const Y=+ui['taxYear']||new Date().getFullYear()-1, ids=taxIds(); if(!ids.length){ toast('Kein Objekt im Bestand.'); return; } printHtml('Anlage V '+Y,taxReport(Y,ids)); return; }
  if(a==='repTaxOne'){ const Y=+ui['taxYear']||new Date().getFullYear()-1; printHtml('Anlage V '+Y,taxReport(Y,[b.dataset.id])); return; }
  if(a==='fristen'){ tab='fristen'; render(); window.scrollTo(0,0); return; }
  if(a==='frF'){ ui['pxFr']=b.dataset.v; saveUi(); render(true); return; }
  if(a==='recNew'){ open('recur',{every:12,next:todayS()}); return; }
  if(a==='recPre'){ const p=PRESETS[+b.dataset.i]; px.st.text=p[0]; px.st.every=p[1]; px.st.next=v('pr_next')||px.st.next; px.st.obj=v('pr_obj'); draw(); return; }
  if(a==='recSave'){ const t=v('pr_txt'), ev=Math.max(1,Math.min(120,parseInt(v('pr_every'),10)||12)), nx=v('pr_next'); if(!t||!ImmoCore.isDate(nx)){ toast('Bitte Text und Datum angeben.'); return; }
    const u=undoHub(); recurs().push({id:nid('r'),text:t,every:ev,next:nx,obj:v('pr_obj')}); saveHub(); close(); render(true); u('Gespeichert: '+t); return; }
  if(a==='recDone'){ const r=recurs().find(x=>x.id===b.dataset.id); if(!r) return; const u=undoHub(); r.last=todayS(); let n=ImmoCore.addMonths(r.next,r.every); while(n<=todayS()) n=ImmoCore.addMonths(n,r.every); r.next=n; saveHub(); render(true); u('Erledigt. Nächster Termin '+fmtD(n)); return; }
  if(a==='recDel'){ const u=undoHub(); hub.recur=recurs().filter(x=>x.id!==b.dataset.id); saveHub(); render(true); u('Termin gelöscht'); return; }
  if(a==='wiz'){ open('wiz',{step:1}); return; }
  if(a==='wiz1'){ const nm=v('pw_name'); if(!nm){ toast('Bitte einen Namen eingeben.'); return; } let m=px.st.obj&&getM(px.st.obj); if(!m){ m=newMaster({name:nm}); px.st.obj=m.id; }
    m.name=nm; m.adresse=v('pw_adr'); const kp=ImmoCore.parseDE(v('pw_kp'),0); if(kp>0) m.kp=Math.round(kp); if(ImmoCore.isDate(v('pw_kauf'))) m.kauf=v('pw_kauf'); const qm=ImmoCore.parseDE(v('pw_qm'),0); if(qm>0) m.qm=qm; const bj=parseInt(v('pw_bj'),10); if(bj>1700&&bj<2100) m.bj=bj;
    saveHub(); px.st.step=2; draw(); render(true); return; }
  if(a==='wiz2'){ const m=getM(px.st.obj); if(!m) return; const n=id=>ImmoCore.parseDE(v(id),0); if(n('pw_loan')>0) m.loan=Math.round(n('pw_loan')); if(ImmoCore.isDate(v('pw_r1'))) m.rate1=v('pw_r1'); if(n('pw_zins')>0) m.zins=n('pw_zins'); if(n('pw_tilg')>0) m.tilg=n('pw_tilg'); if(n('pw_fix')>0) m.fix=Math.round(n('pw_fix')); if(n('pw_rbk')>0) m.ratebk=n('pw_rbk');
    if(m.loan&&!m.rate1){ toast('Bitte das Datum der ersten Rate angeben.'); return; } saveHub(); px.st.step=3; draw(); render(true); return; }
  if(a==='wizSkip'){ px.st.step=3; draw(); return; }
  if(a==='wizDone'){ hub.onbDone=true; saveHub(); const id=px.st&&px.st.obj; close(); if(b.tagName!=='A'){ tab=id?'obj':'home'; objSel=id||''; render(); window.scrollTo(0,0); } return; }
  if(a==='objimp'){ open('objimp',{}); return; }
  if(a==='objPaste'){ const t=$('#po_txt'); if(!t||!t.value.trim()){ toast('Bitte zuerst die Tabelle einfügen.'); return; } objLoad(t.value); return; }
  if(a==='objNew'){ px.st={}; draw(); return; }
  if(a==='objTpl'){ ImmoCore.saveFile('ImmoHub-Objekte-Vorlage.csv','text/csv;charset=utf-8','﻿'+TPL); return; }
  if(a==='objDo'){ objDo(); return; }
});
document.addEventListener('change',e=>{ const t=e.target;
  if(t.dataset.pxf==='bank'&&t.files&&t.files[0]){ bankLoad(t.files[0]); return; }
  if(t.dataset.pxf==='obj'&&t.files&&t.files[0]){ const r=new FileReader(); r.onload=()=>objLoad(decode(r.result)); r.readAsArrayBuffer(t.files[0]); return; }
  if(t.dataset.pxb&&px.mode==='bank'&&px.st.list){ const x=px.st.list[+t.dataset.k];
    if(t.dataset.pxb==='on'&&x){ x.on=t.checked; draw(); return; }
    if(t.dataset.pxb==='tid'&&x){ x.tid=t.value; x.on=!!t.value; draw(); return; }
    if(t.dataset.pxb==='mon'&&x){ x.mon=t.value; return; }
    if(t.dataset.pxb==='col'){ px.st.P.col[t.dataset.f]=+t.value; const T=bankTx(px.st.P); px.st.list=bankMatch(rd('vermietung-v1'),T.tx); px.st.neg=T.neg; draw(); return; } }
  if(t.dataset.pxo&&px.mode==='objimp'&&px.st.rows){ if(t.dataset.pxo==='on'){ px.st.on[+t.dataset.k]=t.checked; draw(); return; } if(t.dataset.pxo==='col'){ px.st.col[t.dataset.f]=+t.value; draw(); return; } }
  if(t.dataset.pxr){ const o=ui['pxRep']=ui['pxRep']||{}; const k=t.dataset.pxr;
    if(k==='kauf'){ o.kauf=t.checked; saveUi(); render(true); return; }
    if(k==='name'){ o.name=t.value.trim(); saveUi(); return; }
    if(k==='taxObj'){ o.taxObj=t.value; saveUi(); return; }
    if(k==='zins'){ const z=ImmoCore.parseDE(t.value,4); ui['pxZins']=z>0&&z<20?z:4; saveUi(); render(true); return; } }
});
function saveUi(){ try{ localStorage.setItem(UIKEY,JSON.stringify(ui)); }catch(_){} }
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&px.mode) close(); });

/* Start: beim ersten Öffnen ohne Daten den Einstieg anbieten */
try{ if(tab==='home') render(true); }catch(_){}
})();
