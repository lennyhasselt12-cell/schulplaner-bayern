const KEY = "schulplaner-preview-v1";
const ACTIVE_USER_KEY = KEY + "-active-user";
// Supabase-Projektdaten hier eintragen (Projekt-URL + Publishable Key, niemals Service-Role-Key).
const SUPABASE_URL = "https://wygkjvofgelfttdfjfcl.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_3jRUceLgBkmqgw0azhSUoA_yZEick5a";
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
let subjectLongPressTimer = null;
let teacherLongPressTimer = null;
let teacherLongPressTriggered = false;

function emptyData(){
  return {profile:{},grades:[],lessons:[],materials:[],exams:[],theme:"dark",subjects:[],teachers:[],studyNotes:{}};
}
function loadData(){
  try {
    const d = JSON.parse(localStorage.getItem(KEY)) || {};
    return {
      profile:d.profile||{}, grades:d.grades||[], lessons:d.lessons||[], materials:d.materials||[],
      exams:d.exams||[], theme:d.theme||"dark", subjects:d.subjects||[], teachers:d.teachers||[], studyNotes:d.studyNotes||{}
    };
  } catch {
    return emptyData();
  }
}
function save(){
  localStorage.setItem(KEY,JSON.stringify(data));
  render();
  if(currentUser && cloudReady) scheduleCloudSave();
}
function scheduleCloudSave(){
  clearTimeout(cloudSaveTimer);
  const savingUserId=currentUser?.id;
  const snapshot=JSON.parse(JSON.stringify(data));
  cloudSaveTimer=setTimeout(async()=>{
    if(!savingUserId || !currentUser || currentUser.id!==savingUserId || !cloudReady) return;
    try{
      const {error}=await supabaseClient.from("user_settings").upsert({user_id:savingUserId,settings:{app_data:snapshot},updated_at:new Date().toISOString()},{onConflict:"user_id"});
      if(error) throw error;
      if(currentUser?.id===savingUserId) setAuthStatus("Online gespeichert ✓");
    }catch(err){console.error(err);if(currentUser?.id===savingUserId)setAuthStatus("Online-Speicherung fehlgeschlagen: "+(err.message||"Unbekannter Fehler"));}
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
  document.getElementById("signUpButton").disabled=signedIn;
  if(signedIn)hideOtpPanel();
  if(signedIn)setAuthStatus("Angemeldet als "+currentUser.email+". Deine Daten werden online gespeichert.");
}
async function loadCloudData(){
  if(!currentUser)return;
  const loadingUserId=currentUser.id;
  cloudReady=false;
  clearTimeout(cloudSaveTimer);
  setAuthStatus("Lade deine gespeicherten Daten …");
  const {data:row,error}=await supabaseClient.from("user_settings").select("settings").eq("user_id",loadingUserId).maybeSingle();
  if(error)throw error;
  // Ein zwischenzeitlicher Kontowechsel darf niemals Daten des alten Kontos überschreiben.
  if(!currentUser || currentUser.id!==loadingUserId)return;
  if(row?.settings?.app_data){
    const remote=row.settings.app_data;
    data={profile:remote.profile||{},grades:remote.grades||[],lessons:remote.lessons||[],materials:remote.materials||[],exams:remote.exams||[],theme:remote.theme||"dark",subjects:remote.subjects||[],teachers:remote.teachers||[],studyNotes:remote.studyNotes||{}};
    setAuthStatus("Deine Online-Daten wurden geladen ✓");
  }else{
    // Nur beim allerersten Konto auf diesem Gerät werden vorhandene Gastdaten übernommen.
    // Bei einem anderen/neuen Konto wird mit einem leeren Datensatz begonnen.
    const previousUserId=localStorage.getItem(ACTIVE_USER_KEY);
    if(previousUserId && previousUserId!==loadingUserId) data=emptyData();
    const {error:insertError}=await supabaseClient.from("user_settings").upsert(
      {user_id:loadingUserId,settings:{app_data:data},updated_at:new Date().toISOString()},
      {onConflict:"user_id"}
    );
    if(insertError) throw insertError;
    if(!currentUser || currentUser.id!==loadingUserId)return;
    setAuthStatus(previousUserId && previousUserId!==loadingUserId
      ? "Neues Konto verbunden. Ein eigener leerer Datensatz wurde angelegt ✓"
      : "Konto verbunden. Deine bisherigen Gerätedaten wurden erstmals online gespeichert ✓");
  }
  if(!currentUser || currentUser.id!==loadingUserId)return;
  localStorage.setItem(KEY,JSON.stringify(data));
  localStorage.setItem(ACTIVE_USER_KEY,loadingUserId);
  render();
  cloudReady=true;
}
async function initSupabase(){
  if(!window.supabase?.createClient){setAuthStatus("Supabase-Bibliothek konnte nicht geladen werden. Prüfe deine Internetverbindung.");return;}
  if(SUPABASE_PUBLISHABLE_KEY.startsWith("HIER_DEIN_")){setAuthStatus("Supabase-Schlüssel fehlt noch.");return;}
  try{
    supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
    const {data:sessionData,error}=await supabaseClient.auth.getSession();
    if(error) throw error;
    currentUser=sessionData.session?.user||null;
    coachLoadConversation();
    updateAuthUI();
    if(currentUser){try{await loadCloudData()}catch(e){cloudReady=false;setAuthStatus("Laden fehlgeschlagen: "+e.message)}}
    supabaseClient.auth.onAuthStateChange(async(_event,session)=>{
      clearTimeout(cloudSaveTimer);cloudReady=false;
      currentUser=session?.user||null;
      coachLoadConversation();
      updateAuthUI();
      if(currentUser){try{await loadCloudData()}catch(e){cloudReady=false;setAuthStatus("Laden fehlgeschlagen: "+e.message)}}
      else {
        coachConversation=[];
        const coachPanel=document.getElementById("coachExplanationPanel");
        if(coachPanel) coachPanel.hidden=true;
        data=emptyData();
        localStorage.setItem(KEY,JSON.stringify(data));
        render();
        setAuthStatus("Abgemeldet. Deine persönlichen Cloud-Daten bleiben in deinem Konto gespeichert.");
      }
    });
  }catch(e){
    supabaseClient=null;
    setAuthStatus("Supabase konnte nicht gestartet werden: "+(e.message||"Bitte Projekt-URL und Publishable Key prüfen."));
  }
}
const TURNSTILE_SITE_KEY="0x4AAAAAAGHkPNIOQrAuJshW";
let turnstileWidgetId=null;
let turnstileToken="";
let turnstileLoadPromise=null;
function loadTurnstile(){
  if(window.turnstile)return Promise.resolve();
  if(!turnstileLoadPromise){
    turnstileLoadPromise=new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async=true;script.defer=true;
      script.onload=resolve;script.onerror=()=>reject(new Error("Der Sicherheitscheck konnte nicht geladen werden."));
      document.head.appendChild(script);
    });
  }
  return turnstileLoadPromise;
}
async function initTurnstile(){
  try{
    await loadTurnstile();
    if(turnstileWidgetId!==null||!document.getElementById("turnstileWidget"))return;
    turnstileWidgetId=window.turnstile.render("#turnstileWidget",{
      sitekey:TURNSTILE_SITE_KEY,
      theme:"auto",
      callback:(token)=>{turnstileToken=token;},
      "expired-callback":()=>{turnstileToken="";},
      "error-callback":()=>{turnstileToken="";setAuthStatus("Sicherheitscheck fehlgeschlagen. Bitte lade die Seite neu.");}
    });
  }catch(error){setAuthStatus(error.message||"Sicherheitscheck konnte nicht geladen werden.");}
}
function resetTurnstile(){
  turnstileToken="";
  if(window.turnstile&&turnstileWidgetId!==null)window.turnstile.reset(turnstileWidgetId);
}
let pendingOtpEmail="";
function emailLimitKey(email){return String(email||"").trim().toLowerCase()}
function showAuthToast(message){
  const toast=document.getElementById("authToast");
  if(!toast)return;
  toast.textContent=message;toast.classList.add("show");
  clearTimeout(showAuthToast.timer);
  showAuthToast.timer=setTimeout(()=>toast.classList.remove("show"),4200);
}
function showOtpPanel(email){
  pendingOtpEmail=email;
  document.getElementById("otpPanel").hidden=false;
  document.getElementById("authEmail").readOnly=true;
  document.getElementById("authPassword").readOnly=true;
  document.getElementById("otpCode").value="";
  document.getElementById("otpCode").focus();
  document.getElementById("otpHint").textContent="Der Code ist 5 Minuten gültig. Prüfe auch deinen Spam-Ordner.";
}
function hideOtpPanel(){
  document.getElementById("otpPanel").hidden=true;
  document.getElementById("otpCode").value="";
  document.getElementById("authEmail").readOnly=false;
  document.getElementById("authPassword").readOnly=false;
  pendingOtpEmail="";
}
async function requestSignupCode(isResend=false){
  if(!supabaseClient){setAuthStatus("Supabase ist noch nicht bereit. Bitte lade die Seite neu.");return;}
  const email=emailLimitKey(document.getElementById("authEmail").value);
  const password=document.getElementById("authPassword").value;
  if(!email||!/^\S+@\S+\.\S+$/.test(email)||password.length<8){setAuthStatus("Bitte gib eine gültige E-Mail-Adresse und ein Passwort mit mindestens 8 Zeichen ein.");return;}
  if(!isResend&&pendingOtpEmail===email){
    const message="Du hast doch schon einen Code bekommen. Schau bitte in dein E-Mail-Postfach.";
    setAuthStatus(message);showAuthToast(message);return;
  }
  if(!turnstileToken){setAuthStatus("Bitte schließe zuerst den Sicherheitscheck ab.");return;}
  const captchaToken=turnstileToken;
  setAuthStatus(isResend?"Wir senden dir einen neuen Code …":"Wir erstellen dein Konto …");
  document.getElementById("signUpButton").disabled=true;
  document.getElementById("resendOtpButton").disabled=true;
  try{
    const response=await fetch("https://wygkjvofgelfttdfjfcl.supabase.co/functions/v1/signup-email-code",{
      method:"POST",
      headers:{"Content-Type":"application/json","apikey":"sb_publishable_3jRUceLgBkmqgw0azhSUoA_yZEick5a"},
      body:JSON.stringify({action:isResend?"resend":"signup",email,captchaToken,...(isResend?{}:{password})})
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok){
      const message=result.error||"Die E-Mail konnte nicht gesendet werden.";
      setAuthStatus(message);showAuthToast(message);
      return;
    }
    const attempt=Number(result.attempt||1);
    showOtpPanel(email);
    const message=attempt===1
      ?"Wir haben dir eine E-Mail mit deinem Code geschickt."
      :"Wir haben dir erneut eine E-Mail mit einem neuen Code geschickt. Danach ist eine Stunde Pause.";
    setAuthStatus(message);showAuthToast(message);
    document.getElementById("otpHint").textContent=attempt===1
      ?"Der Code ist 5 Minuten gültig. Eine zweite E-Mail kannst du nach 5 Minuten anfordern."
      :"Der neue Code ist 5 Minuten gültig. Eine weitere E-Mail ist erst in einer Stunde möglich.";
  }catch(e){
    setAuthStatus("Verbindungsfehler: "+(e.message||"Bitte Internetverbindung prüfen."));
  }finally{
    resetTurnstile();
    document.getElementById("signUpButton").disabled=false;
    document.getElementById("resendOtpButton").disabled=false;
  }
}
async function verifySignupCode(){
  const email=pendingOtpEmail||emailLimitKey(document.getElementById("authEmail").value);
  const token=document.getElementById("otpCode").value.trim();
  if(!/^\d{8}$/.test(token)){setAuthStatus("Bitte gib den achtstelligen Code ein.");return;}
  setAuthStatus("Code wird geprüft …");
  document.getElementById("verifyOtpButton").disabled=true;
  try{
    const {data:result,error}=await supabaseClient.auth.verifyOtp({email,token,type:"signup"});
    if(error){setAuthStatus("Der Code ist ungültig oder abgelaufen: "+error.message);return;}
    if(result.user){
      currentUser=result.user;
      hideOtpPanel();
      updateAuthUI();
      showAuthToast("E-Mail bestätigt – du bist jetzt angemeldet!");
      try{await loadCloudData();go("profile");}
      catch(e){cloudReady=false;setAuthStatus("Angemeldet, aber Cloud-Speicherung fehlgeschlagen: "+e.message);}
    }
  }catch(e){setAuthStatus("Code konnte nicht geprüft werden: "+(e.message||"Bitte erneut versuchen."));}
  finally{document.getElementById("verifyOtpButton").disabled=false;}
}
async function signInOrUp(mode){
  if(mode==="signup"){await requestSignupCode(false);return;}
  if(!supabaseClient){setAuthStatus("Supabase ist noch nicht konfiguriert. Bitte prüfe den Publishable Key.");return;}
  const email=document.getElementById("authEmail").value.trim(),password=document.getElementById("authPassword").value;
  if(!email||password.length<8){setAuthStatus("Bitte E-Mail und ein Passwort mit mindestens 8 Zeichen eingeben.");return;}
  setAuthStatus("Einen Moment …");
  try{
    const result=await supabaseClient.auth.signInWithPassword({email,password});
    if(result.error){setAuthStatus("Anmeldung fehlgeschlagen: "+result.error.message);return;}
    if(result.data.user){
      currentUser=result.data.user;updateAuthUI();
      try{await loadCloudData()}catch(e){cloudReady=false;setAuthStatus("Konto angemeldet, aber Cloud-Speicherung fehlgeschlagen: "+e.message)}
    }
  }catch(e){setAuthStatus("Verbindungsfehler: "+(e.message||"Bitte Internetverbindung prüfen und erneut versuchen."));}
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
document.getElementById("verifyOtpButton").onclick=verifySignupCode;
document.getElementById("resendOtpButton").onclick=()=>requestSignupCode(true);
document.getElementById("otpCode").addEventListener("input",e=>{e.target.value=e.target.value.replace(/\D/g,"").slice(0,8)});
document.getElementById("signOutButton").onclick=async()=>{
  clearTimeout(cloudSaveTimer);
  cloudReady=false;
  if(supabaseClient) await supabaseClient.auth.signOut();
  currentUser=null;
  data=emptyData();
  localStorage.setItem(KEY,JSON.stringify(data));
  updateAuthUI();
  render();
  setAuthStatus("Abgemeldet. Deine persönlichen Cloud-Daten bleiben in deinem Konto gespeichert.");
};
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
document.getElementById("clearTimetableButton").addEventListener("click",()=>{
  if(!data.lessons.length){
    alert("Dein Stundenplan ist bereits leer.");
    return;
  }
  if(confirm("Möchtest du wirklich alle eingetragenen Stunden löschen? Deine Fächer und Lehrkräfte bleiben erhalten.")){
    data.lessons=[];
    save();
  }
});

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
  else if(data.teachers.length)teacherSelect.value=data.teachers[0];
  const teacherChips=document.getElementById("teacherChips");
  teacherChips.innerHTML=data.teachers.length?data.teachers.map(t=>`<button type="button" class="teacher-chip ${t===teacherSelect.value?"active":""}" data-teacher-name="${esc(t)}" title="Antippen zum Auswählen, gedrückt halten zum Löschen">${esc(t)}</button>`).join(""):'<p class="muted small-note">Füge zuerst eine Lehrkraft hinzu.</p>';
  teacherChips.querySelectorAll("[data-teacher-name]").forEach(chip=>{
    const name=chip.dataset.teacherName;
    chip.addEventListener("click",()=>{
      if(teacherLongPressTriggered){teacherLongPressTriggered=false;return}
      teacherSelect.value=name;
      teacherChips.querySelectorAll(".teacher-chip").forEach(item=>item.classList.toggle("active",item===chip));
    });
    chip.addEventListener("pointerdown",()=>{
      teacherLongPressTriggered=false;
      clearTimeout(teacherLongPressTimer);
      teacherLongPressTimer=setTimeout(()=>{teacherLongPressTriggered=true;deleteTeacher(name)},650);
    });
    ["pointerup","pointerleave","pointercancel"].forEach(ev=>chip.addEventListener(ev,()=>clearTimeout(teacherLongPressTimer)));
    chip.addEventListener("contextmenu",e=>{e.preventDefault();teacherLongPressTriggered=true;deleteTeacher(name)});
  });
  document.getElementById("subjectChips").innerHTML=data.subjects.length?data.subjects.map(s=>`<div class="subject-chip" data-subject-id="${s.id}" title="Gedrückt halten, um das Fach zu löschen"><span class="subject-swatch" style="background:${esc(s.color)}"></span><span><strong>${esc(s.name)}</strong><small>${esc(s.short||"")}</small></span><button type="button" data-edit-subject="${s.id}" aria-label="Fach bearbeiten">✎</button></div>`).join(""):'<p class="muted small-note">Lege zuerst deine Fächer an. Name, Kürzel und Farbe kannst du selbst bestimmen.</p>';
  document.querySelectorAll("[data-edit-subject]").forEach(b=>b.onclick=()=>editSubject(b.dataset.editSubject));
  document.querySelectorAll("[data-subject-id]").forEach(chip=>{
    const id=chip.dataset.subjectId;
    chip.addEventListener("pointerdown",e=>{
      if(e.target.closest("button"))return;
      clearTimeout(subjectLongPressTimer);
      subjectLongPressTimer=setTimeout(()=>deleteSubject(id),650);
    });
    ["pointerup","pointerleave","pointercancel"].forEach(ev=>chip.addEventListener(ev,()=>clearTimeout(subjectLongPressTimer)));
    chip.addEventListener("contextmenu",e=>{
      if(e.target.closest("button"))return;
      e.preventDefault();
      deleteSubject(id);
    });
  });
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
function deleteSubject(id){
  const subject=data.subjects.find(s=>String(s.id)===String(id));
  if(!subject)return;
  const used=data.lessons.filter(l=>l.subject===subject.name).length;
  const message=used
    ? `Möchtest du das Fach „${subject.name}“ wirklich löschen? Dabei werden auch ${used} ${used===1?"Stunde":"Stunden"} dieses Fachs aus deinem Stundenplan entfernt. Deine Noten und Materialien bleiben erhalten.`
    : `Möchtest du das Fach „${subject.name}“ wirklich löschen? Deine Noten und Materialien bleiben erhalten.`;
  if(!confirm(message))return;
  data.subjects=data.subjects.filter(s=>String(s.id)!==String(id));
  data.lessons=data.lessons.filter(l=>l.subject!==subject.name);
  save();
}

function deleteTeacher(name){
  if(!data.teachers.includes(name))return;
  const used=data.lessons.filter(l=>l.teacher===name).length;
  const message=used
    ? `Möchtest du die Lehrkraft „${name}“ wirklich löschen? Die Zuordnung in ${used} ${used===1?"Stunde":"Stunden"} wird dabei entfernt.`
    : `Möchtest du die Lehrkraft „${name}“ wirklich löschen?`;
  if(!confirm(message))return;
  data.teachers=data.teachers.filter(t=>t!==name);
  data.lessons.forEach(l=>{if(l.teacher===name)l.teacher=""});
  save();
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
function findRequestedDay(s,now){
 const map={"montag":"Montag","dienstag":"Dienstag","mittwoch":"Mittwoch","donnerstag":"Donnerstag","freitag":"Freitag"};
 for(const [key,value] of Object.entries(map))if(s.includes(key))return value;
 if(s.includes("ubermorgen")||s.includes("übermorgen"))return days[(now.getDay()+1)%7];
 if(s.includes("morgen"))return days[now.getDay()%7];
 if(s.includes("heute"))return days[(now.getDay()+6)%7];
 return null;
}
function formatDate(iso){
 const d=new Date(iso+"T12:00:00");
 return d.toLocaleDateString("de-DE",{weekday:"long",day:"2-digit",month:"long"});
}
function gradeSummary(subjectName=null){
 const list=subjectName?data.grades.filter(g=>normalized(g.subject)===normalized(subjectName)):data.grades;
 if(!list.length)return subjectName?`Für ${subjectName} hast du noch keine Noten eingetragen.`:"Du hast noch keine Noten eingetragen.";
 const avg=list.reduce((sum,g)=>sum+Number(g.grade),0)/list.length;
 const breakdown={};
 list.forEach(g=>(breakdown[g.subject]??=[]).push(Number(g.grade)));
 const ranked=Object.entries(breakdown).map(([name,values])=>({name,avg:values.reduce((a,b)=>a+b,0)/values.length,count:values.length})).sort((a,b)=>a.avg-b.avg);
 let out=subjectName?`In ${subjectName} hast du ${list.length} ${list.length===1?"Note":"Noten"}. Dein einfacher Schnitt ist ${avg.toFixed(2).replace(".",",")}.`:`Du hast ${list.length} Noten aus ${ranked.length} Fächern. Dein einfacher Gesamtschnitt ist ${avg.toFixed(2).replace(".",",")}.`;
 if(!subjectName&&ranked.length>1)out+=` Am besten ist aktuell ${ranked[0].name} (${ranked[0].avg.toFixed(2).replace(".",",")}), am meisten Übungspotenzial gibt es in ${ranked[ranked.length-1].name} (${ranked[ranked.length-1].avg.toFixed(2).replace(".",",")}).`;
 out+=" Das ist ein einfacher Durchschnitt deiner gespeicherten Noten, keine offizielle Zeugnis- oder Abschlussprognose.";
 return out;
}
async function answerQuestion(q){
 const s=normalized(q),now=new Date(),today=days[(now.getDay()+6)%7],requestedDay=findRequestedDay(s,now);
 const subject=data.subjects.find(x=>s.includes(normalized(x.name)));
 const hourMatch=s.match(/(?:\b|^)(\d{1,2})\.?\s*(?:stunde|std|unterrichtsstunde)(?:\b|$)/);
 const requestedHour=hourMatch?Number(hourMatch[1]):null;

 if(includesAny(s,["hilfe","was kannst du","was kannst","funktionen","beispiele","fragen stellen"]))
   return "Ich kann deinen Schulalltag aus deinen gespeicherten Daten auslesen: Stundenplan für einzelne Tage, einzelne Stunden und Lehrkräfte; Noten und Fachschnitte; nächste Proben und Termine; Materialien; deine Fächer und Lehrkräfte sowie Uhrzeit und Wetter. Frag zum Beispiel: „Was habe ich Donnerstag in der 3. Stunde?“, „Wie ist mein Schnitt in Mathe?“ oder „Was muss ich für die nächste Probe lernen?“";

 if(includesAny(s,["wetter","regnet","regen","temperatur","warm","kalt","sonnig","schneit"]))return await weatherAnswer();
 if(includesAny(s,["uhr","uhrzeit","wie spat","zeit","wie viel uhr"]))return `Es ist gerade ${new Intl.DateTimeFormat("de-DE",{hour:"2-digit",minute:"2-digit"}).format(now)} Uhr.`;

 if(includesAny(s,["note","noten","schnitt","durchschnitt","bewertung","notenstand","zeugnis","stehe ich","wie stehe"])){
   return gradeSummary(subject?.name||null);
 }

 if(includesAny(s,["probe","termin","test","schulaufgabe","ste greif","examen","wann schreibe","wann ist"])){
   const upcoming=[...data.exams].filter(x=>x.date>=now.toISOString().slice(0,10)).sort((a,b)=>a.date.localeCompare(b.date));
   if(subject){
     const related=upcoming.filter(x=>normalized(x.title).includes(normalized(subject.name)));
     if(related.length)return `Für ${subject.name} ist als nächster Termin ${related[0].title} am ${formatDate(related[0].date)} eingetragen.`;
   }
   if(!upcoming.length)return "Du hast aktuell keine zukünftigen Proben oder Termine eingetragen.";
   return `Dein nächster Termin ist ${upcoming[0].title} am ${formatDate(upcoming[0].date)} (${upcoming[0].type}). Danach sind noch ${upcoming.length-1} weitere zukünftige Termine eingetragen.`;
 }

 if(includesAny(s,["material","mitbringen","brauch ich","einpacken","was brauche"])){
   const mats=subject?data.materials.filter(m=>normalized(m.subject)===normalized(subject.name)):data.materials;
   if(!mats.length)return subject?`Für ${subject.name} hast du noch keine Materialien hinterlegt.`:"Du hast noch keine Materialien hinterlegt.";
   return (subject?`Für ${subject.name}: `:"Deine eingetragenen Materialien: ")+mats.map(m=>`${m.subject}: ${m.items}`).join("; ")+".";
 }

 if(includesAny(s,["lehrer","lehrkraft","lehrerin","lehrerinnen"])){
   const day=requestedDay||today;
   if(subject){
     const ls=data.lessons.filter(x=>x.day===day&&normalized(x.subject)===normalized(subject.name)&&x.teacher);
     return ls.length?`${day} hast du ${subject.name} bei ${[...new Set(ls.map(x=>x.teacher))].join(", ")}.`:`Für ${subject.name} ist am ${day} keine Lehrkraft eingetragen.`;
   }
   return teacherAnswer(day);
 }

 if(requestedHour&&requestedDay){
   const lesson=data.lessons.find(x=>x.day===requestedDay&&Number(x.period)===requestedHour);
   return lesson?`${requestedDay}, ${requestedHour}. Stunde: ${lesson.subject}${lesson.teacher?", bei "+lesson.teacher:""}.`:`Am ${requestedDay} ist in der ${requestedHour}. Stunde noch nichts eingetragen.`;
 }

 if(includesAny(s,["stundenplan","unterricht","schule","was hab","was steht an","was kommt","welche facher","welche faecher","fach heute","fach morgen"])||requestedDay){
   const day=requestedDay||today;
   if(subject){
     const found=data.lessons.filter(x=>x.day===day&&normalized(x.subject)===normalized(subject.name)).sort((a,b)=>a.period-b.period);
     return found.length?`${subject.name} hast du am ${day} in der ${found.map(x=>x.period+". Stunde").join(" und ")}.`:`Am ${day} hast du ${subject.name} laut deinem Stundenplan nicht.`;
   }
   return scheduleAnswer(day);
 }

 if(subject){
   const lessons=data.lessons.filter(x=>normalized(x.subject)===normalized(subject.name));
   const marks=data.grades.filter(x=>normalized(x.subject)===normalized(subject.name));
   let answer=`${subject.name} ist in deinen Fächern gespeichert. `;
   if(lessons.length)answer+=`Es ist ${lessons.length} ${lessons.length===1?"Mal":"Mal"} im Stundenplan eingetragen. `;
   if(marks.length)answer+=gradeSummary(subject.name);
   else answer+="Du hast dazu noch keine Noten gespeichert.";
   return answer;
 }

 if(includesAny(s,["wie viele","anzahl","wieviel"])){
   if(includesAny(s,["probe","termin","test"]))return `Du hast ${data.exams.length} Termine insgesamt gespeichert.`;
   if(includesAny(s,["note"]))return `Du hast ${data.grades.length} Noten gespeichert.`;
   if(includesAny(s,["fach"]))return `Du hast ${data.subjects.length} Fächer angelegt.`;
   if(includesAny(s,["lehrer","lehrkraft"]))return `Du hast ${data.teachers.length} Lehrkräfte gespeichert.`;
   return `In deinem Schulplaner stehen ${data.subjects.length} Fächer, ${data.grades.length} Noten, ${data.exams.length} Termine und ${data.materials.length} Materialeinträge.`;
 }

 if(includesAny(s,["profil","klasse","schule","schulart","abschluss"])){
   const p=data.profile||{};
   return `In deinem Profil ist ${p.school||"noch keine Schule"}${p.klass?", Klasse "+p.klass:""}${p.type?", Schulart "+p.type:""}${p.degree?", Ziel "+p.degree:""} eingetragen.`;
 }

 return "Ich habe deine Frage noch nicht ganz verstanden. Du kannst mich zum Beispiel fragen: „Was habe ich morgen?“, „Was habe ich am Freitag in der 2. Stunde?“, „Wie ist mein Mathe-Schnitt?“, „Wann ist meine nächste Probe?“ oder „Was muss ich für Englisch mitbringen?“";
}
function teacherAnswer(day){
 const ls=data.lessons.filter(x=>x.day===day&&x.teacher).sort((a,b)=>a.period-b.period);
 return ls.length?`${day} hast du folgende Lehrkräfte eingetragen: ${ls.map(x=>`${x.subject}: ${x.teacher}`).join("; ")}.`:`Für ${day} sind noch keine Lehrkräfte im Stundenplan zugeordnet.`;
}

// Lerncoach: arbeitet mit gespeicherten eigenen Notizen und einer kleinen Wissensbasis.
let coachQuestions=[];
let coachQuestionIndex=0;
const COACH_MODE_KEY="schulplaner-coach-mode";
const coachModeDescriptions={standard:"Ich beantworte allgemeine und schulische Fragen vielseitig.",school:"Ich erkläre Schulstoff passend zu deiner Klassenstufe und orientiere mich an deinen Notizen.",general:"Ich konzentriere mich auf Allgemeinwissen wie Technik, Computer, Wissenschaft, Geschichte, Natur und Alltag.",personal:"Nutze alle übermittelten gespeicherten Lernzettel und Notizen. Suche darin gezielt nach passenden Informationen, nenne bei Bedarf das Thema der jeweiligen Notiz und erfinde keine Inhalte, die dort nicht stehen.",learning:"Ich helfe dir aktiv mit Erklärungen, Beispielen, Übungen und Quizfragen.",chat:"Wir können frei über Themen sprechen, Ideen sammeln und ganz normal chatten."};
function coachSetMode(mode){
  const select=document.getElementById("coachMode");
  const valid=Object.prototype.hasOwnProperty.call(coachModeDescriptions,mode)?mode:"standard";
  select.value=valid;
  localStorage.setItem(COACH_MODE_KEY,valid);
  document.getElementById("coachModeDescription").textContent=coachModeDescriptions[valid];
}

let coachLevel=1;
let coachCorrect=0;
let coachAnswered=false;
const coachKnowledge={
  "prozentrechnung":[
    {q:"Was beschreibt der Grundwert?",a:"Das Ganze, auf das sich die Prozentangabe bezieht.",wrong:["Den Anteil vom Ganzen","Die Zahl der Prozentpunkte","Die Veränderung pro Zeiteinheit"],why:"Der Grundwert ist das Ganze und entspricht 100 %."},
    {q:"Wie berechnet man den Prozentwert?",a:"Grundwert × Prozentsatz ÷ 100",wrong:["Grundwert ÷ Prozentsatz × 100","Prozentsatz ÷ Grundwert × 100","Grundwert + Prozentsatz"],why:"Der Prozentwert ist der Anteil: G · p / 100."},
    {q:"Ein Pullover kostet 80 €. Der Rabatt beträgt 25 %. Wie hoch ist der Rabatt?",a:"20 €",wrong:["15 €","25 €","60 €"],why:"80 · 25 / 100 = 20 €. Der Rabatt beträgt 20 €."},
    {q:"Ein Preis steigt von 50 € auf 60 €. Wie groß ist die prozentuale Erhöhung?",a:"20 %",wrong:["10 %","15 %","25 %"],why:"Die Erhöhung beträgt 10 €. Bezogen auf 50 € sind das 10 / 50 · 100 = 20 %."}
  ],
  "brueche":[
    {q:"Was ist der Nenner eines Bruchs?",a:"Er gibt an, in wie viele gleich große Teile das Ganze geteilt ist.",wrong:["Er gibt an, wie viele Teile genommen werden","Er ist immer größer als der Zähler","Er zeigt den Wert als Prozentzahl"],why:"Der Nenner steht unten und beschreibt die Anzahl gleich großer Teile."},
    {q:"Wie lautet 1/2 als Dezimalzahl?",a:"0,5",wrong:["0,2","0,25","1,2"],why:"1 geteilt durch 2 ergibt 0,5."},
    {q:"Wie viel ist 1/4 + 1/4?",a:"1/2",wrong:["1/8","2/8","1/4"],why:"Bei gleichen Nennern addierst du die Zähler: 1/4 + 1/4 = 2/4 = 1/2."}
  ],
  "photosynthese":[
    {q:"Was benötigen Pflanzen für die Fotosynthese?",a:"Licht, Wasser und Kohlenstoffdioxid.",wrong:["Sauerstoff, Zucker und Dunkelheit","Nur Wasser und Sauerstoff","Salz, Wärme und Stickstoff"],why:"Mit Lichtenergie wandeln Pflanzen Wasser und Kohlenstoffdioxid in energiereiche Stoffe um."},
    {q:"Welches Gas geben Pflanzen bei der Fotosynthese ab?",a:"Sauerstoff",wrong:["Kohlenstoffdioxid","Stickstoff","Wasserstoff"],why:"Bei der Fotosynthese entsteht Sauerstoff, der an die Umgebung abgegeben wird."}
  ],
  "elektrizitaet":[
    {q:"Was ist die Einheit der elektrischen Stromstärke?",a:"Ampere (A)",wrong:["Volt (V)","Ohm (Ω)","Watt (W)"],why:"Die Stromstärke wird in Ampere gemessen."},
    {q:"Was misst ein Voltmeter?",a:"Die elektrische Spannung.",wrong:["Die Stromstärke","Den Widerstand direkt","Die elektrische Leistung"],why:"Ein Voltmeter misst die Spannung zwischen zwei Punkten."}
  ]
};
function coachTopicKey(t){const s=normalized(t);if(s.includes("prozent"))return"prozentrechnung";if(s.includes("bruch"))return"brueche";if(s.includes("photo"))return"photosynthese";if(s.includes("elektr")||s.includes("strom")||s.includes("spannung"))return"elektrizitaet";return""}
function coachSaveNotes(){
  const topic=document.getElementById("coachTopic").value.trim();
  const notes=document.getElementById("coachNotes").value.trim();
  if(!topic&&!notes){document.getElementById("coachStatus").textContent="Bitte gib mindestens ein Thema oder Notizen ein.";return}
  const key=topic||"Allgemeine Notizen";
  data.studyNotes=data.studyNotes||{};
  data.studyNotes[key]={topic,notes,updatedAt:new Date().toISOString()};
  save();
  document.getElementById("coachStatus").textContent="Notizen gespeichert ✓";
}
function coachLoadNotes(){
  const topic=document.getElementById("coachTopic").value.trim();
  const saved=data.studyNotes||{};
  const match=Object.values(saved).find(x=>normalized(x.topic||"")===normalized(topic));
  if(match)document.getElementById("coachNotes").value=match.notes||"";
}
function coachBuildPersonalContext(){
  const saved=data.studyNotes&&typeof data.studyNotes==="object"?data.studyNotes:{};
  const currentTopic=document.getElementById("coachTopic").value.trim();
  const currentNotes=document.getElementById("coachNotes").value.trim();
  const entries=Object.entries(saved).map(([key,value])=>({
    key,
    topic:String(value?.topic||key||"Allgemeine Notizen").trim(),
    notes:String(value?.notes||"").trim(),
    updatedAt:String(value?.updatedAt||"")
  })).filter(entry=>entry.notes);
  // Aktuelle Eingaben haben Vorrang vor einer älteren gespeicherten Version desselben Themas.
  if(currentNotes){
    const currentKey=currentTopic||"Aktuelle Notizen";
    const normalizedTopic=normalized(currentTopic);
    const existing=entries.findIndex(entry=>normalized(entry.topic)===normalizedTopic&&normalizedTopic);
    const currentEntry={key:currentKey,topic:currentTopic||"Aktuelle Notizen",notes:currentNotes,updatedAt:"9999"};
    if(existing>=0)entries.splice(existing,1);
    entries.unshift(currentEntry);
  }
  entries.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  const sections=[];
  let remaining=8000;
  for(const entry of entries){
    if(remaining<=0)break;
    const section="Thema: "+entry.topic+"\\nNotizen:\\n"+entry.notes;
    const clipped=section.length>remaining?section.slice(0,remaining):section;
    sections.push(clipped);
    remaining-=clipped.length+2;
  }
  return sections.join("\\n\\n");
}
function coachExplain(){
  const topic=document.getElementById("coachTopic").value.trim()||"dein Thema";
  const notes=document.getElementById("coachNotes").value.trim();
  const panel=document.getElementById("coachExplanationPanel");
  const out=document.getElementById("coachExplanation");
  const lines=notes.split(/(?<=[.!?])\s+|\n+/).map(x=>x.trim()).filter(Boolean);
  let text="";
  if(lines.length){
    text="<h3>Aus deinen Notizen</h3><ul>"+lines.slice(0,12).map(x=>"<li>"+esc(x)+"</li>").join("")+"</ul>";
    text+="<p><strong>Lerntipp:</strong> Versuche, jede Aussage mit eigenen Worten zu erklären. Markiere Begriffe, die du noch nicht sicher erklären kannst.</p>";
  }else{
    const key=coachTopicKey(topic),bank=coachKnowledge[key];
    if(bank){
      text="<h3>"+esc(topic)+" – die Grundlagen</h3><ul>"+bank.map(x=>"<li><strong>"+esc(x.q)+"</strong><br>"+esc(x.a)+"</li>").join("")+"</ul>";
      text+="<p><strong>Lerntipp:</strong> Erkläre zuerst die Grundidee laut in eigenen Worten und rechne oder beantworte danach ein Beispiel ohne Hilfe.</p>";
    }else{
      text="<p>Für <strong>"+esc(topic)+"</strong> habe ich noch keine passende allgemeine Erklärung in meiner kleinen Offline-Wissensbasis. Füge deine Hefteinträge oder einen Lernzettel oben ein. Dann kann ich daraus Lernfragen bilden.</p>";
    }
  }
  out.innerHTML=text;
  panel.hidden=false;
}
const COACH_CHAT_PREFIX="schulplaner-coach-chat-v1-";
let coachConversation = [];

function coachChatStorageKey(){
  return currentUser?.id ? COACH_CHAT_PREFIX+currentUser.id : "";
}
function coachSaveConversation(){
  const key=coachChatStorageKey();
  if(!key)return;
  try{
    coachConversation=coachConversation.slice(-16);
    localStorage.setItem(key,JSON.stringify(coachConversation));
  }catch(error){console.warn("Lerncoach-Verlauf konnte lokal nicht gespeichert werden:",error);}
}
function coachLoadConversation(){
  const key=coachChatStorageKey();
  coachConversation=[];
  if(!key)return;
  try{
    const saved=JSON.parse(localStorage.getItem(key)||"[]");
    if(Array.isArray(saved)){
      coachConversation=saved.filter(message=>
        message && (message.role==="user"||message.role==="assistant") &&
        typeof message.content==="string"
      ).slice(-16);
    }
  }catch(error){
    console.warn("Gespeicherter Lerncoach-Verlauf ist nicht lesbar:",error);
    localStorage.removeItem(key);
  }
  const panel=document.getElementById("coachExplanationPanel");
  if(panel){
    coachRenderConversation();
    panel.hidden=coachConversation.length===0;
  }
}

function coachRenderConversation(){
  const out=document.getElementById("coachExplanation");
  out.replaceChildren();
  coachConversation.forEach(message=>{
    const bubble=document.createElement("div");
    bubble.className="chat-message "+(message.role==="user"?"user":"bot");
    bubble.style.whiteSpace="pre-wrap";
    bubble.textContent=message.content;
    out.appendChild(bubble);
  });
}

async function coachAskAI(){
  const question=document.getElementById("coachQuestionInput").value.trim();
  const panel=document.getElementById("coachExplanationPanel");
  const out=document.getElementById("coachExplanation");
  const status=document.getElementById("coachStatus");
  if(!question){status.textContent="Schreib zuerst eine Frage in das Feld.";return}
  if(!currentUser||!supabaseClient){status.textContent="Für die echte KI musst du angemeldet sein. Deine bisherigen Offline-Lernfunktionen bleiben verfügbar.";return}
  const button=document.getElementById("coachAskButton");
  button.disabled=true;
  button.textContent="Lerncoach denkt nach …";
  status.textContent="Deine Frage wird zusammen mit dem bisherigen Gespräch übermittelt.";
  panel.hidden=false;
  try{
    const mode=document.getElementById("coachMode").value||"standard";
    const {data:result,error}=await supabaseClient.functions.invoke("lerncoach-ai",{
      body:{
        question,
        history:coachConversation.slice(-16),
        mode,
        topic:document.getElementById("coachTopic").value.trim(),
        notes:mode==="personal"?coachBuildPersonalContext():document.getElementById("coachNotes").value.trim(),
        classLevel:data.profile?.klass||data.profile?.className||""
      }
    });
    if(error) throw error;
    if(result?.error) throw new Error(result.error);
    if(!result?.answer) throw new Error("Der Lerncoach hat keine Antwort erhalten.");
    coachConversation.push({role:"user",content:question},{role:"assistant",content:result.answer});
    coachSaveConversation();
    coachRenderConversation();
    document.getElementById("coachQuestionInput").value="";
    status.textContent="Antwort erhalten – du kannst direkt nachfragen ✓";
  }catch(error){
    console.warn("Lerncoach KI:",error);
    const message=error?.message||"Unbekannter Fehler";
    out.textContent=message.includes("noch nicht eingerichtet")
      ?"Die sichere KI-Schnittstelle ist vorbereitet. Es fehlt noch die Freigabe und Konfiguration eines passenden KI-Anbieters. Deine vorhandenen Offline-Lernfunktionen funktionieren weiterhin."
      :"Die KI-Antwort konnte gerade nicht geladen werden. "+message;
    status.textContent="Die KI-Verbindung konnte die Frage gerade nicht beantworten.";
  }finally{
    button.disabled=false;
    button.textContent="Frage an Lerncoach senden";
  }
}
function coachBuildQuestions(){
  const topic=document.getElementById("coachTopic").value.trim()||"dein Thema";
  const notes=document.getElementById("coachNotes").value.trim();
  const facts=notes.split(/(?<=[.!?])\s+|\n+/).map(x=>x.trim()).filter(x=>x.split(/\s+/).length>=6);
  const key=coachTopicKey(topic);
  let qs=[];
  if(facts.length){
    const chosen=facts.slice(0,8);
    qs=chosen.map((fact,i)=>{
      const words=fact.replace(/[“”„"()]/g,"").split(/\s+/);
      const candidates=words.filter(w=>w.length>=5&&!/^(diese|dieser|welche|wurde|werden|haben|einer|eines|einem|einen|damit|dabei|durch)$/i.test(w));
      const answer=(candidates.sort((a,b)=>b.length-a.length)[0]||words[Math.max(1,Math.floor(words.length/2))]).replace(/[.,;:!?]+$/,"");
      const masked=fact.replace(new RegExp(answer.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"i"),"________");
      const pool=[...new Set(words.filter(w=>w.length>=4&&w.toLowerCase()!==answer.toLowerCase()))].slice(0,3);
      while(pool.length<3)pool.push(["Beispiel","Vorgang","Ergebnis","Begriff","Ursache"][pool.length]);
      const options=[answer,...pool].sort(()=>Math.random()-.5);
      return {q:"Ergänze den fehlenden Begriff: "+masked,a:answer,options,why:"In deinen Notizen steht: „"+fact+"“.",difficulty:words.length};
    });
  } else if(key) qs=coachKnowledge[key].map(x=>({q:x.q,a:x.a,options:[x.a,...x.wrong].sort(()=>Math.random()-.5),why:x.why}));
  return qs;
}
function coachStart(){
  coachSaveNotes();
  coachQuestions=coachBuildQuestions();
  if(!coachQuestions.length){
    document.getElementById("coachStatus").textContent="Ich brauche Notizen mit ein paar vollständigen Sätzen oder ein Thema aus der Offline-Wissensbasis (Prozentrechnung, Brüche, Fotosynthese oder Elektrizität).";
    return;
  }
  coachQuestionIndex=0;coachLevel=1;coachCorrect=0;coachAnswered=false;
  document.getElementById("coachQuizPanel").hidden=false;
  coachRenderQuestion();
  document.getElementById("coachQuizPanel").scrollIntoView({behavior:"smooth",block:"start"});
}
function coachRenderQuestion(){
  const q=coachQuestions[coachQuestionIndex];if(!q)return;
  coachAnswered=false;
  document.getElementById("coachQuizTitle").textContent="Frage "+(coachQuestionIndex+1)+" von "+coachQuestions.length;
  document.getElementById("coachLevel").textContent="Level "+coachLevel+" · "+(coachLevel===1?"Einstieg":coachLevel===2?"Vertiefung":"Knifflig");
  document.getElementById("coachProgressFill").style.width=(coachQuestionIndex/coachQuestions.length*100)+"%";
  document.getElementById("coachQuestion").textContent=q.q;
  document.getElementById("coachFeedback").textContent="";
  document.getElementById("coachOptions").innerHTML=q.options.map((o,i)=>'<button type="button" class="coach-option" data-coach-option="'+i+'">'+esc(o)+'</button>').join("");
  document.querySelectorAll("[data-coach-option]").forEach(b=>b.onclick=()=>coachAnswer(Number(b.dataset.coachOption)));
  document.getElementById("coachNextButton").disabled=true;
  document.getElementById("coachNextButton").textContent=coachQuestionIndex===coachQuestions.length-1?"Ergebnis anzeigen":"Nächste Frage";
  document.getElementById("coachScore").textContent="Richtig: "+coachCorrect+" von "+coachQuestionIndex+" beantworteten Fragen.";
}
function coachAnswer(index){
  if(coachAnswered)return;coachAnswered=true;
  const q=coachQuestions[coachQuestionIndex],chosen=q.options[index],correct=normalized(chosen)===normalized(q.a);
  if(correct){coachCorrect++;coachLevel=Math.min(3,coachLevel+1)}else{coachLevel=Math.max(1,coachLevel-1)}
  document.querySelectorAll("[data-coach-option]").forEach((b,i)=>{b.disabled=true;if(normalized(q.options[i])===normalized(q.a))b.classList.add("is-correct");else if(i===index)b.classList.add("is-wrong")});
  document.getElementById("coachFeedback").textContent=(correct?"Richtig! ":"Noch nicht ganz. Die passende Antwort ist: "+q.a+". ")+q.why;
  document.getElementById("coachNextButton").disabled=false;
  document.getElementById("coachScore").textContent="Richtig: "+coachCorrect+" von "+(coachQuestionIndex+1)+" · aktuelles Level "+coachLevel+".";
}
function coachNext(){
  if(coachQuestionIndex<coachQuestions.length-1){
    const remaining=coachQuestions.slice(coachQuestionIndex+1);
    remaining.sort((a,b)=>coachLevel===1?a.difficulty-b.difficulty:b.difficulty-a.difficulty);
    coachQuestions.splice(coachQuestionIndex+1,remaining.length,...remaining);
    coachQuestionIndex++;coachRenderQuestion();return
  }
  document.getElementById("coachQuestion").textContent="Geschafft! Du hast "+coachCorrect+" von "+coachQuestions.length+" Fragen richtig beantwortet.";
  document.getElementById("coachOptions").innerHTML="";
  document.getElementById("coachFeedback").textContent=coachCorrect===coachQuestions.length?"Stark! Du kannst die Fragen beim nächsten Mal auf einem höheren Level angehen.":"Schau dir die Erklärungen zu den falschen Antworten noch einmal an und starte eine neue Runde.";
  document.getElementById("coachProgressFill").style.width="100%";
  document.getElementById("coachNextButton").disabled=true;
  document.getElementById("coachScore").textContent="Ergebnis: "+coachCorrect+"/"+coachQuestions.length+" richtig.";
}
coachSetMode(localStorage.getItem(COACH_MODE_KEY)||"standard");
document.getElementById("coachMode").addEventListener("change",event=>coachSetMode(event.target.value));
document.getElementById("coachSaveButton").addEventListener("click",coachSaveNotes);
document.getElementById("coachTopic").addEventListener("change",coachLoadNotes);
document.getElementById("coachExplainButton").addEventListener("click",coachExplain);
document.getElementById("coachAskButton").addEventListener("click",coachAskAI);
document.getElementById("coachQuestionInput").addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();coachAskAI()}});
document.getElementById("coachStartButton").addEventListener("click",coachStart);
document.getElementById("coachNextButton").addEventListener("click",coachNext);
document.getElementById("coachStopButton").addEventListener("click",()=>{document.getElementById("coachQuizPanel").hidden=true});

render();
initSupabase();
initTurnstile();


// Beim Zurückkehren zur Website aktuelle Cloud-Daten laden (z. B. nach Änderungen auf einem anderen Gerät).
async function refreshCloudOnReturn(){
  if(!currentUser || !supabaseClient || !cloudReady || cloudSaveTimer) return;
  try{
    const userId=currentUser.id;
    const {data:row,error}=await supabaseClient.from("user_settings").select("settings").eq("user_id",userId).maybeSingle();
    if(error) throw error;
    if(!currentUser || currentUser.id!==userId || !cloudReady) return;
    if(row?.settings?.app_data){
      const remote=row.settings.app_data;
      data={profile:remote.profile||{},grades:remote.grades||[],lessons:remote.lessons||[],materials:remote.materials||[],exams:remote.exams||[],theme:remote.theme||"dark",subjects:remote.subjects||[],teachers:remote.teachers||[],studyNotes:remote.studyNotes||{}};
      localStorage.setItem(KEY,JSON.stringify(data));
      render();
      setAuthStatus("Deine aktuellen Online-Daten wurden geladen ✓");
    }
  }catch(err){
    console.warn("Cloud-Aktualisierung beim Zurückkehren fehlgeschlagen:",err);
  }
}
window.addEventListener("focus",refreshCloudOnReturn);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)refreshCloudOnReturn()});
