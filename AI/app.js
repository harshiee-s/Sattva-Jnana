import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
  getFirestore, collection, getDocs, getDoc, addDoc, setDoc, updateDoc, deleteDoc,
  doc, query, where, orderBy, limit, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Firebase web app configuration.
// NOTE: This config (apiKey, authDomain, etc.) is not a server-side secret —
// Firebase's web SDK is designed so this is safely visible in the browser.
// Real access control is enforced by Firestore Security Rules, not by
// hiding these values.
const firebaseConfig = {
  apiKey: "AIzaSyAAMFHT4Em8PycXY87tsYDmysHkRSnHYoM",
  authDomain: "harshiee-s.firebaseapp.com",
  projectId: "harshiee-s",
  storageBucket: "harshiee-s.firebasestorage.app",
  messagingSenderId: "521295456468",
  appId: "1:521295456468:web:3b035f0b9f1c3b5cbbb341"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDb(app);
function getDb(a){ return getFirestore(a); }

let currentUser = null;
let currentProfile = null;
let skipAuthCheck = false; // true while the signup handler is mid-flight, to avoid a race with onAuthStateChanged

/* ---------------- TOAST ---------------- */
window.showToast = function(msg, isErr=false){
  const el = document.createElement('div');
  el.className = 'toast' + (isErr?' err':'');
  el.innerHTML = `<i class="fa-solid ${isErr?'fa-triangle-exclamation':'fa-circle-check'}"></i> ${msg}`;
  document.getElementById('toastWrap').appendChild(el);
  setTimeout(()=>el.remove(), 3800);
};

/* ---------------- AUTH TABS ---------------- */
function authMsg(text, isErr){
  const m = document.getElementById('authMsg');
  m.textContent = text; m.className = isErr ? 'err' : 'ok';
}

/* ---------------- LOGIN ---------------- */
document.getElementById('loginForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in...';
  try{
    await signInWithEmailAndPassword(auth, document.getElementById('loginEmail').value.trim(), document.getElementById('loginPass').value);
  }catch(err){
    console.error('Login error:', err);
    authMsg(friendlyAuthError(err), true);
  }finally{
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In';
  }
});

function friendlyAuthError(err){
  const code = err.code || '';
  if(code.includes('user-not-found') || code.includes('invalid-credential') || code.includes('wrong-password')) return 'Incorrect email or password.';
  if(code.includes('email-already-in-use')) return 'An account with this email already exists. Try signing in instead.';
  if(code.includes('weak-password')) return 'Password should be at least 6 characters.';
  if(code.includes('invalid-email')) return 'Please enter a valid email address.';
  if(code.includes('operation-not-allowed')) return 'Email/Password sign-in is not enabled for this Firebase project yet. Enable it under Authentication → Sign-in method.';
  if(code.includes('permission-denied')) return 'Firestore rejected the request (permission-denied). Check that your Firestore security rules allow signed-in users to read/write.';
  if(code.includes('unavailable') || code.includes('failed-precondition')) return 'Could not reach Firestore — make sure a Firestore database has been created for this project.';
  return err.message || 'Something went wrong. Please try again.';
}

/* ---------------- AUTH STATE ---------------- */
onAuthStateChanged(auth, async (user)=>{
  if(skipAuthCheck) return;
  if(user){
    try{
      const snap = await getDoc(doc(db,'users',user.uid));
      if(snap.exists() && snap.data().role === 'admin'){
        currentUser = user;
        currentProfile = snap.data();
        enterApp();
        return;
      }
      if(snap.exists() && snap.data().role === 'mentor'){
        // Mentors (teachers) get a restricted view of this same portal — pull
        // their mentor profile too, since that's where assigned subjects live.
        let assignedSubjectIds = [];
        let assignedStudentIds = [];
        try{
          const mSnap = await getDoc(doc(db,'mentors',user.uid));
          if(mSnap.exists()){
            assignedSubjectIds = mSnap.data().assignedSubjectIds || [];
            assignedStudentIds = mSnap.data().assignedStudentIds || [];
          }
        }catch(e){ console.warn('Could not load mentor profile', e); }
        currentUser = user;
        currentProfile = { ...snap.data(), assignedSubjectIds, assignedStudentIds };
        enterApp();
        return;
      }
      if(snap.exists() && snap.data().role === 'student'){
        // Students get a read-only view of this same portal, scoped to the
        // subjects assigned to their student profile.
        let assignedSubjectIds = [];
        try{
          const sSnap = await getDoc(doc(db,'students',user.uid));
          if(sSnap.exists()) assignedSubjectIds = sSnap.data().assignedSubjectIds || [];
        }catch(e){ console.warn('Could not load student profile', e); }
        currentUser = user;
        currentProfile = { ...snap.data(), assignedSubjectIds };
        enterApp();
        return;
      }
      if(snap.exists()){
        // A profile exists but its role isn't recognized here — no access.
        authMsg('This account does not have admin access to this portal.', true);
        await signOut(auth);
        return;
      }
      // No profile doc for this uid yet. If no admin exists anywhere in the
      // system, treat this sign-in as the bootstrap admin (covers accounts
      // created directly in the Firebase console, or orphaned from an earlier
      // attempt) rather than locking the person out.
      const adminQuery = await getDocs(query(collection(db,'users'), where('role','==','admin')));
      if(adminQuery.empty){
        const name = user.displayName || (user.email ? user.email.split('@')[0] : 'Admin');
        const profile = { name, email:user.email||'', role:'admin', status:'active', createdAt:new Date().toISOString() };
        await setDoc(doc(db,'users',user.uid), profile);
        currentUser = user;
        currentProfile = profile;
        enterApp();
      } else {
        authMsg('This account does not have admin access to this portal.', true);
        await signOut(auth);
      }
    }catch(err){
      console.error('Auth check error:', err);
      authMsg('Could not verify your account (' + (err.code||err.message) + '). Check your Firestore security rules.', true);
      await signOut(auth).catch(()=>{});
    }
  } else {
    currentUser = null; currentProfile = null;
    showLoginScreen();
  }
});

window.doLogout = async function(){ await signOut(auth); };

function hideLoadingScreen(){
  const el = document.getElementById('loadingScreen');
  if(el) el.classList.add('hide');
}
function showLoginScreen(){
  hideLoadingScreen();
  document.getElementById('loginScreen').classList.add('show');
  document.getElementById('app').classList.remove('show');
}
// Safety net: if Firebase never responds (network/config issue), don't leave
// the person staring at a spinner forever.
setTimeout(()=>{
  const el = document.getElementById('loadingScreen');
  if(el && !el.classList.contains('hide')){
    authMsg('Taking longer than expected to connect. Please check your internet connection and try again.', true);
    showLoginScreen();
  }
}, 12000);

function enterApp(){
  hideLoadingScreen();
  document.getElementById('loginScreen').classList.remove('show');
  document.getElementById('app').classList.add('show');
  const name = currentProfile.name || 'Admin';
  document.getElementById('tbName').textContent = name;
  document.getElementById('tbAvatar').textContent = name.trim().charAt(0).toUpperCase();
  const hr = new Date().getHours();
  const greet = hr < 12 ? 'Good Morning' : hr < 17 ? 'Good Afternoon' : 'Good Evening';
  document.getElementById('greetTitle').textContent = `${greet}, ${name.split(' ')[0]}! 👋`;
  document.getElementById('setName').value = name;
  document.getElementById('setEmail').value = currentProfile.email || '';
  applyRolePermissions();
  initDashboard();
  ENTITY_KEYS.forEach(k=>renderEntityPage(k));
  Object.values(RESOURCE_MODULES).forEach(initResourceModule);
}

/* ---------------- ROLE-BASED ACCESS (Mentor + Student logins) ----------------
   Admins see and manage everything.
     - Mentors (teachers): User Management hidden. Academic Management + AI
       Learning are view-only. Assessments + Resources stay fully editable.
     - Students: User Management hidden, and EVERY section is view-only.
     - Both mentors and students are additionally scoped to only the
       subjects an admin has assigned to their account.
*/
const VIEW_ONLY_ENTITY_KEYS_FOR_MENTOR = ['subjects','chapters','topics'];
const VIEW_ONLY_MODULE_KEYS_FOR_MENTOR = ['lessons','aiKnowledge'];
// Students get a read-only version of every section they can see; mentors
// are only read-only within Academic Management + AI Learning.
function isReadOnlyForEntity(key){
  if(isStudentRole()) return true;
  return isMentor() && VIEW_ONLY_ENTITY_KEYS_FOR_MENTOR.includes(key);
}
function isReadOnlyForModule(key){
  if(isStudentRole()) return true;
  return isMentor() && VIEW_ONLY_MODULE_KEYS_FOR_MENTOR.includes(key);
}

function isMentor(){ return !!(currentProfile && currentProfile.role === 'mentor'); }
function isStudentRole(){ return !!(currentProfile && currentProfile.role === 'student'); }
function isRestrictedRole(){ return isMentor() || isStudentRole(); } // any non-admin login
function assignedSubjectSet(){ return new Set((currentProfile && currentProfile.assignedSubjectIds) || []); }
function mentorStudentSet(){ return new Set((currentProfile && currentProfile.assignedStudentIds) || []); }
function visibleStudentRows(){
  const rows = entityCache.students || [];
  if(!isMentor()) return rows;
  const set = mentorStudentSet();
  return rows.filter(s=>set.has(s.id));
}
function subjectAllowed(subjectId){
  if(!isRestrictedRole()) return true;
  return !!subjectId && assignedSubjectSet().has(subjectId);
}
// Resource modules (lessons/aiKnowledge/studyMaterials/questionBank/questionPaper) tag every row with subjectId directly.
function visibleRows(cfg){
  return isRestrictedRole() ? cfg.rows.filter(r=>subjectAllowed(r.subjectId)) : cfg.rows;
}
// Generic entities need to trace subjectId through their relations.
function subjectIdOfChapter(chapterId){
  const ch = (entityCache.chapters||[]).find(c=>c.id===chapterId);
  return ch ? ch.subjectId : null;
}
function subjectIdOfTopic(topicId){
  const t = (entityCache.topics||[]).find(x=>x.id===topicId);
  return t ? subjectIdOfChapter(t.chapterId) : null;
}
function subjectIdOfQuiz(quizId){
  const q = (entityCache.quizzes||[]).find(x=>x.id===quizId);
  if(!q) return null;
  return q.subjectId || subjectIdOfTopic(q.topicId); // quizzes store subjectId directly now; fall back for older quizzes
}
function entitySubjectId(key, row){
  switch(key){
    case 'subjects': return row.id;
    case 'chapters': return row.subjectId;
    case 'topics': return subjectIdOfChapter(row.chapterId);
    case 'quizzes': return row.subjectId || subjectIdOfTopic(row.topicId);
    case 'questions': return subjectIdOfQuiz(row.quizId);
    case 'results': return subjectIdOfQuiz(row.quizId);
    default: return null; // students/mentors aren't subject-scoped
  }
}
function visibleEntityRows(key){
  if(key==='students') return visibleStudentRows();
  const rows = entityCache[key] || [];
  if(!isRestrictedRole()) return rows;
  let filtered = rows;
  if(entitySubjectId(key, {}) !== null || ['subjects','chapters','topics','quizzes','questions','results'].includes(key)){
    filtered = rows.filter(r=>subjectAllowed(entitySubjectId(key, r)));
  }
  // A student's own Results are private — classmates' quiz scores stay hidden.
  if(key==='results' && isStudentRole()){
    filtered = filtered.filter(r=>r.studentId === (currentUser && currentUser.uid));
  }
  return filtered;
}
function applyRolePermissions(){
  const mentor = isMentor();
  const student = isStudentRole();
  const restricted = mentor || student;
  document.body.classList.toggle('role-mentor', mentor);
  document.body.classList.toggle('role-student', student);
  document.querySelectorAll('[data-admin-only]').forEach(el=>{ el.style.display = restricted ? 'none' : ''; });
  document.querySelectorAll('[data-hide-student]').forEach(el=>{ el.style.display = student ? 'none' : ''; });
  const roleLabel = document.getElementById('tbUserRole');
  if(roleLabel) roleLabel.textContent = mentor ? 'Mentor' : (student ? 'Student' : 'Super Admin');
}

/* =================================================================
   GLOBAL SEARCH (topbar) — searches across everything the signed-in
   role can see: entities (students, subjects, chapters, ...) and
   resource modules (lessons, AI knowledge, study materials, ...).
   ================================================================= */
const ENTITY_SEARCH_META = {
  students:  {icon:'fa-user-graduate',      get:r=>r.name,  sub:r=>`Student • ${[r.board,r.className].filter(Boolean).join(' ')}`},
  mentors:   {icon:'fa-chalkboard-user',    get:r=>r.name,  sub:r=>`Mentor • ${r.subject||''}`, adminOnly:true},
  subjects:  {icon:'fa-book',               get:r=>r.name,  sub:r=>`Subject • ${[r.board,r.className].filter(Boolean).join(' ')}`},
  chapters:  {icon:'fa-layer-group',        get:r=>r.name,  sub:r=>`Chapter • ${r.subjectName||''}`},
  topics:    {icon:'fa-bookmark',           get:r=>r.name,  sub:r=>`Topic • ${r.chapterName||''}`},
  quizzes:   {icon:'fa-file-circle-check',  get:r=>r.title, sub:r=>`Quiz • ${r.topicName||''}`},
  questions: {icon:'fa-circle-question',    get:r=>r.text,  sub:r=>`Question • ${r.quizName||''}`, hideStudent:true},
  results:   {icon:'fa-square-poll-vertical', get:r=>`${r.studentName||'Result'} — ${r.quizName||''}`, sub:r=>`Result • Score ${r.score||0}%`}
};
function buildSearchResults(query){
  const q = query.trim().toLowerCase();
  if(!q) return [];
  const results = [];
  Object.entries(ENTITY_SEARCH_META).forEach(([key, meta])=>{
    if(meta.adminOnly && isRestrictedRole()) return; // hidden pages stay unsearchable for mentors/students
    if(meta.hideStudent && isStudentRole()) return; // e.g. Questions holds the answer key
    if(key==='students' && isRestrictedRole()) return; // Students page itself is hidden
    visibleEntityRows(key).forEach(r=>{
      const label = meta.get(r);
      if(label && String(label).toLowerCase().includes(q)){
        results.push({ icon:meta.icon, title:String(label), sub:meta.sub(r), action:()=>{ closeMobileSearch(); goToPage(key); } });
      }
    });
  });
  Object.values(RESOURCE_MODULES).forEach(cfg=>{
    visibleRows(cfg).forEach(r=>{
      const label = cfg.itemType==='video' ? r.name : r.fileName;
      if(label && String(label).toLowerCase().includes(q)){
        results.push({
          icon:cfg.icon, title:String(label),
          sub:`${cfg.label} • ${[r.subjectName,r.chapterName].filter(Boolean).join(' › ')}`,
          action:()=>{
            closeMobileSearch();
            cfg.browsePath = { board:r.board, className:r.className, subjectId:r.subjectId, subjectName:r.subjectName, chapterId:r.chapterId, chapterName:r.chapterName, topicId:r.topicId, topicName:r.topicName, subtopic:r.subtopic };
            goToPage(cfg.key);
            renderResourceBrowser(cfg);
            if(cfg.itemType==='video') viewLessonVideo(cfg.key, r.id); else viewResource(cfg.key, r.id);
          }
        });
      }
    });
  });
  return results.slice(0, 20);
}
function renderSearchResults(query){
  const box = document.getElementById('globalSearchResults');
  if(!box) return;
  if(!query.trim()){ closeSearch(); return; }
  const results = buildSearchResults(query);
  box.innerHTML = results.length
    ? results.map((r,i)=>`<div class="search-result" data-idx="${i}"><div class="sr-icon"><i class="fa-solid ${r.icon}"></i></div><div><div class="sr-title">${escapeHtml(r.title)}</div><div class="sr-sub">${escapeHtml(r.sub||'')}</div></div></div>`).join('')
    : `<div class="dropdown-empty">No results for "${escapeHtml(query.trim())}"</div>`;
  box.classList.add('show');
  box.querySelectorAll('.search-result').forEach(el=>{
    el.addEventListener('click', ()=>results[Number(el.dataset.idx)].action());
  });
}
function closeSearch(){
  const box = document.getElementById('globalSearchResults');
  if(box){ box.classList.remove('show'); box.innerHTML=''; }
}
function closeMobileSearch(){
  const wrap = document.getElementById('tbSearchWrap');
  if(wrap) wrap.classList.remove('mobile-open');
  closeSearch();
}
(function wireGlobalSearch(){
  const input = document.getElementById('globalSearchInput');
  if(!input) return;
  input.addEventListener('input', ()=>renderSearchResults(input.value));
  input.addEventListener('focus', ()=>{ if(input.value.trim()) renderSearchResults(input.value); });
  input.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ input.blur(); closeMobileSearch(); } });
  document.addEventListener('click', (e)=>{ if(!e.target.closest('.tb-search-wrap') && !e.target.closest('#mobileSearchToggle')) closeMobileSearch(); });

  const toggle = document.getElementById('mobileSearchToggle');
  const wrap = document.getElementById('tbSearchWrap');
  if(toggle && wrap){
    toggle.addEventListener('click', (e)=>{
      e.stopPropagation();
      wrap.classList.toggle('mobile-open');
      if(wrap.classList.contains('mobile-open')) setTimeout(()=>input.focus(), 50);
      else closeSearch();
    });
  }
})();

/* Mobile sidebar backdrop — tap outside the open sidebar to close it */
(function wireSidebarBackdrop(){
  const backdrop = document.getElementById('sidebarBackdrop');
  const sidebar = document.getElementById('sidebar');
  if(!backdrop || !sidebar) return;
  backdrop.addEventListener('click', ()=>sidebar.classList.remove('open'));
})();

/* ---------------- NAVIGATION ---------------- */
document.body.addEventListener('click', (e)=>{
  const item = e.target.closest('[data-page]');
  if(!item) return;
  e.preventDefault();
  goToPage(item.dataset.page);
});
window.goToPage = function(key){
  if(isRestrictedRole() && ['students','mentors','createUser','settings'].includes(key)) return;
  if(isStudentRole() && key==='questions') return; // Questions holds the answer key — never shown to students
  if(document.fullscreenElement || document.webkitFullscreenElement){
    (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
  }
  document.querySelectorAll('.sb-item[data-page]').forEach(el=>el.classList.toggle('active', el.dataset.page===key));
  document.querySelectorAll('.page').forEach(el=>el.classList.remove('active'));
  const target = document.getElementById('page-'+key);
  if(target) target.classList.add('active');
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('main').scrollTo(0,0);
};

/* (Activity log removed — Recent Activity panel is no longer shown) */

/* =================================================================
   ENTITY CONFIG — drives generic list/add/edit pages
   ================================================================= */
const CLASS_OPTIONS = Array.from({length:12}, (_,i)=>`Class ${i+1}`);
const BOARD_OPTIONS = ['ICSE','CBSE','State'];
const ENTITIES = {
  students: {
    label:'Students', singular:'Student', icon:'fa-user-graduate', collection:'students',
    columns:[{k:'name',l:'Name'},{k:'email',l:'Email'},{k:'board',l:'Board'},{k:'className',l:'Class'},{k:'assignedSubjectIds',l:'Assigned Subjects',relList:'subjects'},{k:'status',l:'Status',pill:true}],
    fields:[
      {k:'name',l:'Full Name',type:'text',req:true},
      {k:'email',l:'Email',type:'email',req:true},
      {k:'board',l:'Board',type:'select',opts:BOARD_OPTIONS,def:BOARD_OPTIONS[0],req:true},
      {k:'className',l:'Class',type:'select',opts:CLASS_OPTIONS,def:'Class 1',req:true},
      {k:'assignedSubjectIds',l:'Assign Subjects (portal access)',type:'multiselect',rel:'subjects'},
      {k:'status',l:'Status',type:'select',opts:['Active','Inactive'],def:'Active'}
    ]
  },
  mentors: {
    label:'Mentors', singular:'Mentor', icon:'fa-chalkboard-user', collection:'mentors',
    columns:[{k:'name',l:'Name'},{k:'email',l:'Email'},{k:'subject',l:'Subject'},{k:'assignedSubjectIds',l:'Portal Access',relList:'subjects'},{k:'assignedStudentIds',l:'Assigned Students',relList:'students'},{k:'status',l:'Status',pill:true}],
    fields:[
      {k:'name',l:'Full Name',type:'text',req:true},
      {k:'email',l:'Email',type:'email',req:true},
      {k:'subject',l:'Subject',type:'text',req:true,ph:'e.g. Mathematics'},
      {k:'assignedSubjectIds',l:'Assign Subjects (portal access)',type:'multiselect',rel:'subjects'},
      {k:'assignedStudentIds',l:'Assign Students (optional)',type:'multiselect',rel:'students'},
      {k:'status',l:'Status',type:'select',opts:['Active','Inactive'],def:'Active'}
    ]
  },
  subjects: {
    label:'Subjects', singular:'Subject', icon:'fa-book', collection:'subjects',
    columns:[{k:'name',l:'Subject Name'},{k:'board',l:'Board'},{k:'className',l:'Class'},{k:'status',l:'Status',pill:true}],
    fields:[
      {k:'name',l:'Subject Name',type:'text',req:true,ph:'e.g. Mathematics'},
      {k:'board',l:'Board',type:'select',opts:BOARD_OPTIONS,def:BOARD_OPTIONS[0],req:true},
      {k:'className',l:'Class',type:'select',opts:CLASS_OPTIONS,def:'Class 1',req:true},
      {k:'status',l:'Status',type:'select',opts:['Active','Inactive'],def:'Active'}
    ]
  },
  chapters: {
    label:'Chapters', singular:'Chapter', icon:'fa-layer-group', collection:'chapters',
    columns:[{k:'name',l:'Chapter Name'},{k:'board',l:'Board'},{k:'className',l:'Class'},{k:'subjectName',l:'Subject'},{k:'status',l:'Status',pill:true}],
    fields:[
      {k:'name',l:'Chapter Name',type:'text',req:true},
      {k:'board',l:'Board',type:'select',opts:BOARD_OPTIONS,def:BOARD_OPTIONS[0],req:true},
      {k:'className',l:'Class',type:'select',opts:CLASS_OPTIONS,def:'Class 1',req:true},
      {k:'subjectId',l:'Subject',type:'relation',rel:'subjects',req:true,filterBy:['board','className']},
      {k:'status',l:'Status',type:'select',opts:['Active','Inactive'],def:'Active'}
    ]
  },
  topics: {
    label:'Topics', singular:'Topic', icon:'fa-bookmark', collection:'topics',
    columns:[{k:'name',l:'Topic Name'},{k:'board',l:'Board'},{k:'className',l:'Class'},{k:'chapterName',l:'Chapter'},{k:'status',l:'Status',pill:true}],
    fields:[
      {k:'name',l:'Topic Name',type:'text',req:true},
      {k:'board',l:'Board',type:'select',opts:BOARD_OPTIONS,def:BOARD_OPTIONS[0],req:true},
      {k:'className',l:'Class',type:'select',opts:CLASS_OPTIONS,def:'Class 1',req:true},
      {k:'chapterId',l:'Chapter',type:'relation',rel:'chapters',req:true,filterBy:['board','className']},
      {k:'status',l:'Status',type:'select',opts:['Published','Draft'],def:'Draft'}
    ]
  },
  quizzes: {
    label:'Quizzes', singular:'Quiz', icon:'fa-file-circle-check', collection:'quizzes',
    columns:[{k:'title',l:'Quiz Title'},{k:'subjectName',l:'Subject'},{k:'chapterName',l:'Chapter'},{k:'topicName',l:'Topic'},{k:'subtopic',l:'Subtopic'},{k:'status',l:'Status',pill:true}],
    fields:[
      {k:'title',l:'Quiz Title',type:'text',req:true},
      {k:'board',l:'Board',type:'select',opts:BOARD_OPTIONS,def:BOARD_OPTIONS[0],req:true},
      {k:'className',l:'Class',type:'select',opts:CLASS_OPTIONS,def:'Class 1',req:true},
      {k:'subjectId',l:'Subject',type:'relation',rel:'subjects',req:true,filterBy:['board','className']},
      {k:'chapterId',l:'Chapter',type:'relation',rel:'chapters',req:true,filterBy:['subjectId']},
      {k:'topicId',l:'Topic',type:'relation',rel:'topics',req:true,filterBy:['chapterId']},
      {k:'subtopic',l:'Subtopic',type:'text',req:true,ph:'e.g. Types of Reactions'},
      {k:'status',l:'Status',type:'select',opts:['Published','Draft'],def:'Draft'}
    ]
  },
  questions: {
    label:'Questions', singular:'Question', icon:'fa-circle-question', collection:'questions',
    columns:[{k:'text',l:'Question'},{k:'quizName',l:'Quiz'},{k:'correctAnswer',l:'Correct Answer'}],
    fields:[
      {k:'quizId',l:'Quiz',type:'relation',rel:'quizzes',req:true},
      {k:'text',l:'Question Text',type:'textarea',req:true},
      {k:'optionA',l:'Option A',type:'text',req:true},
      {k:'optionB',l:'Option B',type:'text',req:true},
      {k:'optionC',l:'Option C',type:'text'},
      {k:'optionD',l:'Option D',type:'text'},
      {k:'correctAnswer',l:'Correct Answer',type:'text',req:true,ph:'Must match one option exactly'}
    ]
  },
  results: {
    label:'Results', singular:'Result', icon:'fa-square-poll-vertical', collection:'quizAttempts', readOnlyAdd:false,
    columns:[{k:'studentName',l:'Student'},{k:'quizName',l:'Quiz'},{k:'score',l:'Score'},{k:'createdAt',l:'Date',date:true}],
    fields:[
      {k:'studentId',l:'Student',type:'relation',rel:'students',req:true},
      {k:'quizId',l:'Quiz',type:'relation',rel:'quizzes',req:true},
      {k:'score',l:'Score (%)',type:'number',req:true}
    ]
  }
};
const ENTITY_KEYS = Object.keys(ENTITIES);
const entityCache = {}; // key -> array of docs (live)

function labelFor(iconColor){
  const map = {purple:['fa-user-graduate','var(--purple)','var(--purple-bg)'],green:[null,'var(--green)','var(--green-bg)'],blue:[null,'var(--blue)','var(--blue-bg)'],orange:[null,'var(--orange)','var(--orange-bg)'],pink:[null,'var(--pink)','var(--pink-bg)'],indigo:[null,'var(--indigo)','var(--indigo-bg)']};
  return map[iconColor] || map.purple;
}

/* Render generic list page + wire up onSnapshot */
function renderEntityPage(key){
  const cfg = ENTITIES[key];
  const page = document.getElementById('page-'+key);
  const studentQuizMode = (key==='quizzes' && isStudentRole());
  if(studentQuizMode){
    quizBrowsePath = {};
    page.innerHTML = `
      <div class="page-head"><div><h2>Quizzes</h2><p>Browse by Board → Class → Subject → Chapter → Topic → Subtopic, then attempt a quiz.</p></div></div>
      <div class="ai-breadcrumb" id="quizBreadcrumb"></div>
      <div class="table-panel"><div class="cat-grid" id="quizGrid"></div></div>
    `;
    document.getElementById('quizGrid').addEventListener('click', onQuizGridClick);
  } else {
    const readOnly = isReadOnlyForEntity(key);
    page.innerHTML = `
      <div class="page-head">
        <div><h2>${cfg.label}</h2><p>${readOnly ? `View ${cfg.label.toLowerCase()} for your assigned subjects.` : `Manage all ${cfg.label.toLowerCase()} in the portal.`}</p></div>
        ${readOnly ? '' : `<button class="btn btn-primary" id="addBtn-${key}"><i class="fa-solid fa-plus"></i> Add ${cfg.singular}</button>`}
      </div>
      <div class="table-panel"><div style="overflow-x:auto;"><table id="table-${key}"></table></div></div>
    `;
    if(!readOnly) document.getElementById('addBtn-'+key).addEventListener('click', ()=>openEntityModal(key));
  }

  const colRef = collection(db, cfg.collection);
  onSnapshot(colRef, (snap)=>{
    const rows = snap.docs.map(d=>({id:d.id, ...d.data()}));
    rows.sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
    entityCache[key] = rows;
    rehydrateAll();
  }, (err)=>{ console.warn(key, err); });
}

// Re-run relation-name hydration for every entity (so e.g. a Subjects update
// also refreshes the "Subject" name column shown on Chapters) then re-render.
function rehydrateAll(){
  ENTITY_KEYS.forEach(k=>hydrateRelations(k, entityCache[k]||[]));
  ENTITY_KEYS.forEach(k=>renderEntityTable(k));
  if(isStudentRole()) renderQuizBrowser();
  refreshDependentViews();
  renderCuAssignedSubjects();
  renderCuAssignedStudents();
}

function hydrateRelations(key, rows){
  const cfg = ENTITIES[key];
  // resolve display names for relation fields used as columns e.g. subjectName from subjectId
  cfg.columns.forEach(col=>{
    if(col.k.endsWith('Name')){
      const base = col.k.replace('Name','Id');
      const relField = cfg.fields.find(f=>f.k===base);
      if(relField && relField.rel){
        rows.forEach(r=>{
          const relRows = entityCache[relField.rel] || [];
          const match = relRows.find(x=>x.id===r[base]);
          r[col.k] = match ? (match.name || match.title || '—') : '—';
        });
      }
    }
  });
}

function renderEntityTable(key){
  const cfg = ENTITIES[key];
  const rows = visibleEntityRows(key);
  const tbl = document.getElementById('table-'+key);
  if(!tbl) return;
  const readOnly = isReadOnlyForEntity(key);
  if(!rows.length){
    const emptyMsg = isRestrictedRole() ? 'Nothing has been assigned to you yet.' : `Click "Add ${cfg.singular}" to create the first one.`;
    tbl.innerHTML = `<tr><td colspan="${cfg.columns.length+1}"><div class="empty-state"><i class="fa-solid ${cfg.icon}"></i><h4>No ${cfg.label.toLowerCase()} yet</h4><p>${emptyMsg}</p></div></td></tr>`;
    return;
  }
  tbl.innerHTML = `<thead><tr>${cfg.columns.map(c=>`<th>${c.l}</th>`).join('')}<th></th></tr></thead>
    <tbody>${rows.map(r=>`<tr>${cfg.columns.map(c=>renderCell(c,r)).join('')}
      <td style="text-align:right;white-space:nowrap;">
        ${readOnly ? '' : `<button class="icon-btn" onclick="openEntityModal('${key}','${r.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="icon-btn danger" onclick="deleteEntity('${key}','${r.id}')"><i class="fa-solid fa-trash"></i></button>`}
      </td></tr>`).join('')}</tbody>`;
}
function renderCell(col, row){
  let val = row[col.k];
  if(col.date) val = val ? new Date(val).toLocaleDateString('en-IN') : '—';
  if(col.relList){
    const ids = Array.isArray(val) ? val : [];
    const names = ids.map(id=>{ const item=(entityCache[col.relList]||[]).find(x=>x.id===id); return item ? (item.name||item.title) : null; }).filter(Boolean);
    return `<td>${names.length ? names.map(n=>`<span class="subject-chip">${escapeHtml(n)}</span>`).join('') : '<span style="color:var(--text-3);">— None —</span>'}</td>`;
  }
  if(col.pill) return `<td><span class="pill pill-${val}">${val||'—'}</span></td>`;
  if(col.progress) return `<td><span class="progress-bar"><span style="width:${val||0}%;"></span></span>${val||0}%</td>`;
  if(col.k==='text' && typeof val==='string') val = val.length>60 ? val.slice(0,60)+'…' : val;
  return `<td>${val!==undefined && val!==null && val!=='' ? escapeHtml(String(val)) : '—'}</td>`;
}
function escapeHtml(s){ return s.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

window.deleteEntity = async function(key, id){
  if(!confirm('Delete this record? This cannot be undone.')) return;
  try{
    await deleteDoc(doc(db, ENTITIES[key].collection, id));
    showToast(`${ENTITIES[key].singular} deleted.`);
  }catch(err){ showToast(err.message, true); }
};

/* -------- Modal (add/edit) for entities -------- */
let modalCtx = null;
window.openEntityModal = function(key, editId){
  const cfg = ENTITIES[key];
  const editing = editId ? (entityCache[key]||[]).find(r=>r.id===editId) : null;
  modalCtx = { key, editId };
  document.getElementById('modalTitle').textContent = (editing?'Edit ':'Add ') + cfg.singular;
  document.getElementById('modalBody').innerHTML = cfg.fields.map(f=>renderField(f, editing, cfg.fields)).join('');
  wireCascadingFields(cfg);
  document.getElementById('modalOverlay').classList.add('show');
  document.getElementById('modalBox').classList.remove('wide');
  document.getElementById('modalSaveBtn').style.display = '';
  document.getElementById('modalCancelBtn').textContent = 'Cancel';
  document.getElementById('modalSaveBtn').textContent = 'Save';
  document.getElementById('modalSaveBtn').onclick = ()=>saveEntity(key, editId);
};
function renderField(f, editing, cfgFields){
  const val = editing ? (editing[f.k] ?? '') : (f.def ?? '');
  if(f.type==='select'){
    return `<div class="f-group"><label class="f-label">${f.l}</label><select class="f-input" style="padding-left:.9rem;" id="fld-${f.k}">
      ${f.opts.map(o=>`<option value="${o}" ${o===val?'selected':''}>${o}</option>`).join('')}
    </select></div>`;
  }
  if(f.type==='textarea'){
    return `<div class="f-group"><label class="f-label">${f.l}</label><textarea class="f-input" style="padding-left:.9rem;min-height:90px;" id="fld-${f.k}">${escapeHtml(String(val))}</textarea></div>`;
  }
  if(f.type==='multiselect'){
    const opts = entityCache[f.rel] || [];
    const selected = new Set(Array.isArray(val) ? val : []);
    return `<div class="f-group"><label class="f-label">${f.l}</label>
      <div class="ms-box" id="fld-${f.k}">
        ${opts.length ? opts.map(o=>`<label class="ms-opt"><input type="checkbox" value="${o.id}" ${selected.has(o.id)?'checked':''}> ${escapeHtml(o.name||o.title||o.id)} <span style="color:var(--text-3);font-size:.72rem;">${o.board&&o.className ? `(${escapeHtml(o.board)} • ${escapeHtml(o.className)})` : ''}</span></label>`).join('')
          : `<p style="font-size:.78rem;color:var(--text-3);">No subjects yet — add some in Academic Management first.</p>`}
      </div>
    </div>`;
  }
  if(f.type==='relation'){
    let opts = visibleEntityRows(f.rel);
    let placeholder = `— Select ${f.l} —`;
    if(f.filterBy){
      const filterKeys = Array.isArray(f.filterBy) ? f.filterBy : [f.filterBy];
      const filterVals = filterKeys.map(fb=>{
        const filterField = (cfgFields||[]).find(x=>x.k===fb);
        return editing ? (editing[fb] ?? '') : (filterField ? (filterField.def ?? '') : '');
      });
      opts = opts.filter(o=>filterKeys.every((fb,i)=>o[fb]===filterVals[i]));
      const missingIdx = filterVals.findIndex(v=>!v);
      if(missingIdx > -1){
        const missingField = (cfgFields||[]).find(x=>x.k===filterKeys[missingIdx]);
        placeholder = `— Select ${missingField ? missingField.l : filterKeys[missingIdx]} first —`;
      }
    }
    return `<div class="f-group"><label class="f-label">${f.l}</label><select class="f-input" style="padding-left:.9rem;" id="fld-${f.k}">
      <option value="">${placeholder}</option>
      ${opts.map(o=>`<option value="${o.id}" ${o.id===val?'selected':''}>${escapeHtml(o.name||o.title||o.id)}</option>`).join('')}
    </select></div>`;
  }
  return `<div class="f-group"><label class="f-label">${f.l}</label><input class="f-input" style="padding-left:.9rem;" type="${f.type}" id="fld-${f.k}" placeholder="${f.ph||''}" value="${escapeHtml(String(val))}"></div>`;
}

// When a field (e.g. Board or Class) that another relation field filters by
// changes, repopulate that dependent field's options to match the new combo.
function wireCascadingFields(cfg){
  cfg.fields.forEach(f=>{
    if(f.type==='relation' && f.filterBy){
      const filterKeys = Array.isArray(f.filterBy) ? f.filterBy : [f.filterBy];
      const targetEl = document.getElementById('fld-'+f.k);
      if(!targetEl) return;
      const sourceEls = filterKeys.map(fb=>document.getElementById('fld-'+fb)).filter(Boolean);
      if(!sourceEls.length) return;
      const updateFn = ()=>{
        const vals = filterKeys.map(fb=>{
          const el = document.getElementById('fld-'+fb);
          return el ? el.value : '';
        });
        const opts = visibleEntityRows(f.rel).filter(o=>filterKeys.every((fb,i)=>o[fb]===vals[i]));
        targetEl.innerHTML = `<option value="">— Select ${f.l} —</option>` +
          opts.map(o=>`<option value="${o.id}">${escapeHtml(o.name||o.title||o.id)}</option>`).join('');
      };
      sourceEls.forEach(el=>el.addEventListener('change', updateFn));
    }
  });
}
window.closeModal = function(){
  document.getElementById('modalOverlay').classList.remove('show');
  document.getElementById('modalBox').classList.remove('wide');
  document.getElementById('modalSaveBtn').style.display = '';
  document.getElementById('modalCancelBtn').textContent = 'Cancel';
  modalCtx=null;
};

async function saveEntity(key, editId){
  const cfg = ENTITIES[key];
  const data = {};
  for(const f of cfg.fields){
    if(f.type==='multiselect'){
      const box = document.getElementById('fld-'+f.k);
      data[f.k] = box ? [...box.querySelectorAll('input[type="checkbox"]:checked')].map(c=>c.value) : [];
      continue;
    }
    const el = document.getElementById('fld-'+f.k);
    let v = el.value;
    if(f.type==='number') v = Number(v||0);
    if(f.req && (v===''||v===undefined)){ showToast(`${f.l} is required.`, true); return; }
    data[f.k] = v;
  }
  const btn = document.getElementById('modalSaveBtn');
  btn.disabled = true; btn.textContent = 'Saving...';
  try{
    if(editId){
      await updateDoc(doc(db, cfg.collection, editId), data);
      showToast(`${cfg.singular} updated.`);
    }else{
      data.createdAt = new Date().toISOString();
      await addDoc(collection(db, cfg.collection), data);
      showToast(`${cfg.singular} added.`);
    }
    closeModal();
  }catch(err){ showToast(err.message, true); }
  finally{ btn.disabled=false; btn.textContent='Save'; }
}

/* =================================================================
   RESOURCE MODULES — generic engine powering AI Knowledge Base,
   Study Materials, Question Bank and Question Paper. Each is a file
   upload categorized as Board → Class → Subject → Chapter → Topic →
   Subtopic, browsed as a drill-down folder view, then viewed inline
   in the portal.
   ================================================================= */
const RESOURCE_MODULES = {
  aiKnowledge:    { key:'aiKnowledge',    label:'AI Knowledge Base', singular:'Knowledge Entry',  icon:'fa-brain',        collection:'aiKnowledge',    itemType:'html',  rows:[], browsePath:{}, uploadFile:null },
  studyMaterials: { key:'studyMaterials', label:'Study Materials',   singular:'Study Material',   icon:'fa-book-open',    collection:'studyMaterials', itemType:'html',  rows:[], browsePath:{}, uploadFile:null },
  questionBank:   { key:'questionBank',   label:'Question Bank',     singular:'Question Bank Item', icon:'fa-list-check', collection:'questionBank',   itemType:'html',  rows:[], browsePath:{}, uploadFile:null },
  questionPaper:  { key:'questionPaper',  label:'Question Paper',    singular:'Question Paper',   icon:'fa-file-lines',   collection:'questionPaper',  itemType:'html',  rows:[], browsePath:{}, uploadFile:null },
  lessons:        { key:'lessons',        label:'Learning Lessons',  singular:'Lesson',           icon:'fa-clapperboard', collection:'lessons',        itemType:'video', rows:[], browsePath:{}, uploadFile:null }
};
const AI_MAX_FILE_BYTES = 800 * 1024; // keep comfortably under Firestore's 1MB doc limit
let activeViewerModule = null; // which RESOURCE_MODULES entry the inline viewer is currently showing

function initResourceModule(cfg){
  const readOnly = isReadOnlyForModule(cfg.key);
  const addBtn = document.getElementById('addBtn-'+cfg.key);
  if(readOnly){ if(addBtn) addBtn.style.display = 'none'; }
  else if(addBtn){ addBtn.addEventListener('click', ()=>openResourceUploadModal(cfg)); }
  document.getElementById('grid-'+cfg.key).addEventListener('click', (e)=>{
    const card = e.target.closest('[data-cat]');
    if(!card) return;
    const level = card.dataset.level;
    const p = cfg.browsePath;
    if(level==='board'){ cfg.browsePath = { board: card.dataset.value }; }
    else if(level==='class'){ p.className = card.dataset.value; }
    else if(level==='subject'){ p.subjectId = card.dataset.id; p.subjectName = card.dataset.value; }
    else if(level==='chapter'){ p.chapterId = card.dataset.id; p.chapterName = card.dataset.value; }
    else if(level==='topic'){ p.topicId = card.dataset.id; p.topicName = card.dataset.value; }
    else if(level==='subtopic'){ p.subtopic = card.dataset.value; }
    else if(level==='file'){
      if(cfg.itemType==='video') viewLessonVideo(cfg.key, card.dataset.id);
      else viewResource(cfg.key, card.dataset.id);
      return;
    }
    renderResourceBrowser(cfg);
  });
  onSnapshot(collection(db, cfg.collection), (snap)=>{
    cfg.rows = snap.docs.map(d=>({id:d.id, ...d.data()}));
    cfg.rows.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
    renderResourceBrowser(cfg);
    if(cfg.key==='lessons') refreshDependentViews(); // keeps the dashboard's "Active Lessons" stat in sync
  }, (err)=>{ console.warn(cfg.key, err); });
}

function escapeAttr(s){ return String(s).replace(/"/g,'&quot;'); }
function emptyCatState(icon, title, msg){
  return `<div class="empty-state" style="grid-column:1/-1;"><i class="fa-solid ${icon}"></i><h4>${title}</h4><p>${msg}</p></div>`;
}
function catCard(level, id, value, label, count, icon){
  return `<div class="cat-card" data-cat data-level="${level}" data-id="${escapeAttr(id)}" data-value="${escapeAttr(value)}" title="${escapeAttr(label)}">
    <div class="cc-icon"><i class="fa-solid ${icon}"></i></div>
    <div class="cc-title">${escapeHtml(label)}</div>
    <div class="cc-sub">${count} item${count===1?'':'s'}</div>
  </div>`;
}

function renderResourceBreadcrumb(cfg){
  const el = document.getElementById('breadcrumb-'+cfg.key);
  if(!el) return;
  const p = cfg.browsePath;
  const crumbs = [{label:cfg.label, path:{}}];
  if(p.board) crumbs.push({label:p.board, path:{board:p.board}});
  if(p.className) crumbs.push({label:p.className, path:{board:p.board, className:p.className}});
  if(p.subjectId) crumbs.push({label:p.subjectName, path:{board:p.board, className:p.className, subjectId:p.subjectId, subjectName:p.subjectName}});
  if(p.chapterId) crumbs.push({label:p.chapterName, path:{board:p.board, className:p.className, subjectId:p.subjectId, subjectName:p.subjectName, chapterId:p.chapterId, chapterName:p.chapterName}});
  if(p.topicId) crumbs.push({label:p.topicName, path:{board:p.board, className:p.className, subjectId:p.subjectId, subjectName:p.subjectName, chapterId:p.chapterId, chapterName:p.chapterName, topicId:p.topicId, topicName:p.topicName}});
  if(p.subtopic) crumbs.push({label:p.subtopic, path:{...p}});
  el.innerHTML = crumbs.map((c,i)=>{
    const isLast = i===crumbs.length-1;
    return `<span class="crumb ${isLast?'current':''}" data-idx="${i}">${escapeHtml(c.label)}</span>` + (isLast?'':'<span class="sep">/</span>');
  }).join('');
  el.querySelectorAll('.crumb:not(.current)').forEach(elm=>{
    elm.addEventListener('click', ()=>{ cfg.browsePath = crumbs[Number(elm.dataset.idx)].path; renderResourceBrowser(cfg); });
  });
}

function renderResourceBrowser(cfg){
  renderResourceBreadcrumb(cfg);
  const grid = document.getElementById('grid-'+cfg.key);
  if(!grid) return;
  const p = cfg.browsePath;
  if(!p.board) return renderResBoardLevel(cfg, grid);
  if(!p.className) return renderResClassLevel(cfg, grid);
  if(!p.subjectId) return renderResSubjectLevel(cfg, grid);
  if(!p.chapterId) return renderResChapterLevel(cfg, grid);
  if(!p.topicId) return renderResTopicLevel(cfg, grid);
  if(!p.subtopic) return renderResSubtopicLevel(cfg, grid);
  return renderResFileLevel(cfg, grid);
}
function renderResBoardLevel(cfg, grid){
  const counts = {};
  visibleRows(cfg).forEach(r=>{ counts[r.board] = (counts[r.board]||0)+1; });
  const boards = Object.keys(counts).sort((a,b)=>BOARD_OPTIONS.indexOf(a)-BOARD_OPTIONS.indexOf(b));
  if(!boards.length){
    const msg = isRestrictedRole() ? 'No content has been assigned to you yet.' : `Click "Upload" to add your first ${cfg.singular.toLowerCase()}.`;
    grid.innerHTML = emptyCatState(cfg.icon, 'Nothing uploaded yet', msg); return;
  }
  grid.innerHTML = boards.map(b=>catCard('board', b, b, b, counts[b], 'fa-landmark')).join('');
}
function renderResClassLevel(cfg, grid){
  const rows = visibleRows(cfg).filter(r=>r.board===cfg.browsePath.board);
  const counts = {};
  rows.forEach(r=>{ counts[r.className] = (counts[r.className]||0)+1; });
  const classes = Object.keys(counts).sort((a,b)=>CLASS_OPTIONS.indexOf(a)-CLASS_OPTIONS.indexOf(b));
  if(!classes.length){ grid.innerHTML = emptyCatState('fa-layer-group','No classes yet','No uploads found for this board.'); return; }
  grid.innerHTML = classes.map(c=>catCard('class', c, c, c, counts[c], 'fa-layer-group')).join('');
}
function renderResSubjectLevel(cfg, grid){
  const rows = visibleRows(cfg).filter(r=>r.board===cfg.browsePath.board && r.className===cfg.browsePath.className);
  const map = {};
  rows.forEach(r=>{ if(!map[r.subjectId]) map[r.subjectId]={name:r.subjectName,count:0}; map[r.subjectId].count++; });
  const items = Object.entries(map);
  if(!items.length){ grid.innerHTML = emptyCatState('fa-book','No subjects yet','No uploads found for this class.'); return; }
  grid.innerHTML = items.map(([id,v])=>catCard('subject', id, v.name, v.name, v.count, 'fa-book')).join('');
}
function renderResChapterLevel(cfg, grid){
  const rows = visibleRows(cfg).filter(r=>r.board===cfg.browsePath.board && r.className===cfg.browsePath.className && r.subjectId===cfg.browsePath.subjectId);
  const map = {};
  rows.forEach(r=>{ if(!map[r.chapterId]) map[r.chapterId]={name:r.chapterName,count:0}; map[r.chapterId].count++; });
  const items = Object.entries(map);
  if(!items.length){ grid.innerHTML = emptyCatState('fa-layer-group','No chapters yet','No uploads found for this subject.'); return; }
  grid.innerHTML = items.map(([id,v])=>catCard('chapter', id, v.name, v.name, v.count, 'fa-layer-group')).join('');
}
function renderResTopicLevel(cfg, grid){
  const rows = visibleRows(cfg).filter(r=>r.board===cfg.browsePath.board && r.className===cfg.browsePath.className && r.subjectId===cfg.browsePath.subjectId && r.chapterId===cfg.browsePath.chapterId);
  const map = {};
  rows.forEach(r=>{ if(!map[r.topicId]) map[r.topicId]={name:r.topicName,count:0}; map[r.topicId].count++; });
  const items = Object.entries(map);
  if(!items.length){ grid.innerHTML = emptyCatState('fa-bookmark','No topics yet','No uploads found for this chapter.'); return; }
  grid.innerHTML = items.map(([id,v])=>catCard('topic', id, v.name, v.name, v.count, 'fa-bookmark')).join('');
}
function renderResSubtopicLevel(cfg, grid){
  const rows = visibleRows(cfg).filter(r=>r.board===cfg.browsePath.board && r.className===cfg.browsePath.className && r.subjectId===cfg.browsePath.subjectId && r.chapterId===cfg.browsePath.chapterId && r.topicId===cfg.browsePath.topicId);
  const map = {};
  rows.forEach(r=>{ map[r.subtopic] = (map[r.subtopic]||0)+1; });
  const items = Object.entries(map);
  if(!items.length){ grid.innerHTML = emptyCatState('fa-tags','No subtopics yet','No uploads found for this topic.'); return; }
  grid.innerHTML = items.map(([name,count])=>catCard('subtopic', name, name, name, count, 'fa-tags')).join('');
}
function renderResFileLevel(cfg, grid){
  const p = cfg.browsePath;
  const rows = visibleRows(cfg).filter(r=>r.board===p.board && r.className===p.className && r.subjectId===p.subjectId && r.chapterId===p.chapterId && r.topicId===p.topicId && r.subtopic===p.subtopic);
  const isVideo = cfg.itemType==='video';
  const readOnly = isReadOnlyForModule(cfg.key);
  if(!rows.length){ grid.innerHTML = emptyCatState(isVideo?'fa-clapperboard':'fa-file-code', isVideo?'No lessons yet':'No files yet', isVideo?'No lesson videos added here yet.':'No files uploaded here yet.'); return; }
  grid.innerHTML = rows.map(r=>`
    <div class="file-card" data-cat data-level="file" data-id="${r.id}">
      <div class="fc-icon"><i class="fa-${isVideo?'solid fa-circle-play':'regular fa-file-code'}"></i></div>
      <div style="flex:1;min-width:0;">
        <div class="fc-title">${escapeHtml((isVideo ? r.name : r.fileName) || 'Untitled')}</div>
        <div class="fc-sub">${isVideo?'Added':'Uploaded'} ${r.createdAt?new Date(r.createdAt).toLocaleDateString('en-IN'):''}</div>
      </div>
      <div class="fc-actions">
        <button class="icon-btn" title="View"><i class="fa-solid ${isVideo?'fa-play':'fa-eye'}"></i></button>
        ${readOnly ? '' : `<button class="icon-btn danger" title="Delete" onclick="event.stopPropagation();deleteResource('${cfg.key}','${r.id}')"><i class="fa-solid fa-trash"></i></button>`}
      </div>
    </div>`).join('');
}

/* ---- Upload modal with cascading Board → Class → Subject → Chapter → Topic, + Subtopic + file ---- */
function openResourceUploadModal(cfg){
  cfg.uploadFile = null;
  const isVideo = cfg.itemType==='video';
  document.getElementById('modalTitle').textContent = isVideo ? 'Add Lesson' : `Upload ${cfg.singular}`;
  document.getElementById('modalBody').innerHTML = `
    <div class="f-group"><label class="f-label">Board</label>
      <select class="f-input" style="padding-left:.9rem;" id="resBoard">
        <option value="">— Select Board —</option>
        ${BOARD_OPTIONS.map(b=>`<option value="${b}">${b}</option>`).join('')}
      </select>
    </div>
    <div class="f-group"><label class="f-label">Class</label>
      <select class="f-input" style="padding-left:.9rem;" id="resClass" disabled><option value="">— Select Board first —</option></select>
    </div>
    <div class="f-group"><label class="f-label">Subject</label>
      <select class="f-input" style="padding-left:.9rem;" id="resSubject" disabled><option value="">— Select Class first —</option></select>
      <p id="resSubjectHint" style="font-size:.72rem;color:var(--text-3);margin-top:.35rem;"></p>
    </div>
    <div class="f-group"><label class="f-label">Chapter</label>
      <select class="f-input" style="padding-left:.9rem;" id="resChapter" disabled><option value="">— Select Subject first —</option></select>
      <p id="resChapterHint" style="font-size:.72rem;color:var(--text-3);margin-top:.35rem;"></p>
    </div>
    <div class="f-group"><label class="f-label">Topic</label>
      <select class="f-input" style="padding-left:.9rem;" id="resTopic" disabled><option value="">— Select Chapter first —</option></select>
      <p id="resTopicHint" style="font-size:.72rem;color:var(--text-3);margin-top:.35rem;"></p>
    </div>
    <div class="f-group"><label class="f-label">Subtopic</label>
      <input class="f-input" style="padding-left:.9rem;" id="resSubtopic" list="resSubtopicList" placeholder="e.g. Types of Reactions" autocomplete="off">
      <datalist id="resSubtopicList"></datalist>
    </div>
    ${isVideo ? `
    <div class="f-group"><label class="f-label">Lesson Name</label>
      <input class="f-input" style="padding-left:.9rem;" id="resLessonName" placeholder="e.g. Part 1: Introduction">
    </div>
    <div class="f-group"><label class="f-label">Video Link (Google Drive or YouTube)</label>
      <input class="f-input" style="padding-left:.9rem;" id="resVideoUrl" placeholder="https://drive.google.com/file/d/.../view">
    </div>
    ` : `
    <div class="f-group">
      <label class="f-label">HTML File</label>
      <input class="f-input" style="padding-left:.9rem;" type="file" id="resFile" accept=".html,.htm,text/html">
      <p id="resFileHint" style="font-size:.72rem;color:var(--text-3);margin-top:.35rem;">Accepts .html files up to ~800KB.</p>
    </div>
    `}
  `;
  document.getElementById('resBoard').addEventListener('change', ()=>onResBoardChange(cfg));
  document.getElementById('resClass').addEventListener('change', ()=>onResClassChange(cfg));
  document.getElementById('resSubject').addEventListener('change', ()=>onResSubjectChange(cfg));
  document.getElementById('resChapter').addEventListener('change', ()=>onResChapterChange(cfg));
  document.getElementById('resTopic').addEventListener('change', ()=>onResTopicChange(cfg));
  if(isVideo){
    // no file reader needed — plain text inputs
  } else {
    document.getElementById('resFile').addEventListener('change', (e)=>onResFileChange(e, cfg));
  }
  document.getElementById('modalOverlay').classList.add('show');
  document.getElementById('modalBox').classList.remove('wide');
  document.getElementById('modalSaveBtn').style.display = '';
  document.getElementById('modalCancelBtn').textContent = 'Cancel';
  document.getElementById('modalSaveBtn').textContent = isVideo ? 'Add Lesson' : 'Upload';
  document.getElementById('modalSaveBtn').onclick = ()=>saveResource(cfg);

  // Pre-fill from wherever you're currently browsing, to speed up uploads in context.
  const p = cfg.browsePath;
  if(p.board){
    document.getElementById('resBoard').value = p.board;
    onResBoardChange(cfg);
    if(p.className){
      document.getElementById('resClass').value = p.className;
      onResClassChange(cfg);
      if(p.subjectId){
        document.getElementById('resSubject').value = p.subjectId;
        onResSubjectChange(cfg);
        if(p.chapterId){
          document.getElementById('resChapter').value = p.chapterId;
          onResChapterChange(cfg);
          if(p.topicId){
            document.getElementById('resTopic').value = p.topicId;
            onResTopicChange(cfg);
          }
        }
      }
    }
    if(p.subtopic) document.getElementById('resSubtopic').value = p.subtopic;
  }
}
function onResBoardChange(cfg){
  const board = document.getElementById('resBoard').value;
  const clsSel = document.getElementById('resClass');
  clsSel.disabled = !board;
  clsSel.innerHTML = board
    ? `<option value="">— Select Class —</option>${CLASS_OPTIONS.map(c=>`<option value="${c}">${c}</option>`).join('')}`
    : `<option value="">— Select Board first —</option>`;
  resetResSubjectField();
}
function onResClassChange(cfg){
  const board = document.getElementById('resBoard').value;
  const cls = document.getElementById('resClass').value;
  const subjSel = document.getElementById('resSubject');
  const subjHint = document.getElementById('resSubjectHint');
  const subjects = (entityCache.subjects||[]).filter(s=>s.board===board && s.className===cls && subjectAllowed(s.id));
  subjSel.disabled = !cls;
  subjSel.innerHTML = cls
    ? `<option value="">— Select Subject —</option>${subjects.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}`
    : `<option value="">— Select Class first —</option>`;
  subjHint.textContent = (cls && !subjects.length) ? (isMentor() ? `You don't have any assigned subjects for ${board} ${cls}.` : `No subjects added for ${board} ${cls} yet — add one in Academic Management → Subjects first.`) : '';
  resetResChapterField();
}
function onResSubjectChange(cfg){
  const subjId = document.getElementById('resSubject').value;
  const chapSel = document.getElementById('resChapter');
  const chapHint = document.getElementById('resChapterHint');
  const chapters = (entityCache.chapters||[]).filter(c=>c.subjectId===subjId);
  chapSel.disabled = !subjId;
  chapSel.innerHTML = subjId
    ? `<option value="">— Select Chapter —</option>${chapters.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}`
    : `<option value="">— Select Subject first —</option>`;
  chapHint.textContent = (subjId && !chapters.length) ? `No chapters added for this subject yet — add one in Academic Management → Chapters first.` : '';
  resetResTopicField();
}
function onResChapterChange(cfg){
  const chapId = document.getElementById('resChapter').value;
  const topicSel = document.getElementById('resTopic');
  const topicHint = document.getElementById('resTopicHint');
  const topics = (entityCache.topics||[]).filter(t=>t.chapterId===chapId);
  topicSel.disabled = !chapId;
  topicSel.innerHTML = chapId
    ? `<option value="">— Select Topic —</option>${topics.map(t=>`<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}`
    : `<option value="">— Select Chapter first —</option>`;
  topicHint.textContent = (chapId && !topics.length) ? `No topics added for this chapter yet — add one in Academic Management → Topics first.` : '';
  document.getElementById('resSubtopic').value = '';
  document.getElementById('resSubtopicList').innerHTML = '';
}
function onResTopicChange(cfg){
  const topicId = document.getElementById('resTopic').value;
  const list = document.getElementById('resSubtopicList');
  const existing = [...new Set(cfg.rows.filter(r=>r.topicId===topicId).map(r=>r.subtopic).filter(Boolean))];
  list.innerHTML = existing.map(s=>`<option value="${escapeHtml(s)}"></option>`).join('');
}
function resetResSubjectField(){
  const subjSel = document.getElementById('resSubject');
  subjSel.disabled = true;
  subjSel.innerHTML = `<option value="">— Select Class first —</option>`;
  document.getElementById('resSubjectHint').textContent = '';
  resetResChapterField();
}
function resetResChapterField(){
  const chapSel = document.getElementById('resChapter');
  chapSel.disabled = true;
  chapSel.innerHTML = `<option value="">— Select Subject first —</option>`;
  document.getElementById('resChapterHint').textContent = '';
  resetResTopicField();
}
function resetResTopicField(){
  const topicSel = document.getElementById('resTopic');
  topicSel.disabled = true;
  topicSel.innerHTML = `<option value="">— Select Chapter first —</option>`;
  document.getElementById('resTopicHint').textContent = '';
  document.getElementById('resSubtopic').value = '';
  document.getElementById('resSubtopicList').innerHTML = '';
}
function onResFileChange(e, cfg){
  const file = e.target.files[0];
  const hint = document.getElementById('resFileHint');
  if(!file) return;
  if(file.size > AI_MAX_FILE_BYTES){
    hint.style.color = 'var(--red)';
    hint.textContent = `File is too large (${Math.round(file.size/1024)}KB). Please keep it under ~800KB.`;
    e.target.value = '';
    cfg.uploadFile = null;
    return;
  }
  const reader = new FileReader();
  reader.onload = ()=>{
    cfg.uploadFile = { fileName: file.name, htmlContent: reader.result };
    hint.style.color = 'var(--green)';
    hint.textContent = `Ready to upload: ${file.name} (${Math.round(file.size/1024)}KB)`;
  };
  reader.onerror = ()=>{ hint.style.color = 'var(--red)'; hint.textContent = 'Could not read that file.'; cfg.uploadFile = null; };
  reader.readAsText(file);
}
async function saveResource(cfg){
  const isVideo = cfg.itemType==='video';
  const board = document.getElementById('resBoard').value;
  const className = document.getElementById('resClass').value;
  const subjectId = document.getElementById('resSubject').value;
  const chapterId = document.getElementById('resChapter').value;
  const topicId = document.getElementById('resTopic').value;
  const subtopic = document.getElementById('resSubtopic').value.trim();
  if(!board || !className || !subjectId || !chapterId || !topicId || !subtopic){ showToast('Please fill in Board, Class, Subject, Chapter, Topic and Subtopic.', true); return; }

  let lessonName = '', videoUrl = '';
  if(isVideo){
    lessonName = document.getElementById('resLessonName').value.trim();
    videoUrl = document.getElementById('resVideoUrl').value.trim();
    if(!lessonName || !videoUrl){ showToast('Please fill in Lesson Name and Video Link.', true); return; }
  } else {
    if(!cfg.uploadFile){ showToast('Please choose a file to upload.', true); return; }
  }

  const subject = (entityCache.subjects||[]).find(s=>s.id===subjectId);
  const chapter = (entityCache.chapters||[]).find(c=>c.id===chapterId);
  const topic = (entityCache.topics||[]).find(t=>t.id===topicId);
  const btn = document.getElementById('modalSaveBtn');
  btn.disabled = true; btn.textContent = isVideo ? 'Adding...' : 'Uploading...';
  try{
    const data = {
      board, className, subjectId, subjectName: subject ? subject.name : '',
      chapterId, chapterName: chapter ? chapter.name : '',
      topicId, topicName: topic ? topic.name : '',
      subtopic, status: isVideo ? 'Active' : 'Published', createdAt: new Date().toISOString()
    };
    if(isVideo){ data.name = lessonName; data.videoUrl = videoUrl; }
    else { data.fileName = cfg.uploadFile.fileName; data.htmlContent = cfg.uploadFile.htmlContent; }
    await addDoc(collection(db, cfg.collection), data);
    showToast(isVideo ? 'Lesson added.' : 'Uploaded successfully.');
    closeModal();
    cfg.browsePath = { board, className, subjectId, subjectName: subject?subject.name:'', chapterId, chapterName: chapter?chapter.name:'', topicId, topicName: topic?topic.name:'', subtopic };
    renderResourceBrowser(cfg);
  }catch(err){ showToast(err.message, true); }
  finally{ btn.disabled=false; btn.textContent=isVideo?'Add Lesson':'Upload'; }
}

function viewResource(moduleKey, id){
  const cfg = RESOURCE_MODULES[moduleKey];
  const row = cfg.rows.find(r=>r.id===id);
  if(!row) return;
  activeViewerModule = cfg;
  document.getElementById('aiViewerTitle').textContent = row.fileName || row.subtopic || 'View Content';
  document.getElementById('aiViewerMeta').textContent = [row.board, row.className, row.subjectName, row.chapterName, row.topicName, row.subtopic].filter(Boolean).join(' • ');
  document.getElementById('aiViewerBackBtn').innerHTML = `<i class="fa-solid fa-arrow-left"></i> Back to ${cfg.label}`;
  document.getElementById('aiViewerBackBtn').onclick = ()=>goToPage(cfg.key);
  document.querySelectorAll('.page').forEach(el=>el.classList.remove('active'));
  document.getElementById('page-resourceViewer').classList.add('active');
  document.getElementById('aiViewerFrame').srcdoc = row.htmlContent || '<p style="font-family:sans-serif;padding:1rem;color:#888;">No content.</p>';
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('main').scrollTo(0,0);
}
// Generic fullscreen toggle, reused by both the resource viewer and the lesson video viewer.
window.toggleFullscreenPanel = function(panelId){
  const panel = document.getElementById(panelId);
  const isFull = document.fullscreenElement || document.webkitFullscreenElement;
  if(!isFull){
    (panel.requestFullscreen || panel.webkitRequestFullscreen)?.call(panel);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
  }
};
function updateFullscreenBtns(){
  const isFull = document.fullscreenElement || document.webkitFullscreenElement;
  ['aiFullscreenBtn'].forEach(id=>{
    const btn = document.getElementById(id);
    if(!btn) return;
    btn.innerHTML = isFull ? '<i class="fa-solid fa-compress"></i> Exit Fullscreen' : '<i class="fa-solid fa-expand"></i> Fullscreen';
  });
}
document.addEventListener('fullscreenchange', updateFullscreenBtns);
document.addEventListener('webkitfullscreenchange', updateFullscreenBtns);

/* =================================================================
   LEARNING LESSONS — inline video viewer for uploaded Google Drive
   (or YouTube) links, same "view in the same screen" pattern used
   for AI Knowledge Base / Resources.
   ================================================================= */
function toEmbeddableVideoUrl(url){
  if(!url) return '';
  url = url.trim();
  let m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if(m) return `https://drive.google.com/file/d/${m[1]}/preview`;
  m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if(m) return `https://drive.google.com/file/d/${m[1]}/preview`;
  m = url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/);
  if(m) return `https://www.youtube.com/embed/${m[1]}`;
  m = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
  if(m) return `https://www.youtube.com/embed/${m[1]}`;
  return url; // fallback: try loading whatever was given directly
}
function viewLessonVideo(moduleKey, id){
  const cfg = RESOURCE_MODULES[moduleKey];
  const row = cfg.rows.find(r=>r.id===id);
  if(!row) return;
  document.getElementById('lessonViewerTitle').textContent = row.name || 'Lesson Video';
  document.getElementById('lessonViewerMeta').textContent = [row.board, row.className, row.subjectName, row.chapterName, row.topicName, row.subtopic].filter(Boolean).join(' • ');
  const embedUrl = toEmbeddableVideoUrl(row.videoUrl);
  const isDrive = embedUrl.includes('drive.google.com');
  document.getElementById('lessonVideoWrap').classList.toggle('is-drive', isDrive);
  document.getElementById('lessonViewerFrame').src = embedUrl || '';
  document.querySelectorAll('.page').forEach(el=>el.classList.remove('active'));
  document.getElementById('page-lessonViewer').classList.add('active');
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('main').scrollTo(0,0);
}

window.deleteResource = async function(moduleKey, id){
  if(!confirm('Delete this entry? This cannot be undone.')) return;
  try{ await deleteDoc(doc(db, RESOURCE_MODULES[moduleKey].collection, id)); showToast('Entry deleted.'); }
  catch(err){ showToast(err.message, true); }
}

/* =================================================================
   STUDENT QUIZ BROWSE + ATTEMPT
   Students get a Board → Class → Subject → Chapter → Topic → Subtopic
   drill-down (reusing the same cat-card pattern as the resource
   modules above) that ends in a list of quizzes to actually attempt,
   rather than a read-only table. Submitting writes a real attempt to
   the same 'quizAttempts' collection the Results page reads from.
   ================================================================= */
let quizBrowsePath = {};
function renderQuizBrowser(){
  const grid = document.getElementById('quizGrid');
  if(!grid) return; // not currently on the student Quizzes page
  renderQuizBreadcrumb();
  const p = quizBrowsePath;
  const rows = visibleEntityRows('quizzes').filter(q=>q.status==='Published'); // students only ever see published quizzes
  if(!p.board) return renderQuizBoardLevel(rows, grid);
  if(!p.className) return renderQuizClassLevel(rows, grid);
  if(!p.subjectId) return renderQuizSubjectLevel(rows, grid);
  if(!p.chapterId) return renderQuizChapterLevel(rows, grid);
  if(!p.topicId) return renderQuizTopicLevel(rows, grid);
  if(!p.subtopic) return renderQuizSubtopicLevel(rows, grid);
  return renderQuizListLevel(rows, grid);
}
function renderQuizBreadcrumb(){
  const el = document.getElementById('quizBreadcrumb');
  if(!el) return;
  const p = quizBrowsePath;
  const crumbs = [{label:'Quizzes', path:{}}];
  if(p.board) crumbs.push({label:p.board, path:{board:p.board}});
  if(p.className) crumbs.push({label:p.className, path:{board:p.board, className:p.className}});
  if(p.subjectId) crumbs.push({label:p.subjectName, path:{board:p.board, className:p.className, subjectId:p.subjectId, subjectName:p.subjectName}});
  if(p.chapterId) crumbs.push({label:p.chapterName, path:{...p}});
  if(p.topicId) crumbs.push({label:p.topicName, path:{...p}});
  if(p.subtopic) crumbs.push({label:p.subtopic, path:{...p}});
  el.innerHTML = crumbs.map((c,i)=>{
    const isLast = i===crumbs.length-1;
    return `<span class="crumb ${isLast?'current':''}" data-idx="${i}">${escapeHtml(c.label)}</span>` + (isLast?'':'<span class="sep">/</span>');
  }).join('');
  el.querySelectorAll('.crumb:not(.current)').forEach(elm=>{
    elm.addEventListener('click', ()=>{ quizBrowsePath = crumbs[Number(elm.dataset.idx)].path; renderQuizBrowser(); });
  });
}
function renderQuizBoardLevel(rows, grid){
  const counts = {};
  rows.forEach(r=>{ counts[r.board] = (counts[r.board]||0)+1; });
  const boards = Object.keys(counts).sort((a,b)=>BOARD_OPTIONS.indexOf(a)-BOARD_OPTIONS.indexOf(b));
  if(!boards.length){ grid.innerHTML = emptyCatState('fa-file-circle-check','No quizzes yet','No quizzes have been published for your assigned subjects yet.'); return; }
  grid.innerHTML = boards.map(b=>catCard('board', b, b, b, counts[b], 'fa-landmark')).join('');
}
function renderQuizClassLevel(rows, grid){
  const filtered = rows.filter(r=>r.board===quizBrowsePath.board);
  const counts = {};
  filtered.forEach(r=>{ counts[r.className] = (counts[r.className]||0)+1; });
  const classes = Object.keys(counts).sort((a,b)=>CLASS_OPTIONS.indexOf(a)-CLASS_OPTIONS.indexOf(b));
  if(!classes.length){ grid.innerHTML = emptyCatState('fa-layer-group','No classes yet','No quizzes found for this board.'); return; }
  grid.innerHTML = classes.map(c=>catCard('class', c, c, c, counts[c], 'fa-layer-group')).join('');
}
function renderQuizSubjectLevel(rows, grid){
  const filtered = rows.filter(r=>r.board===quizBrowsePath.board && r.className===quizBrowsePath.className);
  const map = {};
  filtered.forEach(r=>{ if(!map[r.subjectId]) map[r.subjectId]={name:r.subjectName,count:0}; map[r.subjectId].count++; });
  const items = Object.entries(map);
  if(!items.length){ grid.innerHTML = emptyCatState('fa-book','No subjects yet','No quizzes found for this class.'); return; }
  grid.innerHTML = items.map(([id,v])=>catCard('subject', id, v.name, v.name, v.count, 'fa-book')).join('');
}
function renderQuizChapterLevel(rows, grid){
  const filtered = rows.filter(r=>r.board===quizBrowsePath.board && r.className===quizBrowsePath.className && r.subjectId===quizBrowsePath.subjectId);
  const map = {};
  filtered.forEach(r=>{ if(!map[r.chapterId]) map[r.chapterId]={name:r.chapterName,count:0}; map[r.chapterId].count++; });
  const items = Object.entries(map);
  if(!items.length){ grid.innerHTML = emptyCatState('fa-layer-group','No chapters yet','No quizzes found for this subject.'); return; }
  grid.innerHTML = items.map(([id,v])=>catCard('chapter', id, v.name, v.name, v.count, 'fa-layer-group')).join('');
}
function renderQuizTopicLevel(rows, grid){
  const filtered = rows.filter(r=>r.board===quizBrowsePath.board && r.className===quizBrowsePath.className && r.subjectId===quizBrowsePath.subjectId && r.chapterId===quizBrowsePath.chapterId);
  const map = {};
  filtered.forEach(r=>{ if(!map[r.topicId]) map[r.topicId]={name:r.topicName,count:0}; map[r.topicId].count++; });
  const items = Object.entries(map);
  if(!items.length){ grid.innerHTML = emptyCatState('fa-bookmark','No topics yet','No quizzes found for this chapter.'); return; }
  grid.innerHTML = items.map(([id,v])=>catCard('topic', id, v.name, v.name, v.count, 'fa-bookmark')).join('');
}
function renderQuizSubtopicLevel(rows, grid){
  const filtered = rows.filter(r=>r.board===quizBrowsePath.board && r.className===quizBrowsePath.className && r.subjectId===quizBrowsePath.subjectId && r.chapterId===quizBrowsePath.chapterId && r.topicId===quizBrowsePath.topicId);
  const map = {};
  filtered.forEach(r=>{ map[r.subtopic] = (map[r.subtopic]||0)+1; });
  const items = Object.entries(map);
  if(!items.length){ grid.innerHTML = emptyCatState('fa-tags','No subtopics yet','No quizzes found for this topic.'); return; }
  grid.innerHTML = items.map(([name,count])=>catCard('subtopic', name, name, name, count, 'fa-tags')).join('');
}
function renderQuizListLevel(rows, grid){
  const p = quizBrowsePath;
  const filtered = rows.filter(r=>r.board===p.board && r.className===p.className && r.subjectId===p.subjectId && r.chapterId===p.chapterId && r.topicId===p.topicId && r.subtopic===p.subtopic);
  if(!filtered.length){ grid.innerHTML = emptyCatState('fa-file-circle-check','No quizzes yet','No quizzes have been published here yet.'); return; }
  grid.innerHTML = filtered.map(q=>{
    const qCount = (entityCache.questions||[]).filter(qs=>qs.quizId===q.id).length;
    const myUid = currentUser && currentUser.uid;
    const myAttempts = (entityCache.results||[]).filter(r=>r.quizId===q.id && r.studentId===myUid).length;
    return `
    <div class="file-card" data-cat data-level="quiz" data-id="${q.id}" style="cursor:default;">
      <div class="fc-icon"><i class="fa-solid fa-file-circle-check"></i></div>
      <div style="flex:1;min-width:0;">
        <div class="fc-title">${escapeHtml(q.title||'Untitled Quiz')}</div>
        <div class="fc-sub">${qCount} question${qCount===1?'':'s'}${myAttempts?` • Attempted ${myAttempts}×`:''}</div>
      </div>
      <div class="fc-actions">
        ${qCount ? `<button class="btn btn-primary" style="padding:.5rem .9rem;font-size:.78rem;" onclick="event.stopPropagation();startQuizAttempt('${q.id}')">${myAttempts?'Retake':'Attempt'}</button>` : `<span style="font-size:.72rem;color:var(--text-3);">No questions yet</span>`}
      </div>
    </div>`;
  }).join('');
}
function onQuizGridClick(e){
  const card = e.target.closest('[data-cat]');
  if(!card || card.dataset.level==='quiz') return; // quiz cards are handled by their own Attempt button
  const level = card.dataset.level;
  const p = quizBrowsePath;
  if(level==='board') quizBrowsePath = { board: card.dataset.value };
  else if(level==='class') p.className = card.dataset.value;
  else if(level==='subject'){ p.subjectId = card.dataset.id; p.subjectName = card.dataset.value; }
  else if(level==='chapter'){ p.chapterId = card.dataset.id; p.chapterName = card.dataset.value; }
  else if(level==='topic'){ p.topicId = card.dataset.id; p.topicName = card.dataset.value; }
  else if(level==='subtopic'){ p.subtopic = card.dataset.value; }
  renderQuizBrowser();
}

/* ---- The actual attempt: render questions, collect answers, score + save ---- */
let activeQuizAttempt = null; // {quiz, questions, answers:{}}
window.startQuizAttempt = function(quizId){
  const quiz = (entityCache.quizzes||[]).find(q=>q.id===quizId);
  if(!quiz) return;
  const questions = (entityCache.questions||[]).filter(q=>q.quizId===quizId);
  if(!questions.length){ showToast('This quiz has no questions yet.', true); return; }
  activeQuizAttempt = { quiz, questions, answers:{} };
  document.getElementById('quizAttemptTitle').textContent = quiz.title || 'Quiz';
  document.getElementById('quizAttemptMeta').textContent = [quiz.subjectName, quiz.chapterName, quiz.topicName, quiz.subtopic].filter(Boolean).join(' • ');
  renderQuizAttemptForm();
  document.querySelectorAll('.page').forEach(el=>el.classList.remove('active'));
  document.getElementById('page-quizAttempt').classList.add('active');
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('main').scrollTo(0,0);
};
function renderQuizAttemptForm(){
  const panel = document.getElementById('quizAttemptPanel');
  if(!panel || !activeQuizAttempt) return;
  const { questions, answers } = activeQuizAttempt;
  panel.innerHTML = questions.map((q,i)=>{
    const opts = [['A',q.optionA],['B',q.optionB],['C',q.optionC],['D',q.optionD]].filter(([,v])=>v);
    return `
    <div class="quiz-q">
      <div class="quiz-q-title">${i+1}. ${escapeHtml(q.text||'')}</div>
      ${opts.map(([letter,val])=>`
        <label class="quiz-opt ${answers[q.id]===val?'selected':''}">
          <input type="radio" name="q-${q.id}" value="${escapeAttr(val)}" ${answers[q.id]===val?'checked':''}>
          ${escapeHtml(val)}
        </label>`).join('')}
    </div>`;
  }).join('') + `<div style="padding-top:1.2rem;"><button class="btn btn-primary" id="submitQuizBtn"><i class="fa-solid fa-paper-plane"></i> Submit Quiz</button></div>`;

  panel.querySelectorAll('input[type="radio"]').forEach(inp=>{
    inp.addEventListener('change', (e)=>{
      const qid = e.target.name.slice(2);
      activeQuizAttempt.answers[qid] = e.target.value;
      renderQuizAttemptForm();
    });
  });
  document.getElementById('submitQuizBtn').addEventListener('click', submitQuizAttempt);
}
async function submitQuizAttempt(){
  if(!activeQuizAttempt || !currentUser) return;
  const { quiz, questions, answers } = activeQuizAttempt;
  const unanswered = questions.filter(q=>!answers[q.id]).length;
  if(unanswered && !confirm(`You haven't answered ${unanswered} question${unanswered===1?'':'s'}. Submit anyway?`)) return;
  let correct = 0;
  questions.forEach(q=>{ if(answers[q.id] && q.correctAnswer && answers[q.id]===q.correctAnswer) correct++; });
  const score = questions.length ? Math.round((correct/questions.length)*100) : 0;
  const btn = document.getElementById('submitQuizBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Submitting...'; }
  try{
    await addDoc(collection(db,'quizAttempts'), { studentId: currentUser.uid, quizId: quiz.id, score, createdAt: new Date().toISOString() });
    showQuizResultScreen(score, correct, questions.length);
  }catch(err){
    showToast(err.message, true);
    if(btn){ btn.disabled = false; btn.textContent = 'Submit Quiz'; }
  }
}
function showQuizResultScreen(score, correct, total){
  const panel = document.getElementById('quizAttemptPanel');
  if(!panel) return;
  panel.innerHTML = `
    <div style="text-align:center;padding:2.5rem 1rem;">
      <div class="quiz-score-circle">${score}%</div>
      <h3 style="font-size:1.15rem;font-weight:800;margin-bottom:.3rem;">Quiz submitted!</h3>
      <p style="font-size:.85rem;color:var(--text-2);margin-bottom:1.6rem;">You answered ${correct} out of ${total} question${total===1?'':'s'} correctly.</p>
      <div style="display:flex;gap:.7rem;justify-content:center;flex-wrap:wrap;">
        <button class="btn btn-ghost" onclick="goToPage('quizzes')"><i class="fa-solid fa-arrow-left"></i> Back to Quizzes</button>
        <button class="btn btn-primary" onclick="goToPage('results')"><i class="fa-solid fa-square-poll-vertical"></i> View in Results</button>
      </div>
    </div>`;
  activeQuizAttempt = null;
}

/* =================================================================
   CREATE USER (separate auth account via secondary app instance)
   ================================================================= */
function renderCuAssignedSubjects(){
  const box = document.getElementById('cuAssignedSubjects');
  if(!box) return;
  const prevChecked = new Set([...box.querySelectorAll('input:checked')].map(c=>c.value));
  const subs = entityCache.subjects || [];
  box.innerHTML = subs.length
    ? subs.map(s=>`<label class="ms-opt"><input type="checkbox" value="${s.id}" ${prevChecked.has(s.id)?'checked':''}> ${escapeHtml(s.name)} <span style="color:var(--text-3);font-size:.72rem;">(${escapeHtml(s.board)} • ${escapeHtml(s.className)})</span></label>`).join('')
    : `<p style="font-size:.78rem;color:var(--text-3);">No subjects yet — add some in Academic Management first.</p>`;
}
function renderCuAssignedStudents(){
  const box = document.getElementById('cuAssignedStudents');
  if(!box) return;
  const prevChecked = new Set([...box.querySelectorAll('input:checked')].map(c=>c.value));
  const stus = entityCache.students || [];
  box.innerHTML = stus.length
    ? stus.map(s=>`<label class="ms-opt"><input type="checkbox" value="${s.id}" ${prevChecked.has(s.id)?'checked':''}> ${escapeHtml(s.name)} <span style="color:var(--text-3);font-size:.72rem;">(${escapeHtml(s.board||'')} • ${escapeHtml(s.className||'')})</span></label>`).join('')
    : `<p style="font-size:.78rem;color:var(--text-3);">No students yet — add some first.</p>`;
}
document.getElementById('cuRole').addEventListener('change', (e)=>{
  const role = e.target.value;
  const isStudent = role==='student';
  const isMentorRole = role==='mentor';
  const isAdminRole = role==='admin';
  document.getElementById('cuBoardWrap').style.display = isStudent?'block':'none';
  document.getElementById('cuClassWrap').style.display = isStudent?'block':'none';
  document.getElementById('cuSubjectWrap').style.display = isMentorRole?'block':'none';
  document.getElementById('cuAssignedStudentsWrap').style.display = isMentorRole?'block':'none';
  document.getElementById('cuAssignedSubjectsWrap').style.display = isAdminRole?'none':'block';
  document.getElementById('cuAdminNote').style.display = isAdminRole?'flex':'none';
  if(!isAdminRole){
    document.getElementById('cuAssignedSubjectsHint').textContent = isStudent
      ? 'This student will only see content — across every section — for the subjects checked here.'
      : 'This mentor will only see content — Academic Management, AI Learning, Assessments and Resources — for the subjects checked here.';
    renderCuAssignedSubjects();
  }
  if(isMentorRole) renderCuAssignedStudents();
});
document.getElementById('createUserForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const btn = document.getElementById('cuBtn');
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating...';
  const role = document.getElementById('cuRole').value;
  const name = document.getElementById('cuName').value.trim();
  const email = document.getElementById('cuEmail').value.trim();
  const pass = document.getElementById('cuPass').value;
  try{
    const secondaryApp = initializeApp(firebaseConfig, 'Secondary'+Date.now());
    const secondaryAuth = getAuth(secondaryApp);
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
    const uid = cred.user.uid;
    await signOut(secondaryAuth);
    await deleteApp(secondaryApp);

    await setDoc(doc(db,'users',uid), { name, email, role, status:'active', createdAt:new Date().toISOString() });
    if(role==='admin'){
      // Admins get full access purely from role:'admin' on their users/ doc — no extra profile doc needed.
    } else {
      const assignedSubjectIds = [...document.querySelectorAll('#cuAssignedSubjects input[type="checkbox"]:checked')].map(c=>c.value);
      if(role==='student'){
        await setDoc(doc(db,'students',uid), { name, email, board: document.getElementById('cuBoard').value, className: document.getElementById('cuClass').value.trim(), assignedSubjectIds, status:'Active', createdAt:new Date().toISOString() });
      }else{
        const assignedStudentIds = [...document.querySelectorAll('#cuAssignedStudents input[type="checkbox"]:checked')].map(c=>c.value);
        await setDoc(doc(db,'mentors',uid), { name, email, subject: document.getElementById('cuSubject').value.trim(), assignedSubjectIds, assignedStudentIds, status:'Active', createdAt:new Date().toISOString() });
      }
    }
    showToast(`${role.charAt(0).toUpperCase()+role.slice(1)} account created for ${name}.`);
    e.target.reset();
    document.getElementById('cuBoardWrap').style.display = 'block';
    document.getElementById('cuClassWrap').style.display = 'block';
    document.getElementById('cuSubjectWrap').style.display = 'none';
    document.getElementById('cuAssignedStudentsWrap').style.display = 'none';
    document.getElementById('cuAssignedSubjectsWrap').style.display = 'block';
    document.getElementById('cuAdminNote').style.display = 'none';
    document.getElementById('cuAssignedSubjectsHint').textContent = 'This account will only see content — across every section it has access to — for the subjects checked here.';
    document.getElementById('cuAssignedSubjects').innerHTML = '';
    document.getElementById('cuAssignedStudents').innerHTML = '';
  }catch(err){
    showToast(friendlyAuthError(err), true);
  }finally{
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Account';
  }
});

/* =================================================================
   DASHBOARD
   ================================================================= */
const STAT_CARDS = [
  {key:'students', label:'Total Students', mentorLabel:'My Students', icon:'fa-users', color:'purple', hiddenForStudent:true},
  {key:'mentors', label:'Total Mentors', icon:'fa-graduation-cap', color:'green', adminOnly:true},
  {key:'subjects', label:'Total Subjects', icon:'fa-book-open', color:'blue'},
  {key:'topics', label:'Total Topics', icon:'fa-file-lines', color:'orange'},
  {key:'lessons', label:'Active Lessons', icon:'fa-play', color:'pink'},
  {key:'results', label:'Quiz Attempts', icon:'fa-square-check', color:'indigo'}
];
let overviewChartInstance = null;

function initDashboard(){
  const cards = STAT_CARDS.filter(s=> !(s.adminOnly && isRestrictedRole()) && !(s.hiddenForStudent && isStudentRole()) );
  document.getElementById('statGrid').innerHTML = cards.map(s=>`
    <div class="stat-card">
      <div class="stat-icon" style="background:var(--${s.color}-bg);color:var(--${s.color});"><i class="fa-solid ${s.icon}"></i></div>
      <div class="stat-num" id="stat-${s.key}">0</div>
      <div class="stat-label">${isMentor() && s.mentorLabel ? s.mentorLabel : s.label}</div>
      <div class="stat-delta flat" id="statd-${s.key}">—</div>
    </div>`).join('');
}

function refreshDependentViews(){
  // stat counts
  document.getElementById('stat-students') && (document.getElementById('stat-students').textContent = visibleStudentRows().length);
  document.getElementById('stat-mentors') && (document.getElementById('stat-mentors').textContent = (entityCache.mentors||[]).length);
  document.getElementById('stat-subjects') && (document.getElementById('stat-subjects').textContent = visibleEntityRows('subjects').length);
  document.getElementById('stat-topics') && (document.getElementById('stat-topics').textContent = visibleEntityRows('topics').length);
  const activeLessons = visibleRows(RESOURCE_MODULES.lessons).filter(l=>l.status==='Active').length;
  document.getElementById('stat-lessons') && (document.getElementById('stat-lessons').textContent = activeLessons);
  document.getElementById('stat-results') && (document.getElementById('stat-results').textContent = visibleEntityRows('results').length);

  // mini stats under chart
  const attempts = visibleEntityRows('results');
  const avgScore = attempts.length ? Math.round(attempts.reduce((s,a)=>s+(Number(a.score)||0),0)/attempts.length) : 0;
  const activeStudents = visibleStudentRows().filter(s=>s.status==='Active').length;
  const msEl = document.getElementById('miniStats');
  if(msEl){
    const mini = [
      {l:'Lessons Completed', v:activeLessons},
      {l:'Quiz Attempts', v:attempts.length},
      {l:'Avg. Score', v:avgScore+'%'}
    ];
    if(!isStudentRole()) mini.push({l:'Active Students', v:activeStudents});
    msEl.innerHTML = mini.map(m=>`<div class="mini-stat"><span class="ms-label">${m.l}</span><span class="ms-val">${m.v}</span></div>`).join('');
  }

  renderRecentUsers();
  renderTopTopics();
  updateOverviewChart();
}

function renderRecentUsers(){
  const tbl = document.getElementById('recentUsersTable');
  if(!tbl) return;
  const students = (entityCache.students||[]).map(s=>({...s, role:'Student', classSubject:s.className}));
  const mentors = (entityCache.mentors||[]).map(m=>({...m, role:'Mentor', classSubject:m.subject}));
  const all = [...students, ...mentors].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,5);
  if(!all.length){ tbl.innerHTML = `<tr><td><div class="empty-state"><i class="fa-solid fa-users"></i><h4>No users yet</h4><p>Add students or mentors to see them here.</p></div></td></tr>`; return; }
  tbl.innerHTML = `<thead><tr><th>Name</th><th>Role</th><th>Class / Subject</th><th>Status</th></tr></thead>
    <tbody>${all.map(u=>`<tr>
      <td><div class="cell-user"><div class="avatar-sm">${(u.name||'?').charAt(0).toUpperCase()}</div>${escapeHtml(u.name||'')}</div></td>
      <td><span class="pill pill-role">${u.role}</span></td>
      <td>${escapeHtml(u.classSubject||'—')}</td>
      <td><span class="pill pill-${u.status}">${u.status||'—'}</span></td>
    </tr>`).join('')}</tbody>`;
}

function renderTopTopics(){
  const tbl = document.getElementById('topTopicsTable');
  if(!tbl) return;
  const topics = [...visibleEntityRows('topics')].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,5);
  if(!topics.length){ tbl.innerHTML = `<tr><td><div class="empty-state"><i class="fa-solid fa-bookmark"></i><h4>No topics yet</h4><p>Add topics in Academic Management.</p></div></td></tr>`; return; }
  tbl.innerHTML = `<thead><tr><th>Topic</th><th>Chapter</th><th>Status</th></tr></thead>
    <tbody>${topics.map(t=>`<tr>
      <td>${escapeHtml(t.name||'')}</td>
      <td style="color:var(--text-2);font-size:.78rem;">${escapeHtml(t.chapterName||'—')}</td>
      <td><span class="pill pill-${t.status}">${t.status||'—'}</span></td>
    </tr>`).join('')}</tbody>`;
}

function updateOverviewChart(){
  const ctx = document.getElementById('overviewChart');
  if(!ctx) return;
  // weekly bucket of new students created this month (proxy growth curve)
  const now = new Date();
  const weeks = [0,0,0,0,0];
  (entityCache.students||[]).forEach(s=>{
    if(!s.createdAt) return;
    const d = new Date(s.createdAt);
    if(d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear()){
      const w = Math.min(4, Math.floor((d.getDate()-1)/7));
      weeks[w]++;
    }
  });
  const cum = []; let running=0;
  weeks.forEach(w=>{ running+=w; cum.push(running); });
  if(overviewChartInstance) overviewChartInstance.destroy();
  overviewChartInstance = new Chart(ctx, {
    type:'line',
    data:{ labels:['Wk 1','Wk 2','Wk 3','Wk 4','Wk 5'], datasets:[{
      data:cum, borderColor:'#6C5CE7', backgroundColor:'rgba(108,92,231,.12)', fill:true, tension:.4, pointBackgroundColor:'#6C5CE7', pointRadius:4
    }]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{ beginAtZero:true, grid:{color:'#EAECF2'} }, x:{ grid:{display:false} } } }
  });
}

/* =================================================================
   (Analytics section removed)
   ================================================================= */

/* ---------------- SETTINGS ---------------- */
document.getElementById('setSaveBtn').addEventListener('click', async ()=>{
  if(!currentUser) return;
  const name = document.getElementById('setName').value.trim();
  try{
    await updateDoc(doc(db,'users',currentUser.uid), { name });
    document.getElementById('tbName').textContent = name;
    document.getElementById('tbAvatar').textContent = name.charAt(0).toUpperCase();
    showToast('Profile updated.');
  }catch(err){ showToast(err.message, true); }
});

document.getElementById('modalOverlay').addEventListener('click', (e)=>{ if(e.target.id==='modalOverlay') closeModal(); });
