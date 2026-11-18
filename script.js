const KEY = "schulplaner-preview-v1";
// Supabase-Projektdaten hier eintragen (Projekt-URL + Publishable Key, niemals Service-Role-Key).
const SUPABASE_URL = "https://wygkjvofgelfttdfjfcl.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_3jRUceLgBkmqgw0azh-SUoA_yZEick5a";
let supabaseClient = null;
let currentUser = null;
let cloudSaveTimer = null;
let cloudReady = false;
const days = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag"];
const periods = [1,2,3,4,5,6,7,8,9];
let data = loadData();
let selectedDay = days[(new Date().getDay()+6)%7] || "Montag";
if (!days.includes(selectedDay)) selectedDay = "Montag";
let timetableMode = "subject";
let longPressTimer = null;
let longPressTriggered = false;

function loadData(){
  try {
    const d = JSON.parse(localStorage.getItem(KEY)) || {};
    return {
      profile:d.profile||{}, grades:d.grades||[], lessons:d.lessons||[], materials:d.materials||[],
      exams:d.exams||[], theme:d.theme||"dark", subjects:d.subjects||[], teachers:d.teachers||[]
    };
  } catch {
    return {profile:{},grades:[],lessons:[],materials:[],exams:[],theme:"dark",subjects:[],teachers:[]};
  }
}
function save(){
  localStorage.setItem(KEY,JSON.stringify(data));
  render();
  if(currentUser && cloudReady) scheduleCloudSave();
}
function scheduleCloudSave(){
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer=setTimeout(async()=>{
    try{
      const {error}=await supabaseClient.from("user_settings").upsert({user_id:currentUser.id,settings:{app_data:data},updated_at:new Date().toISOString()},{onConflict:"user_id"});
      if(error) throw error;
      setAuthStatus("Online gespeichert ✓");
    }catch(err){console.error(err);setAuthStatus("Online-Speicherung fehlgeschlagen: "+(err.message||"Unbekannter Fehler"));}
  },500);
}
function setAuthStatus(message){const el=document.getElementById("authStatus");if(el)el.textContent=message;}
function updateAuthUI(){
  const signedIn=!!currentUser;
  document.getElementById("signOutButton").hidden=!signedIn;
  document.getElementById("signInButton").hidden=signedIn;
  document.getElementById("signUpButton").hidden=signedIn;
  document.getElementById("authEmail").disabled=signedIn;
  document.getElementById("authPassword").disabled=signedIn;
  if(signedIn)setAuthStatus("Angemeldet als "+currentUser.email+". Deine Daten werden online gespeichert.");
}
async function loadCloudData(){
  if(!currentUser)return;
  setAuthStatus("Lade deine gespeicherten Daten …");
  const {data:row,error}=await supabaseClient.from("user_settings").select("settings").eq("user_id",currentUser.id).maybeSingle();
  if(error)throw error;
  if(row?.settings?.app_data){
    const remote=row.settings.app_data;
    data={profile:remote.profile||{},grades:remote.grades||[],lessons:remote.lessons||[],materials:remote.materials||[],exams:remote.exams||[],theme:remote.theme||"dark",subjects:remote.subjects||[],teachers:remote.teachers||[]};
    localStorage.setItem(KEY,JSON.stringify(data));
    render();
    setAuthStatus("Deine Online-Daten wurden geladen ✓");
  }else{
    await supabaseClient.from("user_settings").upsert({user_id:currentUser.id,settings:{app_data:data},updated_at:new Date().toISOString()},{onConflict:"user_id"});
    setAuthStatus("Konto verbunden. Deine bisherigen Gerätedaten wurden erstmals online gespeichert ✓");
  }
  cloudReady=true;
}
async function initSupabase(){
  if(!window.supabase?.createClient){setAuthStatus("Supabase-Bibliothek konnte nicht geladen werden. Prüfe deine Internetverbindung.");return;}
  if(SUPABASE_PUBLISHABLE_KEY.startsWith("HIER_DEIN_")){setAuthStatus("Supabase-Schlüssel fehlt noch. Wir tragen ihn als Nächstes ein.");return;}
  supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
  const {data:sessionData}=await supabaseClient.auth.getSession();
  currentUser=sessionData.session?.user||null;
  updateAuthUI();
  if(currentUser){try{await loadCloudData()}catch(e){setAuthStatus("Laden fehlgeschlagen: "+e.message)}}
  supabaseClient.auth.onAuthStateChange(async(_event,session)=>{
    currentUser=session?.user||null;cloudReady=false;updateAuthUI();
    if(currentUser){try{await loadCloudData()}catch(e){setAuthStatus("Laden fehlgeschlagen: "+e.message)}}
    else setAuthStatus("Abgemeldet. Daten auf diesem Gerät bleiben erhalten.");
  });
}
async function signInOrUp(mode){
  if(!supabaseClient){setAuthStatus("Supabase ist noch nicht konfiguriert. Der Publishable Key fehlt.");return;}
  const email=document.getElementById("authEmail").value.trim(),password=document.getElementById("authPassword").value;
  if(!email||password.length<8){setAuthStatus("Bitte E-Mail und ein Passwort mit mindestens 8 Zeichen eingeben.");return;}
  setAuthStatus("Einen Moment …");
  const result=mode==="signup"?await supabaseClient.auth.signUp({email,password}):await supabaseClient.auth.signInWithPassword({email,password});
  if(result.error){setAuthStatus(result.error.message);return;}
  if(mode==="signup"&&!result.data.session){setAuthStatus("Konto erstellt. Bitte bestätige zuerst den Link in deiner E-Mail und melde dich danach an.");return;}
  if(result.data.user){currentUser=result.data.user;updateAuthUI();try{await loadCloudData()}catch(e){setAuthStatus("Verbindung fehlgeschlagen: "+e.message)}}
}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function val(id){return document.getElementById(id).value.trim()}
function go(page){document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id==="page-"+page));document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===page));document.querySelector(".sidebar").classList.remove("open");window.scrollTo(0,0)}
function ensureSubjects(){
  data.lessons.forEach(l=>{
    if(l.subject && !data.subjects.some(s=>s.name.toLowerCase()===l.subject.toLowerCase())){
      data.subjects.push({id:Date.now()+Math.random(),name:l.subject,short:l.subject.slice(0,3).toUpperCase(),color:"#3977b5"});
    }
  });
}
ensureSubjects();

document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.page)));
document.querySelectorAll("[data-goto]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.goto)));
document.getElementById("profileButton").onclick=()=>go("profile");
document.getElementById("signInButton").onclick=()=>signInOrUp("signin");
document.getElementById("signUpButton").onclick=()=>signInOrUp("signup");
document.getElementById("signOutButton").onclick=async()=>{if(supabaseClient)await supabaseClient.auth.signOut();currentUser=null;cloudReady=false;updateAuthUI();setAuthStatus("Abgemeldet. Deine Daten auf diesem Gerät bleiben erhalten.");};
document.getElementById("menuToggle").onclick=()=>document.querySelector(".sidebar").classList.toggle("open");
document.getElementById("themeToggle").onclick=()=>{data.theme=data.theme==="light"?"dark":"light";save()};

document.getElementById("profileForm").addEventListener("submit",e=>{
  e.preventDefault();
  data.profile={first:val("firstName"),last:val("lastName"),school:val("school"),klass:val("className"),type:val("schoolType"),degree:val("targetDegree")};
  save();go("dashboard");
});
document.getElementById("gradeForm").addEventListener("submit",e=>{
  e.preventDefault();data.grades.push({id:Date.now(),subject:val("gradeSubject"),grade:Number(val("gradeValue")),type:val("gradeType")});e.target.reset();save();
});
document.getElementById("subjectForm").addEventListener("submit",e=>{
  e.preventDefault();
  const name=val("subjectName");
  if(data.subjects.some(s=>s.name.toLowerCase()===name.toLowerCase())){alert("Dieses Fach gibt es bereits.");return}
  data.subjects.push({id:Date.now(),name,short:val("subjectShort")||name.slice(0,3).toUpperCase(),color:val("subjectColor")||"#3977b5"});
  e.target.reset();document.getElementById("subjectColor").value="#3977b5";save();
});
document.getElementById("teacherForm").addEventListener("submit",e=>{
  e.preventDefault();const name=val("teacherName");if(!name)return;
  if(!data.teachers.some(t=>t.toLowerCase()===name.toLowerCase()))data.teachers.push(name);
  e.target.reset();save();
});
document.getElementById("materialForm").addEventListener("submit",e=>{
  e.preventDefault();data.materials.push({id:Date.now(),subject:val("materialSubject"),items:val("materialItems")});e.target.reset();save();
});
document.getElementById("examForm").addEventListener("submit",e=>{
  e.preventDefault();data.exams.push({id:Date.now(),title:val("examTitle"),date:val("examDate"),type:val("examType")});e.target.reset();save();
});
document.getElementById("resetButton").onclick=()=>{
  if(confirm("Wirklich alle lokalen Testdaten auf diesem Gerät löschen?")){localStorage.removeItem(KEY);data=loadData();render();go("dashboard")}
};

document.querySelectorAll("[data-mode]").forEach(b=>b.addEventListener("click",()=>{
  timetableMode=b.dataset.mode;
  document.querySelectorAll("[data-mode]").forEach(x=>x.classList.toggle("active",x===b));
  document.getElementById("teacherTools").hidden=timetableMode!=="teacher";
  document.getElementById("timetableHint").textContent=timetableMode==="subject"
    ?"Wähle oben ein Fach und tippe auf die Stunden, in denen du es hast. Tippe erneut, um es zu ändern."
    :"Wähle eine Lehrkraft und tippe auf die Stunden, denen du sie zuordnen möchtest.";
}));
document.getElementById("activeSubject").addEventListener("change",()=>{});
document.getElementById("activeTeacher").addEventListener("change",()=>{});

function removeFrom(key,id){data[key]=data[key].filter(x=>String(x.id)!==String(id));save()}
function getSubject(name){return data.subjects.find(s=>s.name===name)}
function setLesson(day,period,subjectName){
  let lesson=data.lessons.find(l=>l.day===day&&Number(l.period)===period);
  if(!lesson){lesson={id:Date.now()+Math.random(),day,period,subject:subjectName,teacher:""};data.lessons.push(lesson)}
  else {lesson.subject=subjectName;lesson.teacher=lesson.teacher||""}
  save();
}
function assignTeacher(day,period,teacher){
  const lesson=data.lessons.find(l=>l.day===day&&Number(l.period)===period);
  if(!lesson){alert("Trage zuerst ein Fach in diese Stunde ein.");return}
  lesson.teacher=teacher;save();
}
function deleteLesson(id){
  if(confirm("Möchtest du diese Stunde wirklich löschen?")){data.lessons=data.lessons.filter(l=>String(l.id)!==String(id));save()}
}
function slotLongPressStart(id){
  longPressTriggered=false;
  clearTimeout(longPressTimer);
  longPressTimer=setTimeout(()=>{longPressTriggered=true;deleteLesson(id)},620);
}
function slotLongPressEnd(){clearTimeout(longPressTimer)}

function render(){
  document.body.classList.toggle("light",data.theme==="light");
  document.getElementById("themeToggle").innerHTML=data.theme==="light"?"🌙 <span>Dunkel</span>":"☀️ <span>Hell</span>";
  const p=data.profile,name=p.first||"du";
  document.getElementById("welcomeName").textContent=name;
  document.getElementById("sideName").textContent=p.first?`${p.first} ${p.last||""}`:"Noch kein Profil";
  document.getElementById("sideClass").textContent=p.klass?`${p.school||"Schule"} · ${p.klass}`:"Demo-Modus";
  document.getElementById("sideAvatar").textContent=(p.first||"?")[0].toUpperCase();
  document.getElementById("dateText").textContent=new Intl.DateTimeFormat("de-DE",{day:"2-digit",month:"short"}).format(new Date());
  document.getElementById("todayLabel").textContent=new Intl.DateTimeFormat("de-DE",{weekday:"long"}).format(new Date()).toUpperCase();
  document.getElementById("gradeCount").textContent=data.grades.length;
  document.getElementById("subjectCount").textContent=new Set(data.lessons.map(x=>x.subject)).size;
  const avg=data.grades.length?(data.grades.reduce((a,x)=>a+x.grade,0)/data.grades.length).toFixed(2).replace(".",","):"—";
  document.getElementById("average").textContent=avg;document.getElementById("gradeTotal").textContent=`${data.grades.length} Einträge`;
  document.getElementById("gradeRows").innerHTML=data.grades.length?data.grades.map(x=>`<tr><td>${esc(x.subject)}</td><td><span class="grade-badge">${x.grade}</span></td><td>${esc(x.type)}</td><td><button class="delete-button" data-remove="grades" data-id="${x.id}">Löschen</button></td></tr>`).join(""):'<tr><td colspan="4" class="table-empty">Noch keine Noten vorhanden.</td></tr>';
  const todayKey=new Date().toISOString().slice(0,10);
  const upcoming=[...data.exams].filter(x=>x.date>=todayKey).sort((a,b)=>a.date.localeCompare(b.date));
  document.getElementById("nextExam").textContent=upcoming[0]?new Date(upcoming[0].date+"T12:00:00").toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"}):"—";
  const today=days[(new Date().getDay()+6)%7],todayLessons=data.lessons.filter(x=>x.day===today).sort((a,b)=>a.period-b.period);
  document.getElementById("todaySchedule").innerHTML=todayLessons.length?todayLessons.map(lessonHtml).join(""):'<div class="empty-state">Für heute ist noch nichts eingetragen.</div>';
  document.getElementById("upcomingList").innerHTML=upcoming.length?upcoming.slice(0,3).map(x=>`<div class="list-row"><div><strong>${esc(x.title)}</strong><small>${esc(x.type)}</small></div><span class="date-chip">${new Date(x.date+"T12:00:00").toLocaleDateString("de-DE",{day:"2-digit",month:"short"})}</span></div>`).join(""):'<div class="empty-state">Noch keine Proben oder Termine eingetragen.</div>';
  renderTimetable();
  document.getElementById("materialList").innerHTML=data.materials.length?data.materials.map(x=>`<article class="material-card"><h3>${esc(x.subject)}</h3><p>${esc(x.items)}</p><button class="delete-button" data-remove="materials" data-id="${x.id}">Löschen</button></article>`).join(""):'<div class="empty-state">Noch keine Materialien eingetragen.</div>';
  document.getElementById("examList").className=data.exams.length?"list-stack":"list-stack empty-state";
  document.getElementById("examList").innerHTML=data.exams.length?[...data.exams].sort((a,b)=>a.date.localeCompare(b.date)).map(x=>`<div class="list-row"><div><strong>${esc(x.title)}</strong><small>${esc(x.type)}</small></div><span class="date-chip">${new Date(x.date+"T12:00:00").toLocaleDateString("de-DE")}</span><button class="delete-button" data-remove="exams" data-id="${x.id}">×</button></div>`).join(""):"Noch keine Termine eingetragen.";
  ["firstName","lastName","school","className","schoolType","targetDegree"].forEach((id,i)=>{
    const keys=["first","last","school","klass","type","degree"];
    document.getElementById(id).value=p[keys[i]]||(["Mittelschule","Noch offen"][i-4]||"");
  });
  renderPrognosis();
  document.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>removeFrom(b.dataset.remove,b.dataset.id));
}

function renderTimetable(){
  const subjectSelect=document.getElementById("activeSubject");
  const currentSubject=subjectSelect.value;
  subjectSelect.innerHTML=data.subjects.map(s=>`<option value="${esc(s.name)}">${esc(s.name)}</option>`).join("")||'<option value="">Erst ein Fach anlegen</option>';
  if(data.subjects.some(s=>s.name===currentSubject))subjectSelect.value=currentSubject;
  const teacherSelect=document.getElementById("activeTeacher"),currentTeacher=teacherSelect.value;
  teacherSelect.innerHTML=data.teachers.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join("")||'<option value="">Erst eine Lehrkraft anlegen</option>';
  if(data.teachers.includes(currentTeacher))teacherSelect.value=currentTeacher;
  document.getElementById("subjectChips").innerHTML=data.subjects.length?data.subjects.map(s=>`<div class="subject-chip"><span class="subject-swatch" style="background:${esc(s.color)}"></span><span><strong>${esc(s.name)}</strong><small>${esc(s.short||"")}</small></span><button type="button" data-edit-subject="${s.id}" aria-label="Fach bearbeiten">✎</button></div>`).join(""):'<p class="muted small-note">Lege zuerst deine Fächer an. Name, Kürzel und Farbe kannst du selbst bestimmen.</p>';
  document.querySelectorAll("[data-edit-subject]").forEach(b=>b.onclick=()=>editSubject(b.dataset.editSubject));
  const grid=document.getElementById("timetableGrid");
  const dayShort=["Mo","Di","Mi","Do","Fr"];
  grid.innerHTML=`<div class="tt-corner"></div>${dayShort.map(d=>`<div class="tt-day">${d}</div>`).join("")}`+
    periods.map(period=>`<div class="tt-period">${period}</div>`+days.map(day=>{
      const l=data.lessons.find(x=>x.day===day&&Number(x.period)===period),sub=l&&getSubject(l.subject);
      const label=l?(sub?(sub.short||sub.name):l.subject):"";
      const style=sub?`--subject-color:${esc(sub.color)}`:"";
      return `<button type="button" class="tt-slot ${l?"filled":""}" style="${style}" data-slot-day="${day}" data-slot-period="${period}" ${l?`data-slot-id="${l.id}"`:""} aria-label="${day}, ${period}. Stunde${l?", "+esc(l.subject):", frei"}">
        ${l?`<strong>${esc(label)}</strong>${l.teacher?`<small>${esc(l.teacher)}</small>`:""}`:`<span>＋</span>`}
      </button>`;
    }).join("")).join("");
  grid.querySelectorAll("[data-slot-day]").forEach(btn=>{
    const day=btn.dataset.slotDay,period=Number(btn.dataset.slotPeriod),id=btn.dataset.slotId;
    btn.addEventListener("click",()=>{
      if(longPressTriggered){longPressTriggered=false;return}
      if(timetableMode==="subject"){
        const subject=document.getElementById("activeSubject").value;
        if(!subject){alert("Lege zuerst ein Fach an.");return}
        setLesson(day,period,subject);
      }else{
        const teacher=document.getElementById("activeTeacher").value;
        if(!teacher){alert("Lege zuerst eine Lehrkraft an.");return}
        assignTeacher(day,period,teacher);
      }
    });
    if(id){
      btn.addEventListener("pointerdown",()=>slotLongPressStart(id));
      ["pointerup","pointerleave","pointercancel"].forEach(ev=>btn.addEventListener(ev,slotLongPressEnd));
      btn.addEventListener("contextmenu",e=>{e.preventDefault();deleteLesson(id)});
    }
  });
}
function editSubject(id){
  const s=data.subjects.find(x=>String(x.id)===String(id));if(!s)return;
  const name=prompt("Fachname:",s.name);if(name===null)return;
  const clean=name.trim();if(!clean)return alert("Der Fachname darf nicht leer sein.");
  const short=prompt("Kürzel:",s.short||clean.slice(0,3).toUpperCase());if(short===null)return;
  const color=prompt("Farbcode (z. B. #3977b5):",s.color);if(color===null)return;
  if(!/^#[0-9a-fA-F]{6}$/.test(color.trim()))return alert("Bitte einen gültigen Farbcode wie #3977b5 eingeben.");
  const old=s.name;s.name=clean;s.short=short.trim()||clean.slice(0,3).toUpperCase();s.color=color.trim();
  data.lessons.forEach(l=>{if(l.subject===old)l.subject=clean});
  data.grades.forEach(g=>{if(g.subject===old)g.subject=clean});
  data.materials.forEach(m=>{if(m.subject===old)m.subject=clean});
  save();
}

function renderPrognosis(){
 const box=document.getElementById("prognosisContent");if(!box)return;
 const p=data.profile||{};
 if(!p.type||!p.degree||p.degree==="Noch offen"){box.innerHTML='<div class="prognosis-indicator info">i</div><div class="prognosis-copy"><strong>Profil vervollständigen</strong><p>Wähle unter „Profil“ deine Schulart und deinen gewünschten Abschluss.</p></div>';return}
 if(!data.grades.length){box.innerHTML='<div class="prognosis-indicator info">✎</div><div class="prognosis-copy"><strong>Noch keine Noten vorhanden</strong><p>Trage erst ein paar aktuelle Noten ein.</p></div>';return}
 const avg=data.grades.reduce((n,x)=>n+x.grade,0)/data.grades.length,above4=data.grades.filter(x=>x.grade>4).length;
 let status,cls,icon,detail;
 if(p.type==="Mittelschule"&&p.degree.toLowerCase().includes("qualifiz")){
   if(avg<=2.7){status="Gute erste Ausgangslage";cls="good";icon="✓";detail="Dein Schnitt ist ein positives Signal. Für den Quali zählen zusätzlich festgelegte Prüfungsfächer, Jahresfortgangsnoten und die Projektprüfung."}
   else if(avg<=3.4){status="Es könnte knapp werden";cls="mid";icon="!";detail="Behalte besonders schwächere Fächer im Blick. Der einfache Schnitt ist nicht die offizielle Quali-Berechnung."}
   else{status="Hier lohnt sich gezieltes Üben";cls="low";icon="↗";detail="Einige Fächer könnten mehr Aufmerksamkeit brauchen. Die offizielle Quali-Bewertung berücksichtigt weitere Bestandteile."}
 }else if(p.type==="Mittelschule"&&p.degree.toLowerCase().includes("erfolgreich")){
   if(avg<=3.7&&above4<=2){status="Gute erste Ausgangslage";cls="good";icon="✓";detail="Deine bisherigen Noten sehen als grobe Tendenz ordentlich aus. Maßgeblich sind die Vorrückungsfächer und die Regeln der Jahrgangsstufe."}
   else if(avg<=4.2){status="Ein paar Fächer im Blick behalten";cls="mid";icon="!";detail="Einige Noten könnten den Schnitt belasten. Mit den bisherigen Einträgen ist keine vollständige Prüfung möglich."}
   else{status="Verbesserungsbedarf erkennbar";cls="low";icon="↗";detail="Gezieltes Üben könnte helfen. Die offizielle Regel berücksichtigt alle relevanten Vorrückungsfächer."}
 }else{
   if(avg<=2.7){status="Deine Noten-Tendenz sieht gut aus";cls="good";icon="✓";detail=`Dein einfacher Durchschnitt ist erfreulich. Für ${p.degree} an der ${p.type} gelten zusätzliche Regeln und Prüfungsleistungen.`}
   else if(avg<=3.7){status="Deine Tendenz ist im mittleren Bereich";cls="mid";icon="!";detail="Dein Durchschnitt gibt eine grobe Orientierung. Zeugnisnoten allein reichen nicht für eine verlässliche Prognose."}
   else{status="Einige Noten solltest du im Blick behalten";cls="low";icon="↗";detail="Einige Noten könnten Aufmerksamkeit brauchen. Für den Abschluss gelten zusätzliche Prüfungs- und Versetzungsregeln."}
 }
 box.innerHTML=`<div class="prognosis-indicator ${cls}">${icon}</div><div class="prognosis-copy"><strong>${status}</strong><p>Ziel: ${esc(p.degree)} · ${esc(p.type)} in Bayern<br>Einfacher Schnitt aus ${data.grades.length} Noten: <b>${avg.toFixed(2).replace(".",",")}</b></p><p>${detail}</p><small>Grobe Orientierung, keine Garantie oder amtliche Prognose.</small></div>`;
}
function lessonHtml(x){const s=getSubject(x.subject);return `<div class="list-row"><div><strong>${x.period}. Stunde · ${esc(x.subject)}</strong><small>${esc(x.teacher||"Keine Lehrkraft zugeordnet")}</small></div></div>`}

document.getElementById("chatForm").addEventListener("submit",async e=>{
  e.preventDefault();const input=document.getElementById("chatInput"),q=input.value.trim();if(!q)return;
  addChat(q,"user");input.value="";addChat("Einen Moment …","bot","pending");
  const pending=document.querySelector(".chat-message.pending");
  const answer=await answerQuestion(q);
  if(pending){pending.textContent=answer;pending.classList.remove("pending")}
});
document.querySelectorAll("[data-question]").forEach(b=>b.addEventListener("click",()=>{document.getElementById("chatInput").value=b.dataset.question;document.getElementById("chatForm").requestSubmit()}));
function addChat(text,kind,extraClass=""){const box=document.getElementById("chatLog"),div=document.createElement("div");div.className="chat-message "+kind+(extraClass?" "+extraClass:"");div.textContent=text;box.appendChild(div);box.scrollTop=box.scrollHeight}
function normalized(s){return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[?!.,;:]/g," ").replace(/\s+/g," ").trim()}
function includesAny(s,words){return words.some(w=>s.includes(w))}
function scheduleAnswer(day){
 const ls=data.lessons.filter(x=>x.day===day).sort((a,b)=>a.period-b.period);
 return ls.length?`${day} hast du ${ls.map(x=>`${x.period}. Stunde ${x.subject}${x.teacher?", bei "+x.teacher:""}`).join("; ")}.`:`Für ${day} ist noch kein Unterricht eingetragen.`;
}
async function weatherAnswer(){
  return new Promise(resolve=>{
    if(!navigator.geolocation){resolve("Dein Browser unterstützt keine Standortabfrage. Ich kann das Wetter deshalb gerade nicht automatisch abrufen.");return}
    navigator.geolocation.getCurrentPosition(async pos=>{
      try{
        const {latitude,longitude}=pos.coords;
        const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,precipitation,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto`);
        if(!r.ok)throw new Error("Wetterdienst nicht erreichbar");
        const j=await r.json(),c=j.current,d=j.daily;
        resolve(`Aktuell sind es ${Math.round(c.temperature_2m)} °C (gefühlt ${Math.round(c.apparent_temperature)} °C). ${weatherLabel(c.weather_code)}. Heute werden ${Math.round(d.temperature_2m_min[0])} bis ${Math.round(d.temperature_2m_max[0])} °C erwartet; Regenwahrscheinlichkeit maximal ${d.precipitation_probability_max[0]} %.`);
      }catch{resolve("Ich konnte den Wetterdienst gerade nicht erreichen. Versuch es später noch einmal.")}
    },()=>resolve("Standortzugriff wurde nicht erlaubt. Erlaube Safari den Standortzugriff, damit ich das Wetter für deinen Ort abrufen kann."),{timeout:10000,maximumAge:600000});
  });
}
function weatherLabel(code){
 if(code===0)return"Der Himmel ist klar";if([1,2,3].includes(code))return"Es ist leicht bis stark bewölkt";if([45,48].includes(code))return"Es ist neblig";if([51,53,55,56,57].includes(code))return"Es gibt Nieselregen";if([61,63,65,66,67,80,81,82].includes(code))return"Es regnet";if([71,73,75,77,85,86].includes(code))return"Es schneit";if([95,96,99].includes(code))return"Es gibt Gewitter";return"Die Wetterlage ist wechselhaft";
}
async function answerQuestion(q){
 const s=normalized(q),now=new Date(),today=days[(now.getDay()+6)%7],tomorrow=days[(now.getDay())%7];
 if(includesAny(s,["wetter","regnet","regen","temperatur","warm","kalt","sonnig","schneit"]))return await weatherAnswer();
 if(includesAny(s,["uhr","uhrzeit","wie spat","zeit","wie viel uhr"]))return `Es ist gerade ${new Intl.DateTimeFormat("de-DE",{hour:"2-digit",minute:"2-digit"}).format(now)} Uhr.`;
 if(includesAny(s,["morgen","am morgigen"]))return scheduleAnswer(tomorrow);
 if(includesAny(s,["heute","stundenplan","unterricht","schule","facher","faecher","was hab","was steht an","was kommt dran"])){
   if(includesAny(s,["lehrer","lehrkraft"]))return teacherAnswer(today);
   return scheduleAnswer(today);
 }
 if(includesAny(s,["not","schnitt","durchschnitt","bewertung","notenstand","stehe ich","wie stehe","zeugnis"])){
   if(!data.grades.length)return "Du hast noch keine Noten eingetragen. Sobald du ein paar Noten speicherst, kann ich dir deinen Schnitt und deine stärkeren bzw. schwächeren Fächer nennen.";
   const avg=data.grades.reduce((n,x)=>n+x.grade,0)/data.grades.length;
   const by={};data.grades.forEach(g=>(by[g.subject]??=[]).push(g.grade));
   const subjectAvgs=Object.entries(by).map(([subject,grades])=>({subject,avg:grades.reduce((a,b)=>a+b,0)/grades.length})).sort((a,b)=>a.avg-b.avg);
   const best=subjectAvgs[0],weak=subjectAvgs[subjectAvgs.length-1];
   let answer=`Du hast ${data.grades.length} Noten in ${subjectAvgs.length} Fächern eingetragen. Dein einfacher Gesamtschnitt liegt bei ${avg.toFixed(2).replace(".",",")}. `;
   if(best)answer+=`Am besten stehst du bisher in ${best.subject} (${best.avg.toFixed(2).replace(".",",")}), `;
   if(weak&&weak.subject!==best?.subject)answer+=`und am meisten Luft nach oben ist in ${weak.subject} (${weak.avg.toFixed(2).replace(".",",")}). `;
   answer+="Das ist nur der Durchschnitt deiner gespeicherten Einträge, kein offizieller Zeugnisdurchschnitt.";
   if(includesAny(s,["abschluss","schaff","qual","abitur","realschulabschluss"]))answer+=" "+document.getElementById("prognosisContent").innerText;
   return answer;
 }
 if(includesAny(s,["probe","termin","test","schulaufgabe","stegreif","ex "])) {
   const es=[...data.exams].filter(x=>x.date>=now.toISOString().slice(0,10)).sort((a,b)=>a.date.localeCompare(b.date));
   return es.length?`Dein nächster Termin ist ${es[0].title} am ${new Date(es[0].date+"T12:00:00").toLocaleDateString("de-DE")} (${es[0].type}). Insgesamt hast du ${es.length} kommende Termine eingetragen.`:"Du hast aktuell keine kommenden Proben oder Termine eingetragen.";
 }
 if(includesAny(s,["lehrer","lehrkraft"]))return teacherAnswer(today);
 if(includesAny(s,["fach","stundenplan"]))return scheduleAnswer(today);
 if(includesAny(s,["material","mitbringen","brauch ich"])) {
   const mats=data.materials;if(!mats.length)return"Du hast noch keine Materialien hinterlegt.";
   return "Eingetragene Materialien: "+mats.map(m=>`${m.subject}: ${m.items}`).join("; ")+".";
 }
 if(includesAny(s,["hilfe","was kannst du","was kannst"]))return "Ich kann deinen Stundenplan für heute oder morgen, deine Noten und Fachschnitte, Lehrer, Materialien, kommende Proben, die Uhrzeit und das aktuelle Wetter abfragen. Frag einfach frei heraus!";
 return "Ich bin gerade der Schulplaner-Assistent und kann deine eingetragenen Schuldaten sowie Uhrzeit und Wetter auswerten. Bei allgemeinen offenen Fragen kann ich ohne echte externe KI noch nicht zuverlässig frei antworten. Versuch gern, deine Frage anders zu formulieren oder frag mich nach Noten, Stundenplan, Lehrern, Materialien, Proben, Uhrzeit oder Wetter.";
}
function teacherAnswer(day){
 const ls=data.lessons.filter(x=>x.day===day&&x.teacher).sort((a,b)=>a.period-b.period);
 return ls.length?`${day} hast du folgende Lehrkräfte eingetragen: ${ls.map(x=>`${x.subject}: ${x.teacher}`).join("; ")}.`:`Für ${day} sind noch keine Lehrkräfte im Stundenplan zugeordnet.`;
}
render();
initSupabase();
