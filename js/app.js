/* ============================================================
   EXPENSE & BUDGET VISUALIZER — app.js
   Vanilla JavaScript, no frameworks
   Features:
     - Add / delete transactions with form validation
     - LocalStorage persistence
     - Pie chart (Chart.js) — auto-updates
     - Custom categories (add / remove)
     - Sort by date, amount, or category
     - Monthly summary view with category breakdown
     - Toast notifications
   ============================================================ */

'use strict';

/* ─────────────────────────────────────────
   CONSTANTS & STATE
───────────────────────────────────────── */
const STORAGE_KEY_TX   = 'budgetViz_transactions';
const STORAGE_KEY_CATS = 'budgetViz_customCategories';

const DEFAULT_CATEGORIES = ['Food', 'Transport', 'Fun'];

// Category emoji map (built-ins + fallback for customs)
const CATEGORY_EMOJI = {
  Food:      '🍔',
  Transport: '🚗',
  Fun:       '🎉',
};

// Distinct palette for pie chart slices
const CHART_COLORS = [
  '#ff6b6b', '#4ecdc4', '#ffe66d', '#6c63ff',
  '#a78bfa', '#43c6ac', '#f97316', '#06b6d4',
  '#84cc16', '#ec4899', '#8b5cf6', '#14b8a6',
];

let transactions    = [];   // { id, name, amount, category, date }
let customCategories = [];  // string[]
let chartInstance        = null;  // Home tab chart
let dailyChartInstance   = null;  // Daily tab chart
let monthlyChartInstance = null;  // Monthly tab chart
let currentMonth    = new Date(); // used by monthly view
let activeTab       = 'dashboard'; // tracks current active tab

/* ─────────────────────────────────────────
   DOM REFERENCES
───────────────────────────────────────── */
const $ = id => document.getElementById(id);

const form           = $('transactionForm');
const inputName      = $('itemName');
const inputAmount    = $('amount');
const selectCategory = $('category');
const inputDate      = $('txDate');

const totalBalanceEl  = $('totalBalance');
const balanceLabelEl  = $('balanceLabel');
const txListEl       = $('transactionList');
const emptyStateEl   = $('emptyState');

const sortByEl       = $('sortBy');

const chartCanvas    = $('spendingChart');
const chartEmptyEl   = $('chartEmptyState');

const toggleCustomCatBtn = $('toggleCustomCat');
const customCatPanel     = $('customCatPanel');
const newCategoryInput   = $('newCategoryInput');
const addCategoryBtn     = $('addCategoryBtn');
const customCatListEl    = $('customCatList');

// Monthly tab
const monthLabelEl     = $('monthLabel');
const prevMonthBtn     = $('prevMonth');
const nextMonthBtn     = $('nextMonth');
const monthlyTotalEl   = $('monthlyTotal');
const monthlyCountEl   = $('monthlyCount');
const monthlyAvgEl     = $('monthlyAvg');
const monthlyBreakEl   = $('monthlyBreakdown');
const monthlyTxListEl  = $('monthlyTxList');

const toastEl = $('toast');

// Delete confirmation modal
const deleteModal      = $('deleteModal');
const modalBody        = $('modalBody');
const modalConfirmBtn  = $('modalConfirmBtn');
const modalCancelBtn   = $('modalCancelBtn');
let   pendingDeleteId  = null; // stores the id waiting for confirmation

// Daily tab
const filterFromEl       = $('filterFrom');
const filterToEl         = $('filterTo');
const resetFilterBtn     = $('resetFilterBtn');
const dailyListEl        = $('dailyList');

/* ─────────────────────────────────────────
   LOCAL STORAGE
───────────────────────────────────────── */
function saveTransactions() {
  localStorage.setItem(STORAGE_KEY_TX, JSON.stringify(transactions));
}

function loadTransactions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TX);
    transactions = raw ? JSON.parse(raw) : [];
  } catch {
    transactions = [];
  }
}

function saveCustomCategories() {
  localStorage.setItem(STORAGE_KEY_CATS, JSON.stringify(customCategories));
}

function loadCustomCategories() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CATS);
    customCategories = raw ? JSON.parse(raw) : [];
  } catch {
    customCategories = [];
  }
}

/* ─────────────────────────────────────────
   UTILITY HELPERS
───────────────────────────────────────── */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function formatRupiah(amount) {
  return 'Rp ' + Number(amount).toLocaleString('id-ID');
}

function getEmoji(category) {
  return CATEGORY_EMOJI[category] || '📦';
}

function getChartColor(index) {
  return CHART_COLORS[index % CHART_COLORS.length];
}

function getTodayString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

/* ─────────────────────────────────────────
   TOAST NOTIFICATION
───────────────────────────────────────── */
let toastTimer = null;

function showToast(message, duration = 2200) {
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  // Force reflow so transition plays
  void toastEl.offsetWidth;
  toastEl.classList.add('show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => toastEl.classList.add('hidden'), 320);
  }, duration);
}

/* ─────────────────────────────────────────
   FORM VALIDATION
───────────────────────────────────────── */
function showError(fieldId, errId, show) {
  const field = $(fieldId);
  const err   = $(errId);
  if (show) {
    field.classList.add('invalid');
    err.classList.add('visible');
  } else {
    field.classList.remove('invalid');
    err.classList.remove('visible');
  }
}

function validateForm() {
  let valid = true;

  const name = inputName.value.trim();
  showError('itemName', 'err-itemName', !name);
  if (!name) valid = false;

  const amount = parseFloat(inputAmount.value);
  showError('amount', 'err-amount', isNaN(amount) || amount <= 0);
  if (isNaN(amount) || amount <= 0) valid = false;

  const cat = selectCategory.value;
  showError('category', 'err-category', !cat);
  if (!cat) valid = false;

  return valid;
}

// Clear errors on input
inputName.addEventListener('input', () => showError('itemName', 'err-itemName', false));
inputAmount.addEventListener('input', () => showError('amount', 'err-amount', false));
selectCategory.addEventListener('change', () => showError('category', 'err-category', false));

/* ─────────────────────────────────────────
   ADD TRANSACTION
───────────────────────────────────────── */
form.addEventListener('submit', e => {
  e.preventDefault();
  if (!validateForm()) return;

  const tx = {
    id:       generateId(),
    name:     inputName.value.trim(),
    amount:   parseFloat(inputAmount.value),
    category: selectCategory.value,
    date:     inputDate.value || getTodayString(),
  };

  transactions.unshift(tx);
  saveTransactions();
  form.reset();
  inputDate.value = getTodayString();

  renderAll();
  showToast(`✅ "${tx.name}" added`);
});

/* ─────────────────────────────────────────
   DELETE CONFIRMATION MODAL
───────────────────────────────────────── */
function showDeleteModal(id) {
  const tx = transactions.find(t => t.id === id);
  if (!tx) return;

  pendingDeleteId = id;
  modalBody.innerHTML = `Yakin ingin menghapus <strong>"${escapeHtml(tx.name)}"</strong><br><span style="font-size:0.8rem">${escapeHtml(tx.category)} · ${formatRupiah(tx.amount)}</span>?`;
  deleteModal.classList.remove('hidden');
  modalConfirmBtn.focus();
}

function closeDeleteModal() {
  deleteModal.classList.add('hidden');
  pendingDeleteId = null;
}

// Confirm → actually delete
modalConfirmBtn.addEventListener('click', () => {
  if (!pendingDeleteId) return;
  deleteTransaction(pendingDeleteId);
  closeDeleteModal();
});

// Cancel
modalCancelBtn.addEventListener('click', closeDeleteModal);

// Click backdrop to cancel
deleteModal.addEventListener('click', e => {
  if (e.target === deleteModal) closeDeleteModal();
});

// ESC key to cancel
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !deleteModal.classList.contains('hidden')) {
    closeDeleteModal();
  }
});

/* ─────────────────────────────────────────
   DELETE TRANSACTION
───────────────────────────────────────── */
function deleteTransaction(id) {
  const tx = transactions.find(t => t.id === id);
  transactions = transactions.filter(t => t.id !== id);
  saveTransactions();
  renderAll();
  if (tx) showToast(`🗑️ "${tx.name}" removed`);
}

/* ─────────────────────────────────────────
   SORTING
───────────────────────────────────────── */
function getSortedTransactions(list) {
  const mode = sortByEl.value;
  const copy = [...list];

  switch (mode) {
    case 'date-desc':
      return copy.sort((a, b) => b.date.localeCompare(a.date));
    case 'date-asc':
      return copy.sort((a, b) => a.date.localeCompare(b.date));
    case 'amount-desc':
      return copy.sort((a, b) => b.amount - a.amount);
    case 'amount-asc':
      return copy.sort((a, b) => a.amount - b.amount);
    case 'category-asc':
      return copy.sort((a, b) => a.category.localeCompare(b.category));
    default:
      return copy;
  }
}

sortByEl.addEventListener('change', renderTransactionList);

/* ─────────────────────────────────────────
   RENDER: BALANCE CARD (kontekstual per tab)
───────────────────────────────────────── */
function renderBalance() {
  let total = 0;
  let label = 'Total Spent';

  if (activeTab === 'dashboard') {
    // Semua transaksi
    total = transactions.reduce((sum, t) => sum + t.amount, 0);
    label = 'Total Spent';

  } else if (activeTab === 'daily') {
    // Sesuai filter tanggal yang aktif di Daily tab
    const from = filterFromEl.value;
    const to   = filterToEl.value;
    const filtered = transactions.filter(tx => {
      if (from && tx.date < from) return false;
      if (to   && tx.date > to)   return false;
      return true;
    });
    total = filtered.reduce((sum, t) => sum + t.amount, 0);

    if (from && to && from === to) {
      label = `Spent on ${formatDisplayDate(from)}`;
    } else if (from || to) {
      label = 'Spent (filtered)';
    } else {
      label = 'Total Spent (All Days)';
    }

  } else if (activeTab === 'monthly') {
    // Total bulan yang sedang dilihat di Monthly tab
    const year  = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun',
                         'Jul','Aug','Sep','Oct','Nov','Dec'];
    const txs = transactions.filter(tx => {
      const [y, m] = tx.date.split('-').map(Number);
      return y === year && m === month + 1;
    });
    total = txs.reduce((sum, t) => sum + t.amount, 0);
    label = `Spent in ${MONTH_NAMES[month]} ${year}`;
  }

  totalBalanceEl.textContent = formatRupiah(total);
  balanceLabelEl.textContent = label;
}

/* ─────────────────────────────────────────
   RENDER: TRANSACTION LIST
───────────────────────────────────────── */
function renderTransactionList() {
  const sorted = getSortedTransactions(transactions);

  if (sorted.length === 0) {
    txListEl.innerHTML = '';
    txListEl.appendChild(emptyStateEl);
    emptyStateEl.classList.remove('hidden');
    return;
  }

  emptyStateEl.classList.add('hidden');

  txListEl.innerHTML = sorted.map(tx => `
    <div class="tx-item" data-category="${escapeHtml(tx.category)}" data-id="${tx.id}">
      <div class="tx-icon">${getEmoji(tx.category)}</div>
      <div class="tx-info">
        <div class="tx-name">${escapeHtml(tx.name)}</div>
        <div class="tx-meta">${escapeHtml(tx.category)} · ${formatDisplayDate(tx.date)}</div>
      </div>
      <div class="tx-amount">- ${formatRupiah(tx.amount)}</div>
      <button class="btn-danger" data-id="${tx.id}" aria-label="Delete ${escapeHtml(tx.name)}">✕</button>
    </div>
  `).join('');

  // Attach delete listeners — open modal first
  txListEl.querySelectorAll('.btn-danger').forEach(btn => {
    btn.addEventListener('click', () => showDeleteModal(btn.dataset.id));
  });
}

/* ─────────────────────────────────────────
   RENDER: PIE CHART (generik + per-tab)
───────────────────────────────────────── */

/**
 * Bangun atau update pie chart Chart.js.
 * @param {HTMLCanvasElement} canvas   - elemen <canvas>
 * @param {HTMLElement}       emptyEl  - elemen empty-state
 * @param {object[]}          txList   - array transaksi yang akan divisualisasikan
 * @param {Chart|null}        instance - instance Chart.js yang sudah ada (atau null)
 * @returns {Chart|null} instance yang diperbarui
 */
function buildPieChart(canvas, emptyEl, txList, instance) {
  // Agregat per kategori
  const totals = {};
  txList.forEach(tx => {
    totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
  });

  const labels = Object.keys(totals);
  const data   = Object.values(totals);

  if (labels.length === 0) {
    emptyEl.classList.remove('hidden');
    canvas.classList.add('hidden');
    if (instance) { instance.destroy(); }
    return null;
  }

  emptyEl.classList.add('hidden');
  canvas.classList.remove('hidden');

  const colors = labels.map((_, i) => getChartColor(i));

  if (instance) {
    instance.data.labels                        = labels;
    instance.data.datasets[0].data             = data;
    instance.data.datasets[0].backgroundColor  = colors;
    instance.update();
    return instance;
  }

  return new Chart(canvas, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: '#fff',
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { size: 12, family: "'Segoe UI', system-ui, sans-serif" },
            padding: 14,
            usePointStyle: true,
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${formatRupiah(ctx.parsed)}`,
          },
        },
      },
    },
  });
}

// ── Home chart (semua transaksi)
function renderChart() {
  chartInstance = buildPieChart(
    $('spendingChart'),
    $('chartEmptyState'),
    transactions,
    chartInstance
  );
}

// ── Daily chart (mengikuti filter aktif)
function renderDailyChart(filteredTxs) {
  dailyChartInstance = buildPieChart(
    $('dailyChart'),
    $('dailyChartEmpty'),
    filteredTxs,
    dailyChartInstance
  );
}

// ── Monthly chart (transaksi bulan yang dipilih)
function renderMonthlyChart(monthTxs) {
  monthlyChartInstance = buildPieChart(
    $('monthlyChart'),
    $('monthlyChartEmpty'),
    monthTxs,
    monthlyChartInstance
  );
}

/* ─────────────────────────────────────────
   RENDER: CUSTOM CATEGORY TAGS
───────────────────────────────────────── */
function renderCustomCatList() {
  if (customCategories.length === 0) {
    customCatListEl.innerHTML = '<span style="font-size:0.8rem;color:var(--color-muted)">No custom categories yet.</span>';
    return;
  }

  customCatListEl.innerHTML = customCategories.map(cat => `
    <span class="custom-cat-tag">
      ${escapeHtml(cat)}
      <button data-cat="${escapeHtml(cat)}" aria-label="Remove ${escapeHtml(cat)}">✕</button>
    </span>
  `).join('');

  customCatListEl.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => removeCustomCategory(btn.dataset.cat));
  });
}

function rebuildCategorySelect() {
  const current = selectCategory.value;
  const allCats = [...DEFAULT_CATEGORIES, ...customCategories];

  selectCategory.innerHTML = '<option value="">-- Select Category --</option>';
  allCats.forEach(cat => {
    const opt = document.createElement('option');
    opt.value       = cat;
    opt.textContent = cat;
    selectCategory.appendChild(opt);
  });

  // Re-select previous value if still valid
  if (allCats.includes(current)) selectCategory.value = current;
}

/* ─────────────────────────────────────────
   ADD / REMOVE CUSTOM CATEGORY
───────────────────────────────────────── */
addCategoryBtn.addEventListener('click', () => {
  const errEl = $('err-newCategory');
  const val   = newCategoryInput.value.trim();

  if (!val) {
    errEl.textContent = 'Please enter a category name.';
    errEl.classList.add('visible');
    return;
  }

  const allCats = [...DEFAULT_CATEGORIES, ...customCategories];
  if (allCats.some(c => c.toLowerCase() === val.toLowerCase())) {
    errEl.textContent = 'Category already exists.';
    errEl.classList.add('visible');
    return;
  }

  errEl.classList.remove('visible');
  customCategories.push(val);
  saveCustomCategories();
  newCategoryInput.value = '';
  rebuildCategorySelect();
  renderCustomCatList();
  showToast(`📂 Category "${val}" added`);
});

newCategoryInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); addCategoryBtn.click(); }
});

newCategoryInput.addEventListener('input', () => {
  $('err-newCategory').classList.remove('visible');
});

function removeCustomCategory(cat) {
  customCategories = customCategories.filter(c => c !== cat);
  saveCustomCategories();
  rebuildCategorySelect();
  renderCustomCatList();
  showToast(`🗑️ Category "${cat}" removed`);
}

// Toggle custom category panel
toggleCustomCatBtn.addEventListener('click', () => {
  customCatPanel.classList.toggle('hidden');
  toggleCustomCatBtn.textContent = customCatPanel.classList.contains('hidden')
    ? '⚙️ Manage Categories'
    : '⚙️ Hide Categories';
});

/* ─────────────────────────────────────────
   MONTHLY SUMMARY
───────────────────────────────────────── */
function getMonthTransactions(year, month) {
  // month is 0-indexed
  return transactions.filter(tx => {
    const [y, m] = tx.date.split('-').map(Number);
    return y === year && m === month + 1;
  });
}

function renderMonthlySummary() {
  const year  = currentMonth.getFullYear();
  const month = currentMonth.getMonth(); // 0-indexed

  const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];

  monthLabelEl.textContent = `${MONTH_NAMES[month]} ${year}`;

  const txs   = getMonthTransactions(year, month);
  const total = txs.reduce((s, t) => s + t.amount, 0);

  // Days in this month
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  monthlyTotalEl.textContent = formatRupiah(total);
  monthlyCountEl.textContent = txs.length;
  monthlyAvgEl.textContent   = txs.length
    ? formatRupiah(Math.round(total / daysInMonth))
    : 'Rp 0';

  // Monthly pie chart
  renderMonthlyChart(txs);

  // Category breakdown
  const catTotals = {};
  txs.forEach(tx => {
    catTotals[tx.category] = (catTotals[tx.category] || 0) + tx.amount;
  });

  const sortedCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  const maxVal     = sortedCats.length ? sortedCats[0][1] : 1;

  if (sortedCats.length === 0) {
    monthlyBreakEl.innerHTML = '<p class="empty-state">No spending this month.</p>';
  } else {
    monthlyBreakEl.innerHTML = sortedCats.map(([cat, val], i) => `
      <div class="breakdown-row">
        <span class="breakdown-cat">${getEmoji(cat)} ${escapeHtml(cat)}</span>
        <div class="breakdown-bar-wrap">
          <div class="breakdown-bar"
               style="width:${Math.round((val / maxVal) * 100)}%;background:${getChartColor(i)}">
          </div>
        </div>
        <span class="breakdown-val">${formatRupiah(val)}</span>
      </div>
    `).join('');
  }

  // Monthly transaction list (sorted by date desc)
  const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date));

  if (sorted.length === 0) {
    monthlyTxListEl.innerHTML = '<p class="empty-state">No transactions this month.</p>';
    return;
  }

  monthlyTxListEl.innerHTML = sorted.map(tx => `
    <div class="tx-item" data-category="${escapeHtml(tx.category)}">
      <div class="tx-icon">${getEmoji(tx.category)}</div>
      <div class="tx-info">
        <div class="tx-name">${escapeHtml(tx.name)}</div>
        <div class="tx-meta">${escapeHtml(tx.category)} · ${formatDisplayDate(tx.date)}</div>
      </div>
      <div class="tx-amount">- ${formatRupiah(tx.amount)}</div>
    </div>
  `).join('');
}

prevMonthBtn.addEventListener('click', () => {
  currentMonth.setMonth(currentMonth.getMonth() - 1);
  renderMonthlySummary();
  renderBalance();
});

nextMonthBtn.addEventListener('click', () => {
  currentMonth.setMonth(currentMonth.getMonth() + 1);
  renderMonthlySummary();
  renderBalance();
});

/* ─────────────────────────────────────────
   DAILY VIEW — total spend per tanggal
───────────────────────────────────────── */
function renderDailyView() {
  // Apply date range filter
  const from = filterFromEl.value;  // 'YYYY-MM-DD' or ''
  const to   = filterToEl.value;

  const filtered = transactions.filter(tx => {
    if (from && tx.date < from) return false;
    if (to   && tx.date > to)   return false;
    return true;
  });

  // ── Daily pie chart ────────────────────
  renderDailyChart(filtered);

  // ── Group by date ──────────────────────
  if (filtered.length === 0) {
    dailyListEl.innerHTML = '<p class="empty-state">Tidak ada transaksi.</p>';
    return;
  }

  // Build map: date → { total, txs[] }
  const dateMap = {};
  filtered.forEach(tx => {
    if (!dateMap[tx.date]) dateMap[tx.date] = { total: 0, txs: [] };
    dateMap[tx.date].total += tx.amount;
    dateMap[tx.date].txs.push(tx);
  });

  // Sort dates descending
  const sortedDates = Object.keys(dateMap).sort((a, b) => b.localeCompare(a));

  // Find highest-spend date for 🔥 highlight
  const maxTotal = Math.max(...sortedDates.map(d => dateMap[d].total));

  dailyListEl.innerHTML = sortedDates.map(date => {
    const { total, txs } = dateMap[date];
    const isTop = total === maxTotal && maxTotal > 0;

    // Sort txs within day by amount desc
    const sortedTxs = [...txs].sort((a, b) => b.amount - a.amount);

    const txRows = sortedTxs.map(tx => `
      <div class="tx-item" data-category="${escapeHtml(tx.category)}">
        <div class="tx-icon">${getEmoji(tx.category)}</div>
        <div class="tx-info">
          <div class="tx-name">${escapeHtml(tx.name)}</div>
          <div class="tx-meta">${escapeHtml(tx.category)}</div>
        </div>
        <div class="tx-amount">- ${formatRupiah(tx.amount)}</div>
      </div>
    `).join('');

    return `
      <div class="daily-group${isTop ? ' top-day' : ''}" data-date="${date}">
        <div class="daily-group-header">
          <div class="daily-group-left">
            <span class="daily-date-label">${formatDisplayDate(date)}</span>
            <span class="daily-date-sub">${getDayName(date)}</span>
          </div>
          <div class="daily-group-right">
            <span class="daily-count-badge">${txs.length} item</span>
            <span class="daily-total-badge">${formatRupiah(total)}</span>
            <span class="daily-chevron">▼</span>
          </div>
        </div>
        <div class="daily-group-body">
          ${txRows}
        </div>
      </div>
    `;
  }).join('');

  // Accordion toggle
  dailyListEl.querySelectorAll('.daily-group-header').forEach(header => {
    header.addEventListener('click', () => {
      header.closest('.daily-group').classList.toggle('open');
    });
  });
}

function getDayName(dateStr) {
  const days = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const [y, m, d] = dateStr.split('-').map(Number);
  // Use UTC to avoid timezone offset shifting the day
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return days[day];
}

// Filter listeners
filterFromEl.addEventListener('change', () => { renderDailyView(); renderBalance(); });
filterToEl.addEventListener('change',   () => { renderDailyView(); renderBalance(); });

resetFilterBtn.addEventListener('click', () => {
  filterFromEl.value = '';
  filterToEl.value   = '';
  renderDailyView();
  renderBalance();
});

/* ─────────────────────────────────────────
   TABS
───────────────────────────────────────── */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Update panels
    const target = btn.dataset.tab;
    activeTab = target;
    document.querySelectorAll('.tab-content').forEach(panel => {
      panel.classList.toggle('hidden', panel.id !== `tab-${target}`);
      panel.classList.toggle('active', panel.id === `tab-${target}`);
    });

    if (target === 'monthly') renderMonthlySummary();
    if (target === 'daily')   renderDailyView();
    renderBalance();
  });
});

/* ─────────────────────────────────────────
   SECURITY: HTML ESCAPE
───────────────────────────────────────── */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ─────────────────────────────────────────
   RENDER ALL (single update cycle)
───────────────────────────────────────── */
function renderAll() {
  renderBalance();
  renderTransactionList();
  renderChart();
  // Monthly re-renders only when that tab is visible
  if (!$('tab-monthly').classList.contains('hidden')) {
    renderMonthlySummary();
  }
  // Daily re-renders only when that tab is visible
  if (!$('tab-daily').classList.contains('hidden')) {
    renderDailyView();
  }
}

/* ─────────────────────────────────────────
   INITIALISE
───────────────────────────────────────── */
function init() {
  loadTransactions();
  loadCustomCategories();

  // Set date input default to today
  inputDate.value = getTodayString();

  // Build category select with any saved custom categories
  rebuildCategorySelect();
  renderCustomCatList();

  // Initial render
  renderAll();
}

init();
