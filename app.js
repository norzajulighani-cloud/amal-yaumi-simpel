/* ════════════════════════════════════════════════════════════
   AMAL YAUMI — app.js v2
   Alur: Pilih guru → Pilih tanggal + Isi 4 amal → Submit ke GAS
════════════════════════════════════════════════════════════ */

// ──────────────────────────────────────────────────────────────
// ⚙️  KONFIGURASI
// ──────────────────────────────────────────────────────────────

const CONFIG = {
  /**
   * URL Google Apps Script standalone Anda.
   * Setelah deploy GAS, paste URL-nya di sini.
   * Contoh: 'https://script.google.com/macros/s/AKfycb.../exec'
   */
  GAS_URL: 'https://script.google.com/macros/s/AKfycbzNabEbzqLFDW4CD2Lf3-mj6JuOcyZ5SG0_QMc3v-UhG8EvIJrujRWBftRvjQw1-Qzr/exec',

  /**
   * Spreadsheet ID untuk tiap jenis amal (bulan Oktober).
   * Ini akan dikirim ke GAS, GAS yang menentukan sheetnya.
   */
  SPREADSHEET_IDS: {
    qiyamul_lail: '1EXAx00cVk3YEKjThT2opqd2-hGQEgBwWvo_N0GD5Va0',
    isya_subuh:   '1r8vJIxzg67Q0-G92g5SSvjXEJtAj0h9b_DqyzqnwQlI',
    dhuha:        '1_gV-vBlGDkVwuvwhCeJT1mPlZmWE-XcuoAfHIGSXu_c',
    tilawah:      '1fFlDpFonYR6eUC87TpBMqe0JOQyy6LjBtzCxBldQ1iA',
  },
};

// ──────────────────────────────────────────────────────────────
// 👥  DAFTAR GURU — 27 nama (hardcode sebagai sumber utama)
//     GAS tetap dicoba untuk ambil nama terbaru dari spreadsheet.
// ──────────────────────────────────────────────────────────────

const NAMA_FALLBACK = [
  'Abdul Halim, S.Pd.I., Gr',
  'Abdurrahman',
  'Ahmad Fauzi, S.Pd',
  'Ahmad Hasbiyanor, S.Pd',
  'Ahmad Khuwailid, S.E',
  'Ahmad Rabiannor, S.Pd.I., Gr',
  'Ahmad Ridhani, S.Pd',
  'Ahdy Anugerah Putera, S.Kom',
  'Aulia Rahman',
  'Fahrianor, S.Pd',
  'Ilhamnor, S.Pd',
  'Johan Amrullah, AR',
  'M. Hidayatullah, S.Pd',
  'M.Yasir',
  'Muhammad Azma Musyayid, S.Pd',
  'Muhammad Hamidi, S.Pd',
  'Muhammad Kifli, S.H',
  'Muhammad Noor',
  'Muhammad Raihan Islami, S.Pd',
  'Muhammad Syahid, S.Pd., Gr',
  'Nasrullah, S,Pd',
  'Nor Zajuli Ghani',
  'Ramadhan, S.Pd.I., Gr',
  'Riadi, S.H., Gr',
  'Riduansyah, S.Sos., Gr',
  'Rudi, S.Pd',
  'Subhannor, S. Pd',
];

let DAFTAR_GURU = [...NAMA_FALLBACK];

/**
 * Coba ambil nama guru dari GAS (untuk sinkronisasi dengan spreadsheet).
 * Jika gagal (misal dibuka dari file://), gunakan NAMA_FALLBACK.
 */
async function fetchDaftarGuru() {
  // Jangan coba fetch jika dibuka dari file:// — pasti gagal karena CORS
  if (location.protocol === 'file:') {
    console.info('Mode file://: pakai daftar nama lokal.');
    DAFTAR_GURU = [...NAMA_FALLBACK];
    return false;
  }

  try {
    const resp = await fetch(CONFIG.GAS_URL + '?action=getNama');
    const json = await resp.json();
    if (json.status === 'ok' && Array.isArray(json.data) && json.data.length >= 5) {
      // Filter ketat: hanya baris yang tampak seperti nama manusia
      const namaSaja = json.data.filter(n =>
        n.length >= 3 &&         // minimal 3 karakter
        n.length <= 60 &&        // tidak terlalu panjang
        !n.includes('=') &&      // bukan formula
        !n.includes(':') &&      // bukan rumus/keterangan
        !/^\d/.test(n)           // tidak diawali angka
      );
      if (namaSaja.length >= 5) {
        DAFTAR_GURU = namaSaja;
        console.info(`Nama berhasil dimuat dari GAS: ${namaSaja.length} orang.`);
        return true;
      }
    }
    console.warn('Fetch nama tidak valid, pakai fallback.');
    DAFTAR_GURU = [...NAMA_FALLBACK];
    return false;
  } catch (err) {
    console.warn('Fetch nama error (pakai fallback):', err.message);
    DAFTAR_GURU = [...NAMA_FALLBACK];
    return false;
  }
}

// ──────────────────────────────────────────────────────────────
// 📋  JENIS AMAL
// ──────────────────────────────────────────────────────────────

const AMAL_LIST = [
  {
    id:    'qiyamul_lail',
    icon:  '🌙',
    nama:  'Qiyamul Lail',
    tanya: 'Apakah melaksanakan Qiyamul Lail malam ini?',
  },
  {
    id:    'isya_subuh',
    icon:  '🕌',
    nama:  'Isya & Subuh Berjama\'ah',
    tanya: 'Apakah Isya & Subuh berjama\'ah / tepat waktu?',
  },
  {
    id:    'dhuha',
    icon:  '☀️',
    nama:  'Sholat Dhuha',
    tanya: 'Apakah melaksanakan Sholat Dhuha?',
  },
  {
    id:    'tilawah',
    icon:  '📖',
    nama:  'Tilawah Al-Qur\'an',
    tanya: 'Apakah melakukan Tilawah Al-Qur\'an hari ini?',
  },
];

// ──────────────────────────────────────────────────────────────
// 🗂️  STATE
// ──────────────────────────────────────────────────────────────

const STATE = {
  guru:    '',
  tanggal: new Date(), // Date object
  answers: {},         // { qiyamul_lail: 'Y'|'T', isya_subuh: 'Y'|'T', ... }
};

// ──────────────────────────────────────────────────────────────
// 🛠️  UTILITAS TANGGAL
// ──────────────────────────────────────────────────────────────

const HARI  = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const BULAN = ['Januari','Februari','Maret','April','Mei','Juni',
               'Juli','Agustus','September','Oktober','November','Desember'];

function formatTanggal(d) {
  return {
    day:   d.getDate(),
    hari:  HARI[d.getDay()],
    bulan: BULAN[d.getMonth()],
    tahun: d.getFullYear(),
    short: `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`,
    iso:   `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
  };
}

function today()     { const d = new Date(); d.setHours(0,0,0,0); return d; }
function yesterday() { const d = today(); d.setDate(d.getDate()-1); return d; }

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Cek apakah tanggal sudah melewati bulan ini (tidak boleh isi bulan lalu) */
function isTooOld(d) {
  const now = today();
  const limit = new Date(now.getFullYear(), now.getMonth(), 1); // awal bulan ini
  return d < limit;
}

/** Cek apakah tanggal adalah masa depan */
function isFuture(d) {
  return d > today();
}

// ──────────────────────────────────────────────────────────────
// 🍞  TOAST
// ──────────────────────────────────────────────────────────────

let _toastTimer = null;
function toast(msg, type = 'warn', ms = 3500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ──────────────────────────────────────────────────────────────
// ⏳  LOADING
// ──────────────────────────────────────────────────────────────

function showLoading(title = 'Mengirim data…', sub = 'Mohon tunggu sebentar') {
  document.getElementById('loading-title').textContent = title;
  document.getElementById('loading-sub').textContent   = sub;
  document.getElementById('loading-overlay').classList.remove('hidden');
}
function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
}

// ──────────────────────────────────────────────────────────────
// 📄  NAVIGASI
// ──────────────────────────────────────────────────────────────

function goTo(pageId) {
  document.querySelectorAll('.page').forEach(p => {
    if (p.classList.contains('active')) {
      p.classList.add('exit');
      p.classList.remove('active');
      setTimeout(() => p.classList.remove('exit'), 380);
    }
  });
  setTimeout(() => document.getElementById(pageId).classList.add('active'), 50);
}

// ──────────────────────────────────────────────────────────────
// 🏠  PAGE 1 — PILIH GURU
// ──────────────────────────────────────────────────────────────

function initPageHome() {
  const sel = document.getElementById('select-guru');
  const btn = document.getElementById('btn-next-home');

  // Populate
  sel.innerHTML = '<option value="">— Pilih nama Anda —</option>';
  DAFTAR_GURU.forEach(nama => {
    const opt = document.createElement('option');
    opt.value = opt.textContent = nama;
    sel.appendChild(opt);
  });

  // Restore last selection
  if (STATE.guru) sel.value = STATE.guru;
  btn.disabled = !sel.value;

  sel.onchange = () => { btn.disabled = !sel.value; };

  btn.onclick = () => {
    if (!sel.value) return;
    STATE.guru = sel.value;
    initPageIsi();
    goTo('page-isi');
  };
}

// ──────────────────────────────────────────────────────────────
// 📝  PAGE 2 — PILIH TANGGAL + ISI AMAL
// ──────────────────────────────────────────────────────────────

function initPageIsi() {
  STATE.answers = {};

  // Nama guru di topbar
  document.getElementById('display-guru-name').textContent = STATE.guru;

  // Default tanggal = hari ini
  if (!STATE.tanggal || isFuture(STATE.tanggal)) {
    STATE.tanggal = today();
  }

  renderDateDisplay();
  buildAmalCards();
  updateProgress();
  updateSubmitBtn();
}

/* ─── Date Display ─── */
function renderDateDisplay() {
  const t = formatTanggal(STATE.tanggal);

  document.getElementById('date-day').textContent  = t.day;
  document.getElementById('date-info').innerHTML   =
    `<strong style="color:var(--txt)">${t.hari}</strong><br>${t.bulan} ${t.tahun}`;

  // Prev / Next buttons
  const prev = addDays(STATE.tanggal, -1);
  const next = addDays(STATE.tanggal,  1);
  document.getElementById('btn-date-prev').disabled = isTooOld(prev);
  document.getElementById('btn-date-next').disabled = isFuture(next);

  // Chip active state
  const todayStr     = formatTanggal(today()).iso;
  const yesterdayStr = formatTanggal(yesterday()).iso;
  const curStr       = t.iso;
  document.getElementById('chip-today').classList.toggle('active',     curStr === todayStr);
  document.getElementById('chip-yesterday').classList.toggle('active', curStr === yesterdayStr);
  document.getElementById('chip-pick').classList.toggle('active',
    curStr !== todayStr && curStr !== yesterdayStr);

  // Hidden date input sync
  document.getElementById('input-date').value = t.iso;

  // Reset answers ketika tanggal berubah
  STATE.answers = {};
  buildAmalCards();
  updateProgress();
  updateSubmitBtn();
}

function setDate(d) {
  if (isTooOld(d)) { toast('⚠️ Tanggal ini sudah melewati batas pengisian bulan lalu.', 'warn'); return; }
  if (isFuture(d)) { toast('⚠️ Tidak bisa mengisi tanggal yang belum terjadi.', 'warn'); return; }
  STATE.tanggal = d;
  renderDateDisplay();
}

/* ─── Amal Cards ─── */
function buildAmalCards() {
  const container = document.getElementById('amal-cards');
  container.innerHTML = '';

  AMAL_LIST.forEach(amal => {
    const card = document.createElement('div');
    card.className = 'amal-card';
    card.id = `amal-card-${amal.id}`;
    card.innerHTML = `
      <div class="amal-icon-wrap" id="amal-icon-${amal.id}">${amal.icon}</div>
      <div class="amal-info">
        <span class="amal-name">${amal.nama}</span>
        <span class="amal-q">${amal.tanya}</span>
      </div>
      <div class="amal-btns">
        <button class="amal-ans ya"    data-id="${amal.id}" data-val="Y">Y</button>
        <button class="amal-ans tidak" data-id="${amal.id}" data-val="T">T</button>
      </div>
    `;
    container.appendChild(card);
  });

  // Event delegation
  container.addEventListener('click', e => {
    const btn = e.target.closest('.amal-ans');
    if (!btn) return;
    handleAns(btn.dataset.id, btn.dataset.val);
  });
}

function handleAns(amalId, val) {
  STATE.answers[amalId] = val;

  const card = document.getElementById(`amal-card-${amalId}`);
  card.className = `amal-card answered-${val}`;

  // Update button active states
  card.querySelectorAll('.amal-ans').forEach(b => {
    b.classList.toggle('active', b.dataset.val === val);
  });

  updateProgress();
  updateSubmitBtn();

  // Scroll ke amal berikutnya yang belum diisi
  const unanswered = AMAL_LIST.find(a => !STATE.answers[a.id]);
  if (unanswered) {
    setTimeout(() => {
      document.getElementById(`amal-card-${unanswered.id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 120);
  }
}

/* ─── Progress ─── */
function updateProgress() {
  const filled = Object.keys(STATE.answers).length;
  const total  = AMAL_LIST.length;
  const pct    = total > 0 ? (filled / total * 100) : 0;

  document.getElementById('prog-fill').style.width = pct + '%';
  document.getElementById('label-amal-count').textContent = `${filled} / ${total} diisi`;
  document.getElementById('submit-badge').textContent = `${filled}/${total}`;
}

function updateSubmitBtn() {
  const filled  = Object.keys(STATE.answers).length;
  const allDone = filled === AMAL_LIST.length;
  const btn     = document.getElementById('btn-submit');
  const note    = document.getElementById('submit-note');
  btn.disabled      = !allDone;
  note.style.opacity = allDone ? '0' : '1';
}

// ──────────────────────────────────────────────────────────────
// 🚀  SUBMIT
// ──────────────────────────────────────────────────────────────

async function submitData() {
  if (CONFIG.GAS_URL === 'PASTE_GAS_URL_DISINI') {
    toast('⚠️ GAS URL belum diisi! Ikuti panduan setup di README.md', 'err', 6000);
    return;
  }

  // Blokir jika dibuka dari file:// — browser tidak izinkan request ke server eksternal
  if (location.protocol === 'file:') {
    toast(
      '⚠️ Buka via HTTPS agar bisa kirim data. Gunakan versi GitHub Pages.',
      'warn', 6000
    );
    hideLoading();
    return;
  }

  const tgl = formatTanggal(STATE.tanggal);

  const payload = {
    guru:           STATE.guru,
    tanggal:        tgl.iso,
    hari:           tgl.hari,
    bulan:          tgl.bulan,
    tahun:          tgl.tahun,
    day:            tgl.day,
    spreadsheetIds: CONFIG.SPREADSHEET_IDS,
    answers:        STATE.answers,
  };

  showLoading(
    'Mengirim ke 4 spreadsheet…',
    `${STATE.guru} — ${tgl.hari}, ${tgl.short}`
  );

  try {
    /**
     * GAS menerima POST lalu redirect 302 ke URL final.
     * - Jangan set Content-Type header kustom (biarkan browser handle)
     * - redirect: 'follow' memastikan browser ikut redirect GAS
     * - Harus dibuka dari HTTPS agar CORS diizinkan
     */
    const res = await fetch(CONFIG.GAS_URL, {
      method:   'POST',
      body:     JSON.stringify(payload),
      redirect: 'follow',
    });

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('Respons GAS bukan JSON: ' + text.substring(0, 100));
    }

    hideLoading();

    if (json.status === 'ok') {
      showPageSukses(json, tgl);
    } else {
      toast(`❌ GAS error: ${json.message || 'Tidak diketahui.'}`, 'err', 6000);
    }

  } catch (err) {
    hideLoading();
    console.error('[Submit error]', err);

    const isNetErr = err instanceof TypeError;
    const msg = isNetErr
      ? '❌ Koneksi gagal. Pastikan internet aktif dan GAS URL benar.'
      : `❌ Error: ${err.message}`;
    toast(msg, 'err', 7000);
  }
}

// ──────────────────────────────────────────────────────────────
// ✅  PAGE 3 — SUKSES
// ──────────────────────────────────────────────────────────────

function showPageSukses(gasResult, tgl) {
  document.getElementById('sukses-sub').textContent =
    `Data amal yaumi ${tgl.hari}, ${tgl.short} berhasil dicatat ke spreadsheet.`;

  const amalSummary = AMAL_LIST.map(a => {
    const val = STATE.answers[a.id];
    const icon = val === 'Y' ? '✅' : '❌';
    return `${icon} ${a.nama}: <strong>${val === 'Y' ? 'Ya' : 'Tidak'}</strong>`;
  }).join('<br>');

  document.getElementById('sukses-detail').innerHTML =
    `<strong style="color:var(--gold-2)">${STATE.guru}</strong><br>${amalSummary}` +
    (gasResult.message ? `<br><br><small style="color:var(--txt-3)">${gasResult.message}</small>` : '');

  goTo('page-sukses');
}

// ──────────────────────────────────────────────────────────────
// 🔌  EVENT WIRING
// ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {

  /* Tampilkan loading sementara fetch nama */
  const sel = document.getElementById('select-guru');
  sel.innerHTML = '<option value="">⏳ Memuat daftar nama…</option>';
  document.getElementById('btn-next-home').disabled = true;

  await fetchDaftarGuru();

  /* Page 1 */
  initPageHome();

  /* Back dari page 2 */
  document.getElementById('btn-back-isi').addEventListener('click', () => {
    goTo('page-home');
    initPageHome();
  });

  /* Navigasi tanggal */
  document.getElementById('btn-date-prev').addEventListener('click', () => {
    setDate(addDays(STATE.tanggal, -1));
  });
  document.getElementById('btn-date-next').addEventListener('click', () => {
    setDate(addDays(STATE.tanggal, 1));
  });

  /* Shortcut chips */
  document.getElementById('chip-today').addEventListener('click', () => setDate(today()));
  document.getElementById('chip-yesterday').addEventListener('click', () => setDate(yesterday()));
  document.getElementById('chip-pick').addEventListener('click', () => {
    document.getElementById('input-date').showPicker?.();
    document.getElementById('input-date').click();
  });
  document.getElementById('input-date').addEventListener('change', e => {
    const parts = e.target.value.split('-');
    if (parts.length !== 3) return;
    const d = new Date(+parts[0], +parts[1]-1, +parts[2]);
    setDate(d);
  });

  /* Submit */
  document.getElementById('btn-submit').addEventListener('click', submitData);

  /* Halaman sukses */
  document.getElementById('btn-isi-lagi').addEventListener('click', () => {
    STATE.answers  = {};
    STATE.tanggal  = today();
    initPageIsi();
    goTo('page-isi');
  });
  document.getElementById('btn-ganti-guru').addEventListener('click', () => {
    STATE.guru    = '';
    STATE.answers = {};
    initPageHome();
    goTo('page-home');
  });

});
