const KEY = "schulplaner-preview-v1";
const days = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag"];
let data = loadData();
let selectedDay = days[(new Date().getDay()+6)%7] || "Montag";
if (!days.includes(selectedDay)) selectedDay = "Montag";

function loadData(){try{return JSON.parse(localStorage.getItem(KEY))||{profile:{},grades:[],lessons:[],materials:[],exams:[],theme:"dark"}}catch{return {profile:{},grades:[],lessons:[],materials:[],exams:[],theme:"dark"}}}
function save(){localStorage.setItem(KEY,JSON.stringify(data));render()}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function go(page){document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id==="page-"+page));document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===page));document.querySelector(".sidebar").classList.remove("open");window.scrollTo(0,0)}
document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.page)));
document.querySelectorAll("[data-goto]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.goto)));
document.getElementById("profileButton").onclick=()=>go("profile");
document.getElementById("menuToggle").onclick=()=>document.querySelector(".sidebar").classList.toggle("open");
document.getElementById("themeToggle").onclick=()=>{data.theme=data.theme==="light"?"dark":"light";save()};
document.getElementById("profileForm").addEventListener("submit",e=>{e.preventDefault();data.profile={first:val("firstName"),last:val("lastName"),school:val("school"),klass:val("className"),type:val("schoolType"),degree:val("targetDegree")};save();go("dashboard")});
document.getElementById("gradeForm").addEventListener("submit",e=>{e.preventDefault();data.grades.push({id:Date.now(),subject:val("gradeSubject"),grade:Number(val("gradeValue")),type:val("gradeType")});e.target.reset();save()});
document.getElementById("lessonForm").addEventListener("submit",e=>{e.preventDefault();data.lessons.push({id:Date.now(),day:val("lessonDay"),period:Number(val("lessonPeriod")),subject:val("lessonSubject"),teacher:val("lessonTeacher")});e.target.reset();save()});
document.getElementById("materialForm").addEventListener("submit",e=>{e.preventDefault();data.materials.push({id:Date.now(),subject:val("materialSubject"),items:val("materialItems")});e.target.reset();save()});
document.getElementById("examForm").addEventListener("submit",e=>{e.preventDefault();data.exams.push({id:Date.now(),title:val("examTitle"),date:val("examDate"),type:val("examType")});e.target.reset();save()});
document.getElementById("resetButton").onclick=()=>{if(confirm("Wirklich alle lokalen Testdaten auf diesem Gerät löschen?")){localStorage.removeItem(KEY);data=loadData();render();go("dashboard")}};
function val(id){return document.getElementById(id).value.trim()}
function removeFrom(key,id){data[key]=data[key].filter(x=>x.id!==Number(id));save()}
function render(){
 document.body.classList.toggle("light",data.theme==="light");
 document.getElementById("themeToggle").innerHTML=data.theme==="light"?"🌙 <span>Dunkel</span>":"☀️ <span>Hell</span>";
 const p=data.profile, name=p.first||"du";
 document.getElementById("welcomeName").textContent=name;document.getElementById("sideName").textContent=p.first?`${p.first} ${p.last||""}`:"Noch kein Profil";document.getElementById("sideClass").textContent=p.klass?`${p.school||"Schule"} · ${p.klass}`:"Demo-Modus";document.getElementById("sideAvatar").textContent=(p.first||"?")[0].toUpperCase();
 document.getElementById("dateText").textContent=new Intl.DateTimeFormat("de-DE",{day:"2-digit",month:"short"}).format(new Date());document.getElementById("todayLabel").textContent=new Intl.DateTimeFormat("de-DE",{weekday:"long"}).format(new Date()).toUpperCase();
 document.getElementById("gradeCount").textContent=data.grades.length;document.getElementById("subjectCount").textContent=new Set(data.lessons.map(x=>x.subject)).size;
 const avg=data.grades.length?(data.grades.reduce((a,x)=>a+x.grade,0)/data.grades.length).toFixed(2).replace(".",","):"—";document.getElementById("average").textContent=avg;document.getElementById("gradeTotal").textContent=`${data.grades.length} Einträge`;
 document.getElementById("gradeRows").innerHTML=data.grades.length?data.grades.map(x=>`<tr><td>${esc(x.subject)}</td><td><span class="grade-badge">${x.grade}</span></td><td>${esc(x.type)}</td><td><button class="delete-button" data-remove="grades" data-id="${x.id}">Löschen</button></td></tr>`).join(""):'<tr><td colspan="4" class="table-empty">Noch keine Noten vorhanden.</td></tr>';
 const upcoming=[...data.exams].filter(x=>x.date>=new Date().toISOString().slice(0,10)).sort((a,b)=>a.date.localeCompare(b.date));document.getElementById("nextExam").textContent=upcoming[0]?new Date(upcoming[0].date+"T12:00:00").toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"}):"—";
 const today=days[(new Date().getDay()+6)%7];const todayLessons=data.lessons.filter(x=>x.day===today).sort((a,b)=>a.period-b.period);document.getElementById("todaySchedule").innerHTML=todayLessons.length?todayLessons.map(lessonHtml).join(""):'<div class="empty-state">Für heute ist noch nichts eingetragen.</div>';
 document.getElementById("upcomingList").innerHTML=upcoming.length?upcoming.slice(0,3).map(x=>`<div class="list-row"><div><strong>${esc(x.title)}</strong><small>${esc(x.type)}</small></div><span class="date-chip">${new Date(x.date+"T12:00:00").toLocaleDateString("de-DE",{day:"2-digit",month:"short"})}</span></div>`).join(""):'<div class="empty-state">Noch keine Proben oder Termine eingetragen.</div>';
 document.getElementById("weekdayTabs").innerHTML=days.map(d=>`<button class="weekday-tab ${selectedDay===d?"active":""}" data-day="${d}">${d.slice(0,2)}</button>`).join("");document.querySelectorAll("[data-day]").forEach(b=>b.onclick=()=>{selectedDay=b.dataset.day;render()});document.getElementById("selectedDayTitle").textContent=selectedDay;const lessons=data.lessons.filter(x=>x.day===selectedDay).sort((a,b)=>a.period-b.period);document.getElementById("lessonList").className=lessons.length?"list-stack":"list-stack empty-state";document.getElementById("lessonList").innerHTML=lessons.length?lessons.map(lessonHtml).join(""):"Noch keine Stunden eingetragen.";
 document.getElementById("materialList").innerHTML=data.materials.length?data.materials.map(x=>`<article class="material-card"><h3>${esc(x.subject)}</h3><p>${esc(x.items)}</p><button class="delete-button" data-remove="materials" data-id="${x.id}">Löschen</button></article>`).join(""):'<div class="empty-state">Noch keine Materialien eingetragen.</div>';
 document.getElementById("examList").className=data.exams.length?"list-stack":"list-stack empty-state";document.getElementById("examList").innerHTML=data.exams.length?[...data.exams].sort((a,b)=>a.date.localeCompare(b.date)).map(x=>`<div class="list-row"><div><strong>${esc(x.title)}</strong><small>${esc(x.type)}</small></div><span class="date-chip">${new Date(x.date+"T12:00:00").toLocaleDateString("de-DE")}</span><button class="delete-button" data-remove="exams" data-id="${x.id}">×</button></div>`).join(""):"Noch keine Termine eingetragen.";
 ["firstName","lastName","school","className","schoolType","targetDegree"].forEach((id,i)=>{const keys=["first","last","school","klass","type","degree"];document.getElementById(id).value=p[keys[i]]||(["Mittelschule","Noch offen"][i-4]||"")});
 renderPrognosis();
 document.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>removeFrom(b.dataset.remove,b.dataset.id));
}

function renderPrognosis(){
 const box=document.getElementById("prognosisContent");
 const p=data.profile||{};
 if(!p.type||!p.degree||p.degree==="Noch offen"){
   box.innerHTML='<div class="prognosis-indicator info">i</div><div class="prognosis-copy"><strong>Profil vervollständigen</strong><p>Wähle unter „Profil“ deine Schulart und deinen gewünschten Abschluss. Dann kann ich deine eingetragenen Noten grob einordnen.</p></div>';
   return;
 }
 if(!data.grades.length){
   box.innerHTML='<div class="prognosis-indicator info">✎</div><div class="prognosis-copy"><strong>Noch keine Noten vorhanden</strong><p>Trage erst ein paar aktuelle Noten ein. Danach zeigen wir dir eine erste Tendenz.</p></div>';
   return;
 }
 const avg=data.grades.reduce((n,x)=>n+x.grade,0)/data.grades.length;
 const belowOrEqual4=data.grades.filter(x=>x.grade<=4).length;
 const above4=data.grades.filter(x=>x.grade>4).length;
 let status="Deine Noten-Tendenz ist noch offen", cls="info", icon="i", detail="Mit den bisher eingetragenen Noten lässt sich noch keine belastbare Einschätzung ableiten.";
 const isMittelschule=p.type==="Mittelschule";
 const isQuali=p.degree.toLowerCase().includes("qualifiz");
 const isErfolgreich=p.degree.toLowerCase().includes("erfolgreich");
 if(isMittelschule && isQuali){
   if(avg<=2.7){status="Gute erste Ausgangslage";cls="good";icon="✓";detail="Dein bisheriger Schnitt liegt unter 3,0. Das ist ein positives Signal für dein Ziel – die offizielle Quali-Gesamtbewertung berücksichtigt aber bestimmte Prüfungsfächer, Jahresfortgangsnoten und die Projektprüfung."}
   else if(avg<=3.4){status="Es könnte knapp werden";cls="mid";icon="!";detail="Dein bisheriger Schnitt liegt in der Nähe der 3,0-Grenze. Für den Quali zählen aber bestimmte Prüfungsfächer, Jahresfortgangsnoten und die Projektprüfung – dein einfacher Schnitt ist nicht die offizielle Berechnung."}
   else{status="Hier lohnt sich gezieltes Üben";cls="low";icon="↗";detail="Dein bisheriger Schnitt liegt über 3,0. Das ist ein Hinweis, einige Fächer genauer anzuschauen. Die tatsächliche Quali-Gesamtbewertung wird anders und mit festgelegten Bestandteilen berechnet."}
 }else if(isMittelschule && isErfolgreich){
   if(avg<=3.7 && above4<=2){status="Gute erste Ausgangslage";cls="good";icon="✓";detail="Deine bisher eingetragenen Noten sehen als grobe Tendenz ordentlich aus. Für den erfolgreichen Mittelschulabschluss zählen in Jahrgangsstufe 9 die Vorrückungsfächer, deren Gesamtdurchschnitt und die Anzahl der Noten schlechter als 4."}
   else if(avg<=4.2){status="Ein paar Fächer im Blick behalten";cls="mid";icon="!";detail="Einige deiner Noten könnten den Schnitt belasten. Für den erfolgreichen Mittelschulabschluss zählen in Jahrgangsstufe 9 die Vorrückungsfächer; eine vollständige Prüfung ist mit den bisherigen Einträgen nicht möglich."}
   else{status="Verbesserungsbedarf erkennbar";cls="low";icon="↗";detail="Dein bisheriger Schnitt zeigt, dass sich gezieltes Üben lohnen könnte. Die offizielle Regel bezieht sich auf alle Vorrückungsfächer der Jahrgangsstufe 9 und berücksichtigt auch die Anzahl schwächerer Noten."}
 }else{
   if(avg<=2.7){status="Deine Noten-Tendenz sieht gut aus";cls="good";icon="✓";detail="Dein bisheriger einfacher Durchschnitt ist erfreulich. Für "+p.degree+" an der "+p.type+" gibt es weitere schulartspezifische Regeln und Prüfungsleistungen, die hier noch nicht vollständig erfasst sind."}
   else if(avg<=3.7){status="Deine Tendenz ist im mittleren Bereich";cls="mid";icon="!";detail="Dein bisheriger Durchschnitt gibt eine grobe Orientierung. Für "+p.degree+" an der "+p.type+" reichen die normalen Zeugnisnoten allein nicht für eine verlässliche Prognose."}
   else{status="Einige Noten solltest du im Blick behalten";cls="low";icon="↗";detail="Dein bisheriger Durchschnitt zeigt mögliche Baustellen. Für "+p.degree+" an der "+p.type+" müssen zusätzlich die geltenden Prüfungs- und Versetzungsregeln betrachtet werden."}
 }
 box.innerHTML=`<div class="prognosis-indicator ${cls}">${icon}</div><div class="prognosis-copy"><strong>${status}</strong><p>Gewähltes Ziel: ${esc(p.degree)} · ${esc(p.type)} in Bayern<br>Einfacher Schnitt deiner ${data.grades.length} eingetragenen Noten: <b>${avg.toFixed(2).replace(".",",")}</b></p><p>${detail}</p><small>Nur eine grobe Orientierung, keine offizielle Abschlussprognose oder Garantie. Trage möglichst aktuelle Zeugnisnoten ein und kläre deine Lage mit deiner Lehrkraft.</small></div>`;
}

function lessonHtml(x){return `<div class="list-row"><div><strong>${x.period}. Stunde · ${esc(x.subject)}</strong><small>${esc(x.teacher||"Keine Lehrkraft angegeben")}</small></div><button class="delete-button" data-remove="lessons" data-id="${x.id}">Löschen</button></div>`}
document.getElementById("chatForm").addEventListener("submit",e=>{e.preventDefault();const input=document.getElementById("chatInput"),q=input.value.trim();if(!q)return;addChat(q,"user");input.value="";const answer=answerQuestion(q);setTimeout(()=>addChat(answer,"bot"),180)});
function addChat(text,kind){const box=document.getElementById("chatLog"),div=document.createElement("div");div.className="chat-message "+kind;div.textContent=text;box.appendChild(div);box.scrollTop=box.scrollHeight}
function answerQuestion(q){const s=q.toLowerCase(),today=days[(new Date().getDay()+6)%7];if(s.includes("heute")||s.includes("stundenplan")){const ls=data.lessons.filter(x=>x.day===today).sort((a,b)=>a.period-b.period);return ls.length?`Heute (${today}) hast du: `+ls.map(x=>`${x.period}. Stunde ${x.subject}${x.teacher?", bei "+x.teacher:""}`).join("; ")+".":"Für heute ist noch kein Unterricht eingetragen."}if(s.includes("probe")||s.includes("termin")){const es=[...data.exams].filter(x=>x.date>=new Date().toISOString().slice(0,10)).sort((a,b)=>a.date.localeCompare(b.date));return es.length?`Dein nächster Termin ist ${es[0].title} am ${new Date(es[0].date+"T12:00:00").toLocaleDateString("de-DE")}.`:"Du hast noch keine kommenden Proben oder Termine eingetragen."}if(s.includes("note")||s.includes("schnitt")){if(!data.grades.length)return"Du hast noch keine Noten eingetragen.";const a=data.grades.reduce((n,x)=>n+x.grade,0)/data.grades.length;return`Du hast ${data.grades.length} Noten eingetragen. Dein einfacher Durchschnitt ist ${a.toFixed(2).replace(".",",")}.`;}if(s.includes("lehrer")){const ls=data.lessons.filter(x=>x.day===today&&x.teacher);return ls.length?`Heute sind eingetragen: ${ls.map(x=>`${x.subject}: ${x.teacher}`).join("; ")}.`:"Für heute hast du noch keine Lehrkräfte eingetragen."}return"Das kann ich in dieser Vorschau noch nicht beantworten. Frag mich nach deinem heutigen Stundenplan, deinen Noten oder deiner nächsten Probe."}
render();