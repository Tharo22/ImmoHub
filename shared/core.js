/* Gemeinsamer Kern aller Immobilien-Apps (wird von jeder App per <script src="../shared/core.js"> geladen).
   Enthält: Zugriff auf die Objektliste des Hubs, Datumshilfen, Darlehensrechnung und die Diagramm-Anzeige beim Berühren. */
(function(g){
'use strict';
var HUBKEY='immobilien-hub-v1';
var C={HUBKEY:HUBKEY};

/* ---- Sprache: Deutsch oder Englisch. Gilt nur für Seiten, die vor dem Kern window.IMMO_I18N=1 setzen (Hub, Cockpit). ---- */
var LK='immo-lang';
C.langPref=function(){ try{ var v=localStorage.getItem(LK); return v==='de'||v==='en'?v:''; }catch(e){ return ''; } };
C.lang='de';
if(g.IMMO_I18N){ var _p=C.langPref(); C.lang=_p||(((navigator.language||'de').toLowerCase().indexOf('de')===0)?'de':'en'); }
C.loc=C.lang==='en'?'en-US':'de-DE';
/* Für Schreiben an Mieter: Zahlen und Datum immer deutsch, auch bei englischer Oberfläche */
C.asDe=function(fn){ return function(){ var l=C.lang, lc=C.loc; C.lang='de'; C.loc='de-DE'; try{ return fn.apply(this,arguments); } finally{ C.lang=l; C.loc=lc; } }; };
C.setLang=function(v){ try{ if(v) localStorage.setItem(LK,v); else localStorage.removeItem(LK); }catch(e){} location.reload(); };
C.dc=C.lang==='en'?'.':',';
C.numIn=function(v){ return String(v).replace('.',C.lang==='en'?'.':','); };

/* ---- Objektliste im Hub ---- */
C.hubRead=function(){ try{ var h=JSON.parse(localStorage.getItem(HUBKEY)||'null'); return h&&h.v===1?h:null; }catch(e){ return null; } };
C.hubSave=function(h){ try{ if(!Array.isArray(h.objs)) h.objs=[]; localStorage.setItem(HUBKEY,JSON.stringify(h)); }catch(e){} };
C.hubMasters=function(){ var h=C.hubRead(); return h&&Array.isArray(h.objs)?h.objs:[]; };
C.hubAvail=function(){ return location.protocol==='app:'||C.hubRead()!==null; };
C.hEmpty=function(v){ return v===''||v==null||v===0||v==='0'; };
C.hSame=function(a,b){ return typeof a==='string'||typeof b==='string'?String(a||'').trim()===String(b||'').trim():Math.abs((+a||0)-(+b||0))<0.005; };

/* ---- Datum ---- */
/* Heutiges Datum in Ortszeit (toISOString wäre UTC, zwischen 0 und 1 Uhr noch der Vortag) */
C.localIso=function(d){ d=d||new Date(); var p=function(n){ return String(n).padStart(2,'0'); }; return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes()); };
C.today=function(){ return C.localIso().slice(0,10); };
/* Kalenderdatei (ICS) für Fristen. items: {uid,date,t,sub,warn}. Texte werden in die Oberflächensprache übersetzt. */
C.ics=function(items,prodid,calname){
  function esc(t){ return String(t||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;'); }
  /* Zeilen nach 75 Bytes (UTF-8) falten, ohne Zeichen zu zerteilen */
  function fold(l){ var out=[], cur='', n=0; for(var ch of l){ var b=unescape(encodeURIComponent(ch)).length; if(n+b>(out.length?74:75)){ out.push(cur); cur=''; n=0; } cur+=ch; n+=b; } out.push(cur); return out.join('\r\n '); }
  function p2(n){ return String(n).padStart(2,'0'); }
  var stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+/,''), T=C.t||function(x){ return x; };
  var L=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//'+prodid+'//DE','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
  if(calname) L.push(fold('X-WR-CALNAME:'+esc(T(calname))));
  items.forEach(function(it){ var n=new Date(it.date+'T12:00:00'); n.setDate(n.getDate()+1);
    L.push('BEGIN:VEVENT',fold('UID:'+it.uid+'@immobilien-apps'),'DTSTAMP:'+stamp,'DTSTART;VALUE=DATE:'+it.date.replace(/-/g,''),'DTEND;VALUE=DATE:'+n.getFullYear()+p2(n.getMonth()+1)+p2(n.getDate()),
      fold('SUMMARY:'+esc(T(it.t))),fold('DESCRIPTION:'+esc(T(it.sub||''))),'BEGIN:VALARM','ACTION:DISPLAY',fold('DESCRIPTION:'+esc(T(it.t))),'TRIGGER:-P'+(it.warn||7)+'D','END:VALARM','END:VEVENT'); });
  L.push('END:VCALENDAR'); return L.join('\r\n')+'\r\n';
};
/* Datei über das Teilen-Menü weitergeben, sonst herunterladen. Ergebnis: 'shared' | 'download' | 'abort' */
C.saveFile=function(name,mime,text){
  var blob=new Blob([text],{type:mime});
  try{ var f=new File([blob],name,{type:mime}); if(navigator.canShare&&navigator.canShare({files:[f]})) return navigator.share({files:[f],title:name}).then(function(){ return 'shared'; },function(e){ return e&&e.name==='AbortError'?'abort':dl(); }); }catch(e){}
  return Promise.resolve(dl());
  function dl(){ var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },1500); return 'download'; }
};
C.isDate=function(d){ return /^\d{4}-\d{2}-\d{2}$/.test(d||''); };
C.fmtDate=function(d){ return C.isDate(d)?(C.lang==='en'?d.slice(5,7)+'/'+d.slice(8,10)+'/'+d.slice(0,4):d.slice(8,10)+'.'+d.slice(5,7)+'.'+d.slice(0,4)):''; };
/* Monate vom Monat des Datums bis zum aktuellen Monat (nie negativ, höchstens 600). */
C.monthsSince=function(d){ if(!C.isDate(d)) return 0; var n=new Date(); return Math.max(0,Math.min(600,(n.getFullYear()-(+d.slice(0,4)))*12+(n.getMonth()+1-(+d.slice(5,7))))); };
/* Anzahl der bis heute fälligen Raten bei erster Rate am Datum d (Zahltag des Monats zählt). */
C.paidInstallments=function(d){ if(!C.isDate(d)) return 0; var n=new Date(), df=(n.getFullYear()-(+d.slice(0,4)))*12+(n.getMonth()+1-(+d.slice(5,7))); if(n.getDate()<+d.slice(8,10)) df--; return Math.max(0,Math.min(600,df+1)); };

/* ---- Darlehen (Annuität, monatlich) ---- */
/* Vertragliche Monatsrate aus Darlehen, Zins und Tilgung (% p. a.). */
C.rate=function(base,z,t){ return base*((+z||0)+(+t||0))/1200; };
/* Monatsrate: Wert laut Bank (o.ratebk), sonst Modell aus Darlehen, Zins und Tilgung. */
C.payOf=function(o,base){ var r=+o.ratebk; return r>0?r:C.rate(base,o.zins,o.tilg); };
/* ---- Finanzierung in Abschnitten (Darlehen, Anschlussfinanzierungen) ----
   Abschnitt 1 steht in den Feldern loan, zins, tilg, fix, fixEnd, ratebk. Weitere Abschnitte stehen in o.fin2 = [{zins,tilg,fix,ratebk}].
   Ein Folgeabschnitt beginnt am Ende der Zinsbindung des vorigen und übernimmt dessen Restschuld. */
function addYm(ym,n){ var y=+ym.slice(0,4), m=+ym.slice(5,7)-1+n; return (y+Math.floor(m/12))+'-'+String(((m%12)+12)%12+1).padStart(2,'0'); }
C.addYm=addYm;
function diffYm(a,b){ return (+b.slice(0,4)-(+a.slice(0,4)))*12+(+b.slice(5,7))-(+a.slice(5,7)); }
C.phasesOf=function(o){ var a=[{zins:+o.zins||0,tilg:+o.tilg||0,fix:+o.fix||0,ratebk:+o.ratebk||0}]; (Array.isArray(o.fin2)?o.fin2:[]).forEach(function(f){ a.push({zins:+f.zins||0,tilg:+f.tilg||0,fix:+f.fix||0,ratebk:+f.ratebk||0}); }); return a; };
/* Enddaten der Zinsbindungen aller Abschnitte, soweit bekannt (start = Datum der ersten Rate). */
C.bounds=function(o,start){ var ph=C.phasesOf(o), out=[], e=C.fixEnd(o,start); for(var k=0;k<ph.length;k++){ if(k>0){ if(!e||!(ph[k].fix>0)) break; e=C.addMonths(e,Math.round(ph[k].fix*12)); } if(!e) break; out.push(e); } return out; };
/* Nächstes Ende einer Zinsbindung ab td, sonst das letzte bekannte. */
C.nextFixEnd=function(o,start,td){ var b=C.bounds(o,start); for(var k=0;k<b.length;k++) if(b[k]>=td) return b[k]; return b.length?b[b.length-1]:''; };
/* Gesamtplan: Monat für Monat von der ersten Rate (oder vom Bankwert) bis zur Volltilgung. */
C.plan=function(o){
  var loan=+o.loan||0, rest=+o.rest||0, base=loan>0?loan:rest; if(!(base>0)) return null;
  var n=new Date(), nowYm=n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0'), mode, k0, bal, nowIdx=0;
  if(rest>0){ bal=rest; mode='bank'; k0=nowYm; if(C.isDate(o.restDate)){ k0=addYm(o.restDate.slice(0,7),1); nowIdx=C.monthsSince(o.restDate); mode='bankD'; } }
  else { bal=loan; mode='none'; k0=nowYm; if(C.isDate(o.rate1)){ k0=o.rate1.slice(0,7); nowIdx=C.paidInstallments(o.rate1); mode='rate1'; } }
  var ph=C.phasesOf(o), B=C.bounds(o,C.isDate(o.rate1)?o.rate1:'').map(function(d){ return d.slice(0,7); });
  var phaseAt=function(ym){ var k=0; while(k<ph.length-1&&k<B.length&&ym>=B[k]) k++; return k; };
  var rows=[], cur=-1, pay=0, open=false, start=bal;
  for(var i=0;bal>0.005;i++){
    if(i>=600){ open=true; break; }
    var ym=addYm(k0,i), pi=phaseAt(ym);
    if(pi!==cur){ cur=pi; pay=ph[pi].ratebk>0?ph[pi].ratebk:(pi===0&&i===0?C.rate(base,ph[0].zins,ph[0].tilg):C.rate(bal,ph[pi].zins,ph[pi].tilg)); }
    var it=bal*ph[pi].zins/1200, pr=Math.min(bal,Math.max(0,pay-it)); bal-=pr; if(bal<0.005) bal=0;
    rows.push({i:i,ym:ym,it:it,pr:pr,bal:bal,pay:pay,ph:pi,past:i<nowIdx});
  }
  var now=nowIdx>rows.length?0:(nowIdx>0?rows[nowIdx-1].bal:start), ref=rows.length?rows[Math.min(nowIdx,rows.length-1)]:{ph:0,pay:0}, pc=ref.ph;
  /* Abschnitte, die im Plan vorkommen */
  var phases=[]; rows.forEach(function(r,i){ var q=phases[phases.length-1]; if(!q||q.k!==r.ph){ q={k:r.ph,i0:i,i1:i,from:r.ym,to:r.ym,z:ph[r.ph].zins,t:ph[r.ph].tilg,fix:ph[r.ph].fix,pay:r.pay,bank:ph[r.ph].ratebk>0,startBal:i>0?rows[i-1].bal:start,endBal:r.bal,it:0,pr:0}; phases.push(q); } q.i1=i; q.to=r.ym; q.endBal=r.bal; q.it+=r.it; q.pr+=r.pr; });
  phases.forEach(function(q,x){ q.status=q.i1<nowIdx?'done':(q.i0<=nowIdx?'run':'plan'); q.assumed=(x===phases.length-1)&&q.k===ph.length-1&&B.length>q.k&&q.to>B[q.k]; q.end=B[q.k]||''; });
  var fixLeft=1; if(B[pc]){ fixLeft=Math.max(1,Math.ceil(Math.max(0,diffYm(nowYm,B[pc]))/12)); }
  return {rows:rows,k0:k0,start:start,nowIdx:nowIdx,now:now,pay:nowIdx>=rows.length?0:ref.pay,mode:mode,paid:mode==='bank'?0:nowIdx,fromBank:ph[pc].ratebk>0,z:ph[pc].zins,t:ph[pc].tilg,phase:pc,multi:ph.length>1,fixLeft:fixLeft,phases:phases,open:open,end:open?null:(rows.length?rows[rows.length-1].ym:k0),bounds:B};
};
/* Projektion ab heute, Monat für Monat – gemeinsame Darlehensrechnung für Cockpit, Zeitleiste und Schnellcheck.
   Bekannte Abschnitte (Darlehen und Anschlussfinanzierungen) laufen wie im Plan. Nach dem Ende der letzten bekannten Zinsbindung gilt ein Szenario:
   Zins = letzter Zins + opt.dZins; Rate = opt.anTilg gesetzt ? Restschuld × (Zins + Anschlusstilgung) : bisherige Rate.
   opt: {months, dZins, anTilg, sonder (€ am Ende jedes Projektionsjahres), fresh (als neues Darlehen ab dem Folgemonat, ohne erste Rate, Bankwert, Anschlüsse)}.
   Ohne Datumsbezug zählt die Zinsbindung ab Projektionsbeginn. */
C.project=function(o,opt){
  opt=opt||{}; var src=opt.fresh?{loan:o.loan,zins:o.zins,tilg:o.tilg,fix:o.fix,ratebk:o.ratebk}:o;
  var M=Math.max(1,opt.months||600), rows=[], n=new Date(), curYm=n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0');
  var P=C.plan(src); if(!P) return {rows:rows,bal0:0,fixM:null,endM:null,payoffM:null,P:null,start:addYm(curYm,1)};
  var ph=C.phasesOf(src), B=P.bounds.slice(), hasRef=!opt.fresh&&(P.mode==='rate1'||P.mode==='bankD'||C.isDate(src.fixEnd));
  var m0=opt.fresh?addYm(curYm,1):(P.rows[P.nowIdx]?P.rows[P.nowIdx].ym:addYm(curYm,1));
  if(!hasRef){ B=[]; var e=m0; for(var k=0;k<ph.length;k++){ if(!(ph[k].fix>0)) break; e=addYm(e,Math.round(ph[k].fix*12)); B.push(e); } }
  var lastK=ph.length-1, endYm=B.length>lastK?B[lastK]:null;
  var phaseAt=function(ym){ if(endYm&&ym>=endYm) return 'S'; var k=0; while(k<lastK&&k<B.length&&ym>=B[k]) k++; return k; };
  var bal=opt.fresh?(+src.loan||0):P.now, bal0=bal, cur=null, pay=0, z=0, fixM=null, endM=null, payoffM=null, sonder=Math.max(0,+opt.sonder||0);
  for(var i=0;i<M;i++){
    var ym=addYm(m0,i), pi=phaseAt(ym);
    if(pi!==cur){
      if(cur!==null&&fixM===null) fixM=i;
      if(pi==='S'){ endM=i; z=Math.max(0,ph[lastK].zins+(+opt.dZins||0)); if(opt.anTilg!=null) pay=bal*(z+(+opt.anTilg||0))/1200; else if(cur===null) pay=opt.fresh?C.payOf(ph[lastK],bal):P.pay; }
      else { z=ph[pi].zins; if(cur===null) pay=opt.fresh?C.payOf(src,bal):P.pay; else pay=ph[pi].ratebk>0?ph[pi].ratebk:C.rate(bal,ph[pi].zins,ph[pi].tilg); }
      cur=pi;
    }
    var it=bal*z/1200, pr=Math.min(bal,Math.max(0,pay-it)); bal-=pr;
    var sp=0; if(sonder>0&&(i+1)%12===0&&bal>0){ sp=Math.min(bal,sonder); bal-=sp; }
    if(bal<0.005) bal=0; if(bal===0&&payoffM===null&&bal0>0) payoffM=i+1;
    rows.push({i:i,ym:ym,it:it,pr:pr,sp:sp,bal:bal,z:z,pay:pay,ph:pi});
  }
  if(fixM===null&&endM!==null) fixM=endM;
  return {rows:rows,bal0:bal0,fixM:fixM,endM:endM,payoffM:payoffM,P:P,start:m0,bounds:B};
};
/* Restschuld heute (und aktuelle Rate) – kompatible Kurzform. mode: 'bankD' | 'bank' | 'rate1' | 'none' */
C.currentBalance=function(o){ var P=C.plan(o); if(!P) return null; return {pay:P.pay,now:P.now,mode:P.mode,paid:P.paid,fromBank:P.fromBank,z:P.z,t:P.t,multi:P.multi,fixLeft:P.fixLeft,plan:P}; };



/* ---- Gemeinsame Hilfen für Anzeige und Eingabe ---- */
C.esc=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
C.nf=function(v,d){ return Number(v).toLocaleString(C.loc,{minimumFractionDigits:d,maximumFractionDigits:d}); };
/* Zahl aus Texteingabe (deutsches Format, mit € % m² und Minuszeichen −). Bei leerer oder ungültiger Eingabe: fb (Standard 0). */
C.parseDE=function(v,fb){ var t=String(v).trim().replace(/[\s€%²m]/g,'').replace(/−/g,'-');
  if(C.lang==='en'){ if(/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)||(t.indexOf(',')>=0&&t.indexOf('.')>=0)) t=t.replace(/,/g,''); else t=t.replace(',','.'); }
  else t=t.replace(/\.(?=\d{3}(\D|$))/g,'').replace(',','.');
  var x=parseFloat(t); return isFinite(x)?x:(fb===undefined?0:fb); };
C.kpi=function(l,v,s,cls){ return '<div class="kpi"><div class="l">'+l+'</div><div class="v '+(cls||'')+'">'+v+'</div>'+(s?'<div class="s">'+s+'</div>':'')+'</div>'; };
var toastT=null;
C.toast=function(t){ var e=document.querySelector('#toast'); if(!e){ e=document.createElement('div'); e.id='toast'; e.className='toast'; e.setAttribute('role','status'); document.body.appendChild(e); } e.textContent=t; e.hidden=false; clearTimeout(toastT); toastT=setTimeout(function(){ e.hidden=true; },2600); };

/* ---- Fristen der Finanzierung ---- */
C.addMonths=function(d,n){ var y=+d.slice(0,4), m=+d.slice(5,7)-1+n, day=+d.slice(8,10), t=new Date(y,m,1), dim=new Date(t.getFullYear(),t.getMonth()+1,0).getDate(); day=Math.min(day,dim); return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(day).padStart(2,'0'); };
/* Ende der Zinsbindung: eingetragenes Datum, sonst Beginn plus Jahre. */
C.fixEnd=function(o,start){ if(C.isDate(o.fixEnd)) return o.fixEnd; var y=+o.fix; return (y>0&&C.isDate(start))?C.addMonths(start,Math.round(y*12)):''; };
/* Termine je Objekt. list: [{o:Cockpit-Objekt, start:Datum der ersten Rate oder des Kaufs}], td: heute (JJJJ-MM-TT), eur: Formatfunktion. */
C.finItems=function(list,td,eur){
  var items=[], y=+td.slice(0,4);
  list.forEach(function(x){
    var o=x.o, E=C.nextFixEnd(o,x.start,td), nm=o.name||'Objekt';
    if(E&&E>=td){
      items.push({uid:'cp-fix-'+o.id+'-'+E,date:E,t:'Zinsbindung endet: '+nm,sub:'Darlehen '+eur(+o.loan||0)+'. Die Anschlussfinanzierung muss stehen.',warn:90});
      [[12,'Anschlussfinanzierung anfragen','Ein Jahr vor Ende der Zinsbindung Angebote einholen. Forward-Darlehen prüfen.','pre'],[6,'Angebote vergleichen','Sechs Monate vor Ende: Konditionen vergleichen und eine Zusage einholen.','vgl'],[3,'Anschlussvertrag abschließen','Drei Monate vor Ende: Vertrag unterschreiben, damit nichts ausläuft.','abs']].forEach(function(k){
        var d=C.addMonths(E,-k[0]); if(d>=td) items.push({uid:'cp-'+k[3]+'-'+o.id+'-'+d,date:d,t:k[1]+': '+nm,sub:k[2],warn:14});
      });
    }
    if(+o.sonder>0){
      [y,y+1].forEach(function(yr){ var d=yr+'-12-01'; if(d>=td&&(!E||d<=E)) items.push({uid:'cp-sond-'+o.id+'-'+d,date:d,t:'Sondertilgung bis Jahresende: '+nm,sub:'Geplant '+eur(+o.sonder)+'. Bei der Bank rechtzeitig anmelden, sie läuft zum Jahresende.',warn:14}); });
    }
  });
  return items;
};

/* ---- Diagramm: Werte beim Berühren (SVG mit data-sc) ---- */
(function(){
var NS='http://www.w3.org/2000/svg', cur=null;
function mk(n,a,p){ var e=document.createElementNS(NS,n); for(var k in a) e.setAttribute(k,a[k]); if(p) p.appendChild(e); return e; }
function clr(){ if(cur){ var g=cur.querySelector('.scg'); if(g) g.remove(); cur=null; } }
function show(svg,ev){
  var d; try{ d=JSON.parse(svg.getAttribute('data-sc')); }catch(_){ return; } if(!d||!d.p||!d.p.length) return;
  var r=svg.getBoundingClientRect(), vb=svg.viewBox.baseVal; if(!r.width) return;
  var x=(ev.clientX-r.left)/r.width*vb.width+vb.x, b=d.p[0];
  d.p.forEach(function(q){ if(Math.abs(q.x-x)<Math.abs(b.x-x)) b=q; });
  var old=svg.querySelector('.scg'); if(old) old.remove(); cur=svg;
  var g=mk('g',{'class':'scg','pointer-events':'none'},svg);
  mk('line',{x1:b.x,x2:b.x,y1:d.t,y2:d.b,style:'stroke:var(--muted);stroke-width:1;stroke-dasharray:3 3'},g);
  var lines=[b.l].concat(b.r.map(function(q){ return q[0]+': '+q[1]; }));
  b.r.forEach(function(q){ if(q[3]==null) return; mk('circle',{cx:b.x,cy:q[3],r:4,style:'fill:'+q[2]+';stroke:var(--surface);stroke-width:1.5'},g); });
  var w=Math.max.apply(null,lines.map(function(t){ return t.length; }))*5.9+18, h=lines.length*14+8;
  var tx=b.x+10; if(tx+w>vb.x+vb.width-2) tx=b.x-10-w; if(tx<vb.x+2) tx=vb.x+2; var ty=d.t+2;
  mk('rect',{x:tx,y:ty,width:w,height:h,rx:6,style:'fill:var(--surface);stroke:var(--line);stroke-width:1'},g);
  lines.forEach(function(t,i){ var e=mk('text',{x:tx+9,y:ty+15+i*14,'text-anchor':'start',style:'fill:var(--ink,currentColor);stroke:none;font-size:10.5px;font-weight:'+(i?400:700)},g); e.textContent=t; });
}
document.addEventListener('pointerdown',function(e){ var s=e.target.closest&&e.target.closest('svg[data-sc]'); if(s) show(s,e); else clr(); });
document.addEventListener('pointermove',function(e){ var s=e.target.closest&&e.target.closest('svg[data-sc]'); if(s) show(s,e); else if(e.pointerType==='mouse') clr(); });
})();


/* ---- Einheitliche Oberfläche: Zurück-zum-Hub-Leiste und Symbole in den Tab-Leisten ---- */
var TI={
 home:'<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
 chart:'<path d="M4 20V11M10 20V5M16 20v-7M21 20H3"/>',
 tag:'<path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="8.5" r="1"/>',
 tools:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z"/>',
 key:'<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
 percent:'<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.2"/><circle cx="17" cy="17" r="2.2"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
 flame:'<path d="M12 22c4 0 7-2.7 7-6.5 0-3-2-5-3.5-7-.5 2-1.5 3-3 3 0-3-1.5-6-4-8 0 4-4 6-4 12 0 3.5 3.5 6.5 7.5 6.5z"/>',
 users:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 5a3 3 0 0 1 0 6M21 20c0-2.8-1.7-5-4-5.7"/>',
 sliders:'<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
 wallet:'<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
 file:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
 calc:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M12 12h2M8 16h2M12 16h2"/>',
 receipt:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
 check:'<path d="M4 12l5 5L20 6"/>',
 camera:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
 ask:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17v.01"/>',
 flag:'<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>',
 list:'<path d="M5 6h14M5 12h14M5 18h9"/>',
 bank:'<path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18"/>',
 est:'<path d="M3 20l5-6 4 3 8-11"/><path d="M15 6h5v5"/>'
};
var TMAP={'übersicht':'home','ergebnis':'chart','kauf':'tag','sanierung':'tools','verkauf':'key','steuer':'percent','pv':'sun','wärmepumpe':'flame','mieter':'users','annahmen':'sliders','mieteingang':'wallet','verträge':'file','abrechnung':'receipt','rechner':'calc','daten':'list','check':'check','fotos':'camera','fragen':'ask','fazit':'flag','schätzung':'est','kosten':'wallet','miete':'wallet','finanzen':'bank'};
C.icon=function(name,sz){ return TI[name]?'<svg class="ti" viewBox="0 0 24 24" width="'+(sz||21)+'" height="'+(sz||21)+'" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+TI[name]+'</svg>':''; };
var decT=null;
/* Einheiten im Eingabefeld (z. B. „ct/kWh“): Platz rechts an die tatsächliche Breite anpassen, damit nichts überlappt */
function fitUnits(){ document.querySelectorAll('.unit > i').forEach(function(i){ var f=i.parentNode.querySelector('input'); if(!f) return; var w=i.offsetWidth; if(!w) return; var v=(w+18)+'px'; if(f.style.paddingRight!==v) f.style.setProperty('padding-right',v,'important'); }); }
function decorate(){
  try{ fitUnits(); }catch(e){}
  try{ if(document.body&&document.getElementById('hubLink')){ strip(); fab(); } }catch(e){}
  try{ clampNotes(); }catch(e){}
  document.querySelectorAll('.tabbar button, .tabbar a').forEach(function(b){
    if(b.querySelector('svg')) return;
    var n=b.firstChild; while(n&&n.nodeType!==3) n=n.nextSibling; if(!n) return;
    var key=TMAP[n.nodeValue.trim().toLowerCase()]; if(!key) return;
    b.insertAdjacentHTML('afterbegin',C.icon(key));
  });
}
/* ---- Gemeinsame Navigation (Layout Phase 2) ----
   Oben: Kontextzeile „‹ Objekt · Werkzeug“. Darunter die Reiter der App als Umschalter.
   Unten: die Tab-Leiste des Hubs, in jeder App gleich. */
var APPMETA={'immo-schnellcheck':['sc','Schnellcheck','obj'],'besichtigung':['bes','Besichtigung','obj'],'bestands-cockpit':['cp','Cockpit','fin'],'vermietung':['ver','Vermietung','miete'],'pv-waermepumpe':['pv','PV und Wärmepumpe','obj'],'renovierung':['ren','Renovierung','obj'],'flip-rechner':['flip','Flip-Rechner','obj']};
var HUBTABS=[['home','Übersicht','<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>'],['obj','Objekte','<path d="M4 21V5l8-3 8 3v16"/><path d="M9 21v-5h6v5M8 9h2M14 9h2M8 13h2M14 13h2"/>'],['fin','Finanzen','<path d="M3 21h18"/><path d="M5 21V10M10 21V6M15 21v-8M20 21V3"/>'],['miete','Mieten','<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>'],['set','Mehr','<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>']];
function appMeta(){ var f=(location.pathname.split('/').filter(Boolean).slice(-2,-1)[0])||''; return APPMETA[f]||null; }
function hubHref(){ var hl=document.getElementById('hubLink'); return hl?(hl.getAttribute('href')||'').split('#')[0]:''; }
function ctxId(){ try{ return typeof g.immoCtx==='function'?(g.immoCtx()||''):''; }catch(e){ return ''; } }
var stripSig='';
function strip(){
  var hl=document.getElementById('hubLink'), M=appMeta(); if(!hl) return;
  var d=document.getElementById('hubStrip');
  if(!d){ d=document.createElement('div'); d.id='hubStrip'; document.body.insertBefore(d,document.body.firstChild); document.body.classList.add('hs'); }
  var id=ctxId(), m=id&&C.hubMasters?C.hubMasters().filter(function(x){ return x.id===id; })[0]:null, base=hubHref();
  var sig=base+'|'+(m?m.id+'|'+(m.name||''):'')+'|'+(M?M[0]:'');
  if(sig!==stripSig){ stripSig=sig;
    var back=m?'<a href="'+C.esc(base+'#t=obj&o='+encodeURIComponent(m.id))+'" aria-label="Zurück zum Objekt im Hub" translate="no">':'<a href="'+C.esc(base+'#t='+(M?M[2]:'home'))+'" aria-label="Zurück zum Hub">';
    d.innerHTML=back+'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>'+(m?C.esc(m.name||'Objekt'):'Hub')+'</a>'+(M?'<span class="sep" aria-hidden="true">·</span><span class="tool" style="color:var(--c-'+M[0]+')">'+M[1]+'</span>':'');
  }
  var bar=document.getElementById('hubBar');
  if(!bar){ bar=document.createElement('nav'); bar.id='hubBar'; bar.setAttribute('aria-label','Hub-Bereiche'); document.body.appendChild(bar); }
  var bsig=sig;
  if(bar.getAttribute('data-sig')!==bsig){ bar.setAttribute('data-sig',bsig);
    bar.innerHTML=HUBTABS.map(function(t){ var href=base+'#t='+t[0]+(t[0]==='obj'&&m?'&o='+encodeURIComponent(m.id):''); return '<a href="'+C.esc(href)+'"'+(M&&M[2]===t[0]?' aria-current="page"':'')+'><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+t[2]+'</svg><span>'+t[1]+'</span></a>'; }).join('');
  }
  var tb=document.querySelector('.tabbar'); document.body.classList.toggle('hseg',!!tb);
  if(tb){ var ovf=tb.scrollWidth>tb.clientWidth+2; tb.classList.toggle('ovf',ovf);
    if(ovf&&!tb.getAttribute('data-sw')){ tb.setAttribute('data-sw','1'); tb.addEventListener('scroll',function(){ tb.classList.toggle('end',tb.scrollLeft+tb.clientWidth>=tb.scrollWidth-4); },{passive:true});
      var cur=tb.querySelector('[aria-current],[aria-selected="true"]'); if(cur){ var r=cur.getBoundingClientRect(); if(r.right>tb.clientWidth||r.left<0) tb.scrollLeft=cur.offsetLeft-12; } } }
}
function chrome(){
  try{ var st=document.createElement('style'); st.textContent='#hubStrip{position:sticky;top:env(safe-area-inset-top,0px);z-index:7;height:34px;display:flex;align-items:center;background:var(--bg);padding:0 8px}#hubStrip a{display:inline-flex;align-items:center;gap:2px;min-height:34px;padding:0 10px 0 4px;border-radius:10px;color:var(--accent);font-size:14px;font-weight:600;text-decoration:none}#hubLink{display:none!important}body.hs .bar,body.hs .top{top:calc(env(safe-area-inset-top,0px) + 34px)!important}input[type=date],input[type=month]{min-width:8.5em;min-height:42px}input[type=date]::-webkit-date-and-time-value,input[type=month]::-webkit-date-and-time-value{text-align:left}body.hs .tabs,body.hs .stick{top:calc(env(safe-area-inset-top,0px) + 34px)!important}.tabbar svg.ti{margin-bottom:1px;flex:none}.tabbar a:has(svg.ti),.tabbar button:has(svg.ti){min-height:54px}'; document.head.appendChild(st); }catch(e){}
  try{ var st2=document.createElement('style'); st2.textContent=[
    '#hubStrip{gap:6px;font-size:14px;font-weight:600;color:var(--muted);white-space:nowrap;overflow:hidden}',
    '#hubStrip a{min-width:0;overflow:hidden;text-overflow:ellipsis;color:var(--c-hub)!important}',
    '#hubStrip .sep{opacity:.5}#hubStrip .tool{flex:none}',
    /* Reiter der App wandern nach oben und werden zum Umschalter */
    'body.hs .tabbar{position:fixed!important;top:calc(env(safe-area-inset-top,0px) + 34px)!important;bottom:auto!important;left:0;right:0;z-index:6!important;display:flex!important;gap:4px!important;overflow-x:auto;scrollbar-width:none;padding:6px 12px!important;background:var(--bg)!important;border-top:0!important;border-bottom:1px solid var(--line)!important;height:49px}',
    'body.hs .tabbar::-webkit-scrollbar{display:none}',
    'body.hs .tabbar.ovf:not(.end){-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 28px),transparent);mask-image:linear-gradient(to right,#000 calc(100% - 28px),transparent)}',
    'body.hs .tabbar>a,body.hs .tabbar>button{flex:1 0 auto!important;flex-direction:row!important;gap:5px!important;min-height:36px!important;padding:0 12px!important;font-size:13px!important;white-space:nowrap;border-radius:9px!important;justify-content:center}',
    'body.hs .tabbar svg{display:none!important}body.hs .tabbar small{font-size:11px!important;min-height:0!important}',
    'body.hs.hseg #hubStrip{margin-bottom:49px}',
    'body.hs.hseg .bar,body.hs.hseg .top,body.hs.hseg .tabs,body.hs.hseg .stick{top:calc(env(safe-area-inset-top,0px) + 83px)!important}',
    /* Tab-Leiste des Hubs unten */
    '#hubBar{position:fixed;left:0;right:0;bottom:0;z-index:8;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:2px;background:var(--surface);border-top:1px solid var(--line);padding:6px 6px calc(6px + env(safe-area-inset-bottom,0px))}',
    '#hubBar a{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:50px;padding:6px 0;border-radius:10px;color:var(--muted);font-size:10.5px;letter-spacing:-.01em;font-weight:500;text-decoration:none;min-width:0}',
    '#hubBar a span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#hubBar a[aria-current]{color:var(--c-hub);background:color-mix(in srgb,var(--c-hub) 12%,transparent);font-weight:600}',
    'body.hs{padding-bottom:calc(84px + env(safe-area-inset-bottom,0px))}'
  ].join(''); document.head.appendChild(st2); }catch(e){}
  strip(); decorate();
  try{ new MutationObserver(function(){ clearTimeout(decT); decT=setTimeout(decorate,0); }).observe(document.body,{childList:true,subtree:true}); }catch(e){}
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',chrome); else chrome();

try{ var st=document.createElement('style'); st.textContent='svg[data-sc]{touch-action:pan-y}'; document.head.appendChild(st); }catch(e){}

/* ---- Gesamt-Backup (alle Apps, optional mit Fotos der Besichtigung) ----
   Wird vom Hub (Datei) und vom automatischen Backup der iOS-App genutzt: ImmoCore.backupText(true) liefert den Text als Promise. */
/* Ergebnisse der Apps je Hub-Objekt für die Werkzeug-Kacheln im Hub (Layout Phase 3).
   Jede App schreibt ihren Teil: {app:{hubId:{v:Wert,s:Untertitel,st:'ok'|'mid'|'bad'|'none'}}} */
C.SUMKEY='immo-sum-v1';
C.pubSum=function(app,map){ try{ var all=JSON.parse(localStorage.getItem(C.SUMKEY)||'{}')||{}; map=map||{}; if(JSON.stringify(all[app]||{})===JSON.stringify(map)) return; all[app]=map; localStorage.setItem(C.SUMKEY,JSON.stringify(all)); }catch(e){} };
C.sums=function(){ try{ return JSON.parse(localStorage.getItem(C.SUMKEY)||'{}')||{}; }catch(e){ return {}; } };
/* Stand der Web-Dateien, sichtbar im Hub unter Einstellungen */
C.BUILD='11 · 10.11.2026';
/* ---- Installierbare Web-App: ein Service Worker für alle Apps (www/sw.js) + Installieren-Knopf ---- */
C.standalone=function(){ try{ return location.protocol==='app:'||matchMedia('(display-mode: standalone)').matches||navigator.standalone===true; }catch(e){ return false; } };
C.native=(location.protocol==='app:');
var _ip=null;
C.canInstall=function(){ return !!_ip; };
C.install=function(){ if(!_ip) return Promise.resolve(false); var p=_ip; _ip=null; p.prompt(); return p.userChoice.then(function(c){ return c&&c.outcome==='accepted'; },function(){ return false; }); };
try{ addEventListener('beforeinstallprompt',function(e){ e.preventDefault(); _ip=e; try{ dispatchEvent(new Event('immo-installable')); }catch(_){} });
  addEventListener('appinstalled',function(){ _ip=null; try{ dispatchEvent(new Event('immo-installable')); }catch(_){} }); }catch(e){}
try{ var _cs=document.currentScript&&document.currentScript.src;
  if(_cs&&'serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')){
    var _sw=new URL('../sw.js',_cs).href;
    addEventListener('load',function(){ navigator.serviceWorker.register(_sw).catch(function(){}); });
  } }catch(e){}
C.BK_KEYS=['immobilien-schnellcheck-v1','besichtigung-v1','bestands-cockpit-v1','vermietung-v1','pvwp-v1','renovierung-v1','flip-v1','immobilien-hub-v1','vermietung-summary-v1','renovierung-pending-v1','immo-lang'];
function idbPhotos(){ return new Promise(function(res){ if(!window.indexedDB) return res(null); var r; try{ r=indexedDB.open('besichtigung-fotos',1); }catch(e){ return res(null); }
  r.onupgradeneeded=function(){ var d=r.result; var p=d.createObjectStore('photos',{keyPath:'id'}); p.createIndex('obj','obj'); d.createObjectStore('full',{keyPath:'id'}); };
  r.onerror=function(){ res(null); }; r.onsuccess=function(){ res(r.result); }; }); }
function idbAll(st){ return new Promise(function(res){ var q=st.getAll(); q.onsuccess=function(){ res(q.result||[]); }; q.onerror=function(){ res([]); }; }); }
function b64(blob){ return new Promise(function(res){ if(!blob) return res(''); var fr=new FileReader(); fr.onload=function(){ res(String(fr.result||'')); }; fr.onerror=function(){ res(''); }; fr.readAsDataURL(blob); }); }
C.photosExport=function(){ return idbPhotos().then(function(db){ if(!db) return []; var tx=db.transaction(['photos','full'],'readonly');
  return Promise.all([idbAll(tx.objectStore("photos")),idbAll(tx.objectStore("full"))]).then(function(r){ var full={}; r[1].forEach(function(f){ full[f.id]=f.blob; });
    return Promise.all(r[0].map(function(p){ return b64(full[p.id]||p.thumb).then(function(u){ return {id:p.id,obj:p.obj,item:p.item||'',ts:p.ts||0,data:u}; }); })); }); }); };
C.backupText=function(withPhotos){ var data={}, n=0;
  C.BK_KEYS.forEach(function(k){ try{ var v=localStorage.getItem(k); if(v){ data[k]=v; n++; } }catch(e){} });
  var base={src:'immobilien-hub',v:1,ts:new Date().toISOString(),data:data};
  if(!withPhotos) return Promise.resolve(n?JSON.stringify(base):null);
  return C.photosExport().then(function(ph){ if(ph&&ph.length) base.photos=ph; }, function(){})
    .then(function(){ return C.docsExport().then(function(d){ if(d&&d.length) base.docs=d; }, function(){}); })
    .then(function(){ return (n||base.photos||base.docs)?JSON.stringify(base):null; }); };
function toBlob(u){ try{ var i=u.indexOf(','), mime=(u.slice(5,i).split(';')[0])||'image/jpeg', bin=atob(u.slice(i+1)), a=new Uint8Array(bin.length); for(var k=0;k<bin.length;k++) a[k]=bin.charCodeAt(k); return new Blob([a],{type:mime}); }catch(e){ return null; } }
function thumbOf(blob){ return new Promise(function(res){ try{ var u=URL.createObjectURL(blob), im=new Image(); im.onload=function(){ URL.revokeObjectURL(u); var k=Math.min(1,280/Math.max(im.naturalWidth,im.naturalHeight)), c=document.createElement('canvas'); c.width=Math.max(1,Math.round(im.naturalWidth*k)); c.height=Math.max(1,Math.round(im.naturalHeight*k)); c.getContext('2d').drawImage(im,0,0,c.width,c.height); c.toBlob(function(b){ res(b||blob); },'image/jpeg',.7); }; im.onerror=function(){ URL.revokeObjectURL(u); res(blob); }; im.src=u; }catch(e){ res(blob); } }); }
/* Fotos aus einem Backup einspielen: ersetzt alle vorhandenen Fotos. */
C.photosImport=function(list){ return idbPhotos().then(function(db){ if(!db) throw new Error('kein IndexedDB');
  return Promise.all((list||[]).map(function(p){ var bl=toBlob(p.data); return bl?thumbOf(bl).then(function(t){ return {p:p,full:bl,thumb:t}; }):null; })).then(function(items){
    return new Promise(function(res,rej){ var tx=db.transaction(['photos','full'],'readwrite'), ps=tx.objectStore('photos'), fs=tx.objectStore('full'); ps.clear(); fs.clear(); var n=0;
      items.forEach(function(x){ if(!x) return; ps.put({id:x.p.id,obj:x.p.obj,item:x.p.item,ts:x.p.ts,thumb:x.thumb}); fs.put({id:x.p.id,blob:x.full}); n++; });
      tx.oncomplete=function(){ res(n); }; tx.onerror=function(){ rej(tx.error); }; tx.onabort=function(){ rej(tx.error); }; }); }); }); };

/* ================= Ausbau (Pakete A–F) ================= */

/* Rückgängig statt Doppeltipp: Hinweis unten mit Knopf, 6 Sekunden */
var undoT=null;
C.undoToast=function(msg,onUndo){ var e=document.getElementById('undoToast');
  if(!e){ e=document.createElement('div'); e.id='undoToast'; e.className='ui-undo'; e.setAttribute('role','status'); document.body.appendChild(e); }
  e.innerHTML='<span></span><button type="button">Rückgängig</button>'; e.firstChild.textContent=msg; e.hidden=false;
  e.lastChild.onclick=function(){ e.hidden=true; clearTimeout(undoT); try{ onUndo&&onUndo(); }catch(x){} C.haptic&&C.haptic('light'); };
  clearTimeout(undoT); undoT=setTimeout(function(){ e.hidden=true; },6000); };
/* Schnappschuss aller App-Daten (ohne Fotos/Dokumente) für Rückgängig */
C.snap=function(){ var o={}; C.BK_KEYS.forEach(function(k){ try{ o[k]=localStorage.getItem(k); }catch(e){} }); return o; };
C.restoreSnap=function(o){ Object.keys(o||{}).forEach(function(k){ try{ if(o[k]==null) localStorage.removeItem(k); else localStorage.setItem(k,o[k]); }catch(e){} }); };

/* Kurzes Vibrieren in der iPhone-App (Swift: nativeHaptic) */
C.haptic=function(kind){ try{ g.webkit.messageHandlers.nativeHaptic.postMessage(kind||'success'); }catch(e){} };

/* Daten für das iPhone-Widget (Swift: nativeWidget schreibt sie in die App Group) */
C.widgetPush=function(o){ try{ g.webkit.messageHandlers.nativeWidget.postMessage(JSON.stringify(o)); }catch(e){} };

/* ---- Belege und Dokumente je Hub-Objekt (IndexedDB) ----
   meta: {id,obj,kind,name,mime,date,year,amount,ts,size}  blob separat, Vorschau für Bilder */
C.DOCKINDS=[['rechnung','Rechnung Erhaltung',1],['betrieb','Betriebskosten',1],['verwaltung','Verwaltung und Sonstiges',1],['vertrag','Vertrag',0],['bescheid','Bescheid',0],['foto','Foto',0],['sonst','Sonstiges',0]];
C.docKindName=function(k){ var x=C.DOCKINDS.filter(function(d){ return d[0]===k; })[0]; return x?x[1]:'Sonstiges'; };
C.docIsCost=function(k){ var x=C.DOCKINDS.filter(function(d){ return d[0]===k; })[0]; return !!(x&&x[2]); };
function idbDocs(){ return new Promise(function(res){ if(!g.indexedDB) return res(null); var r; try{ r=indexedDB.open('immo-docs',1); }catch(e){ return res(null); }
  r.onupgradeneeded=function(){ var d=r.result; var m=d.createObjectStore('meta',{keyPath:'id'}); m.createIndex('obj','obj'); d.createObjectStore('blob',{keyPath:'id'}); };
  r.onerror=function(){ res(null); }; r.onsuccess=function(){ res(r.result); }; }); }
function txDone(tx){ return new Promise(function(res,rej){ tx.oncomplete=function(){ res(); }; tx.onerror=function(){ rej(tx.error); }; tx.onabort=function(){ rej(tx.error); }; }); }
C.docs={
  list:function(obj){ return idbDocs().then(function(db){ if(!db) return []; var st=db.transaction('meta').objectStore('meta'); return idbAll(obj?st.index('obj'):st).then(function(l){ return obj?l.filter(function(x){ return x.obj===obj; }):l; }); }).then(function(l){ return l.sort(function(a,b){ return (b.date||'').localeCompare(a.date||'')||b.ts-a.ts; }); }); },
  add:function(meta,blob){ return Promise.resolve(/^image\//.test(blob.type||'')?thumbOf(blob):null).then(function(th){
      return idbDocs().then(function(db){ if(!db) throw new Error('kein Speicher'); meta.id=meta.id||('d'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)); meta.ts=meta.ts||Date.now(); meta.size=blob.size||0; meta.mime=meta.mime||blob.type||'';
        if(th) meta.thumb=th; var tx=db.transaction(['meta','blob'],'readwrite'); tx.objectStore('meta').put(meta); tx.objectStore('blob').put({id:meta.id,blob:blob}); return txDone(tx).then(function(){ return meta; }); }); }); },
  put:function(meta){ return idbDocs().then(function(db){ var tx=db.transaction('meta','readwrite'); tx.objectStore('meta').put(meta); return txDone(tx); }); },
  blob:function(id){ return idbDocs().then(function(db){ if(!db) return null; return new Promise(function(res){ var q=db.transaction('blob').objectStore('blob').get(id); q.onsuccess=function(){ res(q.result?q.result.blob:null); }; q.onerror=function(){ res(null); }; }); }); },
  del:function(id){ return C.docs.blob(id).then(function(bl){ return idbDocs().then(function(db){ var keep=null; var q=db.transaction('meta').objectStore('meta').get(id);
      return new Promise(function(r){ q.onsuccess=function(){ keep=q.result; r(); }; q.onerror=function(){ r(); }; }).then(function(){ var tx=db.transaction(['meta','blob'],'readwrite'); tx.objectStore('meta').delete(id); tx.objectStore('blob').delete(id); return txDone(tx).then(function(){ return {meta:keep,blob:bl}; }); }); }); }); },
  restore:function(x){ if(!x||!x.meta) return Promise.resolve(); return idbDocs().then(function(db){ var tx=db.transaction(['meta','blob'],'readwrite'); tx.objectStore('meta').put(x.meta); if(x.blob) tx.objectStore('blob').put({id:x.meta.id,blob:x.blob}); return txDone(tx); }); }
};
C.docsExport=function(){ return C.docs.list().then(function(l){ return Promise.all(l.map(function(m){ return C.docs.blob(m.id).then(b64).then(function(u){ var o=Object.assign({},m); delete o.thumb; o.data=u; return o; }); })); }); };
C.docsImport=function(list){ return idbDocs().then(function(db){ if(!db) throw new Error('kein Speicher'); var tx=db.transaction(['meta','blob'],'readwrite'); tx.objectStore('meta').clear(); tx.objectStore('blob').clear(); return txDone(tx); })
  .then(function(){ var n=0; return (list||[]).reduce(function(p,d){ return p.then(function(){ var bl=toBlob(d.data); if(!bl) return; var m=Object.assign({},d); delete m.data; return C.docs.add(m,bl).then(function(){ n++; }); }); },Promise.resolve()).then(function(){ return n; }); }); };
/* Erstes Foto der Besichtigung eines Objekts (für das Titelbild) */
C.besPhoto=function(besId){ return idbPhotos().then(function(db){ if(!db||besId==null) return null; return new Promise(function(res){ var q=db.transaction('photos').objectStore('photos').index('obj').getAll(+besId); q.onsuccess=function(){ var l=(q.result||[]).sort(function(a,b){ return a.ts-b.ts; }); res(l.length?l[0].thumb:null); }; q.onerror=function(){ res(null); }; }); }); };

/* Kurze Hinweise: lange Erklärtexte sind nach dem ersten Lesen auf eine Zeile eingeklappt, Tippen klappt sie auf */
var NSK='immo-notes-seen', nSeen=null;
function noteKey(t){ var h=0; for(var i=0;i<t.length;i++){ h=(h*31+t.charCodeAt(i))|0; } return (h>>>0).toString(36); }
function clampNotes(){ var els=document.querySelectorAll('p.note:not([data-nc]),div.note:not([data-nc])'); if(!els.length) return;
  if(!nSeen){ try{ nSeen=JSON.parse(localStorage.getItem(NSK)||'{}')||{}; }catch(e){ nSeen={}; } }
  var ch=false; els.forEach(function(e){ e.setAttribute('data-nc','1'); var t=(e.textContent||'').trim(); if(t.length<110||e.querySelector('a,button,input,select')) return;
    var k=noteKey(t); if(nSeen[k]){ e.classList.add('ui-clamp'); } else { nSeen[k]=1; ch=true; }
    e.addEventListener('click',function(){ e.classList.toggle('ui-clamp'); }); });
  if(ch){ try{ localStorage.setItem(NSK,JSON.stringify(nSeen)); }catch(e){} } }

/* „+“ in den Werkzeug-Apps: führt in den Hub, dort öffnet sich das Erfassen-Blatt */
function fab(){ if(document.getElementById('hubFab')||!document.getElementById('hubLink')) return; var a=document.createElement('a'); a.id='hubFab'; a.className='ui-fab'; a.setAttribute('aria-label','Schnell erfassen'); a.textContent='+'; document.body.appendChild(a);
  a.addEventListener('click',function(e){ e.preventDefault(); var id=ctxId(); location.href=hubHref()+'#t=home&add=1'+(id?'&o='+encodeURIComponent(id):''); }); }

/* ---- Übersetzung der Oberfläche (nur Englisch; das Wörterbuch kommt aus shared/i18n-en.js) ---- */
(function(){
  var EN=g.IMMO_EN||{}, PRE=g.IMMO_PRE||[], RU=g.IMMO_RULES||[], FR=[], cache={}, has=Object.prototype.hasOwnProperty;
  Object.keys(EN).forEach(function(k){ if(k.length>=4) FR.push(k); }); FR.sort(function(a,b){ return b.length-a.length; });
  var LET=/[A-Za-zÄÖÜäöüß]/;
  /* Ersetzt deutsche Bausteine in einem Text. Ersetzte Teile werden nicht noch einmal angefasst (sonst Endlosschleifen bei Wörtern wie „Disagio“). */
  function frag(c){
    var segs=[[c,0]];
    for(var f=0;f<FR.length;f++){
      var de=FR[f], en=EN[de], nx=[], hit=false;
      for(var q=0;q<segs.length;q++){
        var sg=segs[q], r=sg[0];
        if(sg[1]||r.indexOf(de)<0){ nx.push(sg); continue; }
        var start=0, from=0, i;
        while((i=r.indexOf(de,from))>=0){
          var e=i+de.length, okL=i===0||!LET.test(r.charAt(i-1))||!LET.test(de.charAt(0)), okR=e>=r.length||!LET.test(r.charAt(e))||!LET.test(de.charAt(de.length-1));
          if(okL&&okR){ if(i>start) nx.push([r.slice(start,i),0]); nx.push([en,1]); start=e; from=e; hit=true; } else from=i+1;
        }
        if(start<r.length) nx.push([r.slice(start),0]);
      }
      segs=nx;
    }
    return segs.map(function(x){ return x[0]; }).join('');
  }
  /* Eigene Namen (Objekte, Mieter, Adressen, Banken …) werden nicht übersetzt. Sie werden aus den gespeicherten Daten gesammelt.
     Namen, die zugleich Wörterbucheinträge sind (z. B. Beispieldaten), dürfen übersetzt werden. */
  var UF={name:1,titel:1,adresse:1,mieter:1,kontakt:1,bank:1,ort:1,strasse:1}, US=[], USet={}, usT=0, usSig='';
  function usBuild(){
    var now=Date.now(); if(now-usT<1500) return; usT=now; var acc={};
    function walk(v,d){ if(d>6||!v||typeof v!=='object') return; if(Array.isArray(v)){ for(var i=0;i<v.length;i++) walk(v[i],d+1); return; }
      for(var k in v){ var x=v[k]; if(typeof x==='string'){ if(UF[k]){ x=x.trim(); if(x.length>=3&&LET.test(x)&&!has.call(EN,x)&&!/^(Beispiel|Muster)/.test(x)) acc[x]=1; } } else if(x&&typeof x==='object') walk(x,d+1); } }
    (C.BK_KEYS||[]).forEach(function(k){ try{ var r=localStorage.getItem(k); if(r&&r.charAt(0)==='{') walk(JSON.parse(r),0); }catch(e){} });
    var list=Object.keys(acc).sort(function(a,b){ return b.length-a.length; }), sig=list.join('\u0001');
    if(sig!==usSig){ usSig=sig; US=list; USet=acc; cache={}; }
  }
  C.tr=function(s){
    s=String(s==null?'':s); var m=/^(\s*)([\s\S]*?)(\s*)$/.exec(s), c=m[2]; if(!c) return s;
    if(!LET.test(c)) return s;
    if(has.call(USet,c)) return s;
    var r=has.call(cache,c)?cache[c]:undefined;
    if(r===undefined){ if(has.call(EN,c)) r=EN[c]; else { r=c; var keep=[];
        for(var u=0;u<US.length;u++){ if(r.indexOf(US[u])>=0){ r=r.split(US[u]).join('\uE000'+keep.length+'\uE001'); keep.push(US[u]); } }
        for(var j0=0;j0<PRE.length;j0++) r=r.replace(PRE[j0][0],PRE[j0][1]); r=frag(r); for(var j=0;j<RU.length;j++) r=r.replace(RU[j][0],RU[j][1]);
        if(keep.length) r=r.replace(/\uE000(\d+)\uE001/g,function(_,i){ return keep[+i]; }); }
      cache[c]=r; }
    return m[1]+r+m[3];
  };
  C.t=function(s){ return C.lang==='en'?C.tr(s):s; };
  if(C.lang!=='en') return;
  var ATTR=['placeholder','aria-label','title','alt'], SKIP={SCRIPT:1,STYLE:1,TEXTAREA:1};
  var mine=new WeakMap();
  function fixText(n){ var pe=n.parentNode; if(pe&&pe.closest&&pe.closest('[translate="no"]')) return; var v=n.nodeValue; if(mine.get(n)===v) return; var t=C.tr(v); if(t!==v){ n.nodeValue=t; } mine.set(n,t); }
  var mineA=new WeakMap();
  function fixEl(e){ if(!e.hasAttribute) return; ATTR.forEach(function(a){ if(e.hasAttribute(a)){ var v=e.getAttribute(a), k=mineA.get(e)||{}; if(k[a]===v) return; var t=C.tr(v); if(t!==v) e.setAttribute(a,t); k[a]=t; mineA.set(e,k); } }); }
  function walk(root){
    if(root.nodeType===3){ if(!root.parentNode||!SKIP[root.parentNode.nodeName]) fixText(root); return; }
    if(root.nodeType!==1||SKIP[root.nodeName]) return;
    fixEl(root);
    var w=document.createTreeWalker(root,5), n;
    while((n=w.nextNode())){ if(n.nodeType===3){ if(!SKIP[n.parentNode.nodeName]) fixText(n); } else fixEl(n); }
  }
  function all(){ usBuild(); try{ if(typeof decorate==='function') decorate(); }catch(e){} document.documentElement.lang='en'; if(document.title) document.title=C.tr(document.title); if(document.body) walk(document.body); }
  function start(){
    all();
    new MutationObserver(function(ms){ usBuild(); try{ if(typeof decorate==='function') decorate(); }catch(e){} ms.forEach(function(m){ if(m.type==='attributes'){ fixEl(m.target); return; } if(m.type==='characterData'){ if(m.target.parentNode&&!SKIP[m.target.parentNode.nodeName]) fixText(m.target); } else m.addedNodes.forEach(walk); }); }).observe(document.body,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:ATTR});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();
g.ImmoCore=C;
})(window);
