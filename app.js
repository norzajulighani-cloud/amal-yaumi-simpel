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
  tanggal: new Date(),
  answers: {},
  /**
   * 'lengkap'  — semua 4 amal wajib diisi sebelum bisa submit
   * 'pilihan'  — bisa submit kapan saja, minimal 1 amal diisi
   */
  mode:    'lengkap',
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

function updateProgress() {
  const filled = Object.keys(STATE.answers).length;
  const total  = AMAL_LIST.length;
  const pct    = total > 0 ? (filled / total * 100) : 0;

  document.getElementById('prog-fill').style.width = pct + '%';
  document.getElementById('label-amal-count').textContent =
    STATE.mode === 'pilihan'
      ? `${filled} dipilih (mode pilihan)`
      : `${filled} / ${total} diisi`;
  document.getElementById('submit-badge').textContent =
    STATE.mode === 'pilihan' ? filled : `${filled}/${total}`;
}

function updateSubmitBtn() {
  const filled  = Object.keys(STATE.answers).length;
  const btn     = document.getElementById('btn-submit');
  const note    = document.getElementById('submit-note');

  if (STATE.mode === 'pilihan') {
    // Mode Pilihan: bisa submit kapan saja asal minimal 1 diisi
    btn.disabled = filled < 1;
    note.style.opacity = filled >= 1 ? '0' : '1';
    note.textContent = 'Pilih minimal 1 amal untuk dikirim.';
  } else {
    // Mode Lengkap: wajib isi semua
    btn.disabled = filled < AMAL_LIST.length;
    note.style.opacity = filled >= AMAL_LIST.length ? '0' : '1';
    note.textContent = `Isi semua ${AMAL_LIST.length} amal terlebih dahulu.`;
  }
}

/* ─── Mode Toggle ─── */
function setMode(mode) {
  STATE.mode    = mode;
  STATE.answers = {};

  // Update tombol mode
  document.getElementById('mode-btn-lengkap').classList.toggle('active', mode === 'lengkap');
  document.getElementById('mode-btn-pilihan').classList.toggle('active', mode === 'pilihan');

  // Update deskripsi mode
  const descEl = document.getElementById('mode-desc');
  if (descEl) {
    descEl.textContent = mode === 'pilihan'
      ? '⚡ Bebas memilih amal mana saja — submit tanpa harus mengisi semua.'
      : '📋 Semua 4 amal wajib diisi terlebih dahulu sebelum mengirim.';
  }

  // Update label tombol submit
  const submitLabel = document.querySelector('#btn-submit span:not(.submit-badge)');
  if (submitLabel) {
    submitLabel.textContent = mode === 'pilihan'
      ? 'Kirim Amal Terpilih'
      : 'Kirim ke Spreadsheet';
  }

  // Reset & rebuild
  buildAmalCards();
  updateProgress();
  updateSubmitBtn();
}

// ──────────────────────────────────────────────────────────────
// 🚀  SUBMIT
// ──────────────────────────────────────────────────────────────

async function submitData() {
  if (CONFIG.GAS_URL === 'PASTE_GAS_URL_DISINI') {
    toast('⚠️ GAS URL belum diisi!', 'err', 5000);
    return;
  }
  if (location.protocol === 'file:') {
    toast('⚠️ Buka via HTTPS agar bisa kirim data.', 'warn', 5000);
    return;
  }

  const filled = Object.keys(STATE.answers).length;
  if (filled < 1) {
    toast('⚠️ Belum ada amal yang diisi.', 'warn');
    return;
  }

  const tgl = formatTanggal(STATE.tanggal);

  // Hanya kirim amal yang sudah diisi (Mode Pilihan mungkin tidak semua)
  const answersToSend = {};
  AMAL_LIST.forEach(a => {
    if (STATE.answers[a.id]) answersToSend[a.id] = STATE.answers[a.id];
  });

  const payload = {
    guru:           STATE.guru,
    tanggal:        tgl.iso,
    hari:           tgl.hari,
    bulan:          tgl.bulan,
    tahun:          tgl.tahun,
    day:            tgl.day,
    spreadsheetIds: CONFIG.SPREADSHEET_IDS,
    answers:        answersToSend,
  };

  const jumlahAmal = Object.keys(answersToSend).length;
  showLoading(
    `Mengirim ${jumlahAmal} amal ke spreadsheet…`,
    `${STATE.guru} — ${tgl.hari}, ${tgl.short}`
  );

  try {
    /**
     * 🔑 FIX CORS: Gunakan GET request dengan payload di URL.
     * POST ke GAS menyebabkan redirect 302 yang mengosongkan body.
     * GET tidak mengalami masalah ini dan tetap CORS-safe.
     */
    const url = CONFIG.GAS_URL
      + '?action=submit'
      + '&payload=' + encodeURIComponent(JSON.stringify(payload));

    const res  = await fetch(url, { redirect: 'follow' });
    const text = await res.text();

    let json;
    try { json = JSON.parse(text); }
    catch { throw new Error('Respons GAS tidak valid: ' + text.substring(0, 120)); }

    hideLoading();

    if (json.status === 'ok') {
      showPageSukses(json, tgl, jumlahAmal);
    } else {
      toast(`❌ GAS: ${json.message || 'Terjadi kesalahan.'}`, 'err', 7000);
    }

  } catch (err) {
    hideLoading();
    console.error('[Submit error]', err);
    toast(
      err instanceof TypeError
        ? '❌ Koneksi gagal. Periksa internet dan GAS URL.'
        : `❌ ${err.message}`,
      'err', 7000
    );
  }
}

// ──────────────────────────────────────────────────────────────
// ✅  PAGE 3 — SUKSES
// ──────────────────────────────────────────────────────────────

function showPageSukses(gasResult, tgl, jumlahAmal) {
  document.getElementById('sukses-sub').textContent =
    `${jumlahAmal} amal yaumi ${tgl.hari}, ${tgl.short} berhasil dicatat.`;

  const amalSummary = AMAL_LIST
    .filter(a => STATE.answers[a.id])  // hanya yang dikirim
    .map(a => {
      const val  = STATE.answers[a.id];
      const icon = val === 'Y' ? '✅' : '❌';
      return `${icon} ${a.nama}: <strong>${val === 'Y' ? 'Ya' : 'Tidak'}</strong>`;
    }).join('<br>');

  const skipped = AMAL_LIST.filter(a => !STATE.answers[a.id]);
  const skipHtml = skipped.length
    ? `<br><br><span style="color:var(--txt-3)">⏭️ Dilewati: ${skipped.map(a => a.nama).join(', ')}</span>`
    : '';

  document.getElementById('sukses-detail').innerHTML =
    `<strong style="color:var(--gold-2)">${STATE.guru}</strong><br>${amalSummary}${skipHtml}` +
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
  initPageHome();

  /* Tombol kembali dari page 2 */
  document.getElementById('btn-back-isi').addEventListener('click', () => {
    goTo('page-home');
    initPageHome();
  });

  /* Mode toggle */
  document.getElementById('mode-btn-lengkap').addEventListener('click', () => setMode('lengkap'));
  document.getElementById('mode-btn-pilihan').addEventListener('click', () => setMode('pilihan'));

  /* Navigasi tanggal */
  document.getElementById('btn-date-prev').addEventListener('click', () => setDate(addDays(STATE.tanggal, -1)));
  document.getElementById('btn-date-next').addEventListener('click', () => setDate(addDays(STATE.tanggal,  1)));

  /* Shortcut chips */
  document.getElementById('chip-today').addEventListener('click',     () => setDate(today()));
  document.getElementById('chip-yesterday').addEventListener('click', () => setDate(yesterday()));
  document.getElementById('chip-pick').addEventListener('click', () => {
    document.getElementById('input-date').showPicker?.();
    document.getElementById('input-date').click();
  });
  document.getElementById('input-date').addEventListener('change', e => {
    const parts = e.target.value.split('-');
    if (parts.length !== 3) return;
    setDate(new Date(+parts[0], +parts[1]-1, +parts[2]));
  });

  /* Submit */
  document.getElementById('btn-submit').addEventListener('click', submitData);

  /* Halaman sukses */
  document.getElementById('btn-isi-lagi').addEventListener('click', () => {
    STATE.answers = {};
    STATE.tanggal = today();
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
