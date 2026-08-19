// ============================================================
// DEMO BOOKING FORM — FIREBASE SUBMIT HANDLER
// -------------------------------------------------------------
// Writes straight to Firestore: increments counters/leads in a
// transaction to mint the next SJ-LD-#### number, then creates
// the lead document. This is the same "leads" collection and
// numbering scheme the admin portal (portal/dashboard.html) reads
// from, so submissions here show up there automatically.
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, collection, addDoc, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function getNextLeadNumber() {
  const counterRef = doc(db, 'counters', 'leads');
  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? (snap.data().count || 0) : 0;
    const updated = current + 1;
    if (snap.exists()) tx.update(counterRef, { count: updated });
    else tx.set(counterRef, { count: updated });
    return updated;
  });
  return 'SJ-LD-' + String(next).padStart(4, '0');
}

const demoForm = document.getElementById('demoForm');
const formStatus = document.getElementById('formStatus');
const demoSubmitBtn = document.getElementById('demoSubmitBtn');

demoForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  formStatus.className = 'form-status';
  formStatus.textContent = '';

  if (!demoForm.checkValidity()) {
    demoForm.reportValidity();
    return;
  }

  const formData = {
    parentName: demoForm.parentName.value.trim(),
    studentName: demoForm.studentName.value.trim(),
    phone: demoForm.phone.value.trim(),
    email: demoForm.email.value.trim(),
    grade: demoForm.grade.value,
    curriculum: demoForm.curriculum.value,
    subjects: demoForm.subjects.value.trim(),
    area: demoForm.area.value.trim(),
    preferredDate: demoForm.preferredDate.value,
    message: demoForm.message.value.trim(),
    status: 'New',
    source: 'website',
    createdAt: serverTimestamp()
  };

  demoSubmitBtn.disabled = true;
  demoSubmitBtn.textContent = 'Submitting...';

  try {
    const leadNumber = await getNextLeadNumber();
    await addDoc(collection(db, 'leads'), { ...formData, leadNumber });

    formStatus.textContent = "Thank you! We've received your request and will call you within 24 hours to confirm your free demo.";
    formStatus.classList.add('show', 'success');
    demoForm.reset();
  } catch (err) {
    console.error('Lead submission failed:', err);
    formStatus.textContent = 'Something went wrong while sending your request. Please try again or email us directly.';
    formStatus.classList.add('show', 'error');
  } finally {
    demoSubmitBtn.disabled = false;
    demoSubmitBtn.textContent = 'Request Free Demo →';
  }
});
