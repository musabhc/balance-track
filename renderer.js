const monthNames = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık'
];

const state = {
  data: {
    salaries: [],
    expenses: [],
    recurringExpenses: [],
    installmentPlans: [],
    settings: { currency: 'TRY' }
  },
  selectedYear: new Date().getFullYear(),
  selectedMonth: 'all'
};

const formatCurrency = (value) =>
  new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: state.data.settings.currency || 'TRY'
  }).format(value || 0);

const parseAmount = (value) => {
  const cleaned = String(value || '').replace(',', '.');
  const number = Number.parseFloat(cleaned);
  return Number.isFinite(number) ? number : 0;
};

const monthKey = (year, index) => `${year}-${String(index + 1).padStart(2, '0')}`;

const parseMonthKey = (key) => {
  const [year, month] = key.split('-').map(Number);
  return { year, month };
};

const addMonths = (key, offset) => {
  const { year, month } = parseMonthKey(key);
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const monthsBetween = (startKey, endKey) => {
  const start = parseMonthKey(startKey);
  const end = parseMonthKey(endKey);
  return (end.year - start.year) * 12 + (end.month - start.month);
};

const calculateEffectiveMonth = (purchaseDateStr) => {
  const date = new Date(purchaseDateStr);
  const settings = state.data.settings;

  // Apply bank settlement delay
  const effectiveDate = new Date(date);
  effectiveDate.setDate(date.getDate() + (settings.settlementDelay || 0));

  // Calculate cutoff for the effective date's month
  let cutoffDay;
  if (settings.cutoffMethod === 'relative') {
    const lastDay = new Date(effectiveDate.getFullYear(), effectiveDate.getMonth() + 1, 0).getDate();
    cutoffDay = lastDay - (settings.cutoffValue || 0);
  } else {
    cutoffDay = settings.cutoffValue || 19;
  }

  const resultDate = new Date(effectiveDate);
  if (effectiveDate.getDate() > cutoffDay) {
    resultDate.setMonth(effectiveDate.getMonth() + 1);
  }

  return monthKey(resultDate.getFullYear(), resultDate.getMonth());
};

const createId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const getSalaryForMonth = (key) => {
  const rules = [...state.data.salaries].sort((a, b) => a.startMonth.localeCompare(b.startMonth));
  let amount = 0;
  for (const rule of rules) {
    if (rule.startMonth <= key) {
      amount = rule.amount;
    }
  }
  return amount;
};

const manualExpensesForMonth = (key) =>
  state.data.expenses
    .filter((expense) => expense.date && expense.date.startsWith(key))
    .map((expense) => ({ ...expense, source: 'manual' }));

const recurringExpensesForMonth = (key) =>
  state.data.recurringExpenses
    .filter((rule) => {
      if (!rule.startMonth) {
        return false;
      }
      if (rule.startMonth > key) {
        return false;
      }
      if (rule.endMonth && rule.endMonth < key) {
        return false;
      }
      return true;
    })
    .map((rule) => ({
      id: rule.id,
      date: `${key}-01`,
      amount: rule.amount,
      category: rule.category,
      label: rule.label,
      source: 'recurring'
    }));

const installmentExpensesForMonth = (key) =>
  state.data.installmentPlans
    .filter((plan) => {
      if (!plan.startMonth || !plan.months) {
        return false;
      }
      const endKey = addMonths(plan.startMonth, plan.months - 1);
      return plan.startMonth <= key && key <= endKey;
    })
    .map((plan) => {
      const index = monthsBetween(plan.startMonth, key) + 1;
      const amount = plan.totalAmount / plan.months;
      return {
        id: plan.id,
        date: `${key}-01`,
        amount,
        category: plan.category,
        label: `${plan.label} (Taksit ${index}/${plan.months})`,
        source: 'installment'
      };
    });

const expensesForMonth = (key) => [
  ...manualExpensesForMonth(key),
  ...recurringExpensesForMonth(key),
  ...installmentExpensesForMonth(key)
];

const expensesForYear = (year) => {
  const entries = state.data.expenses
    .filter((expense) => expense.date && expense.date.startsWith(String(year)))
    .map((expense) => ({ ...expense, source: 'manual' }));

  monthNames.forEach((_, index) => {
    const key = monthKey(year, index);
    entries.push(...recurringExpensesForMonth(key));
    entries.push(...installmentExpensesForMonth(key));
  });

  return entries;
};

const totalExpensesForMonth = (key) =>
  expensesForMonth(key).reduce((sum, expense) => sum + expense.amount, 0);

const totalIncomeForYear = (year) =>
  monthNames.reduce((sum, _, index) => sum + getSalaryForMonth(monthKey(year, index)), 0);

const getYearRange = () => {
  const years = new Set([new Date().getFullYear()]);
  state.data.salaries.forEach((salary) => {
    if (salary.startMonth) {
      years.add(Number(salary.startMonth.split('-')[0]));
    }
  });
  state.data.expenses.forEach((expense) => {
    if (expense.date) {
      years.add(Number(expense.date.split('-')[0]));
    }
  });
  state.data.recurringExpenses.forEach((rule) => {
    if (rule.startMonth) {
      years.add(Number(rule.startMonth.split('-')[0]));
    }
    if (rule.endMonth) {
      years.add(Number(rule.endMonth.split('-')[0]));
    }
  });
  state.data.installmentPlans.forEach((plan) => {
    if (plan.startMonth && plan.months) {
      years.add(Number(plan.startMonth.split('-')[0]));
      const endKey = addMonths(plan.startMonth, plan.months - 1);
      years.add(Number(endKey.split('-')[0]));
    }
  });
  const list = [...years].filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.includes(state.selectedYear)) {
    list.push(state.selectedYear);
    list.sort((a, b) => a - b);
  }
  return list;
};

const showToast = (message) => {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
};

const renderYearOptions = () => {
  const select = document.getElementById('yearSelect');
  select.innerHTML = '';
  getYearRange().forEach((year) => {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    if (year === state.selectedYear) {
      option.selected = true;
    }
    select.appendChild(option);
  });
};

const renderMonthFilter = () => {
  const select = document.getElementById('monthFilter');
  select.innerHTML = '';
  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = 'Hepsi';
  select.appendChild(allOption);
  monthNames.forEach((name, index) => {
    const option = document.createElement('option');
    option.value = monthKey(state.selectedYear, index);
    option.textContent = name;
    select.appendChild(option);
  });
  select.value = state.selectedMonth;
};

const renderMonthTable = () => {
  const body = document.getElementById('monthTable');
  body.innerHTML = '';
  monthNames.forEach((name, index) => {
    const key = monthKey(state.selectedYear, index);
    const salary = getSalaryForMonth(key);
    const totalExpense = totalExpensesForMonth(key);
    const remaining = salary - totalExpense;

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${name}</td>
      <td>${formatCurrency(salary)}</td>
      <td>${formatCurrency(totalExpense)}</td>
      <td class="${remaining >= 0 ? 'positive' : 'negative'}">${formatCurrency(remaining)}</td>
    `;
    body.appendChild(row);
  });
};

const renderSalaryList = () => {
  const list = document.getElementById('salaryList');
  list.innerHTML = '';
  const sorted = [...state.data.salaries].sort((a, b) => a.startMonth.localeCompare(b.startMonth));
  sorted.forEach((rule) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div>
        <strong>${rule.startMonth}</strong>
        <small>Yeni maaş: ${formatCurrency(rule.amount)}</small>
      </div>
      <div class="list-actions">
        <button class="icon-btn edit-btn" data-id="${rule.id}">Düzenle</button>
        <button class="icon-btn" data-id="${rule.id}">Sil</button>
      </div>
    `;
    list.appendChild(item);
  });

  list.querySelectorAll('button[data-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.getAttribute('data-id');
      const confirmed = await window.api.confirm('Bu maaş kaydını silmek istediğinizden emin misiniz?');
      if (confirmed) {
        state.data.salaries = state.data.salaries.filter((rule) => rule.id !== id);
        saveAndRender();
      }
    });
  });
};

const sourceLabel = (source) => {
  if (source === 'recurring') {
    return 'Tekrarlayan';
  }
  if (source === 'installment') {
    return 'Taksit';
  }
  return 'Tek sefer';
};

const renderExpenses = () => {
  const list = document.getElementById('expenseList');
  list.innerHTML = '';

  const expenses =
    state.selectedMonth === 'all'
      ? expensesForYear(state.selectedYear)
      : expensesForMonth(state.selectedMonth);

  const sorted = expenses.sort((a, b) => b.date.localeCompare(a.date));

  if (sorted.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'list-item';
    empty.textContent = 'Henüz harcama yok.';
    list.appendChild(empty);
    return;
  }

  sorted.forEach((expense) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div>
        <strong>${expense.label || 'Harcama'}</strong>
        <small>${expense.date} · ${expense.category || 'Genel'}</small>
      </div>
      <div class="list-actions">
        <span class="tag">${sourceLabel(expense.source)}</span>
        <span>${formatCurrency(expense.amount)}</span>
        <button class="icon-btn edit-btn" data-id="${expense.id}" data-source="${expense.source || 'direct'}">Düzenle</button>
        <button class="icon-btn" data-id="${expense.id}" data-source="${expense.source || 'direct'}">Sil</button>
      </div>
    `;
    list.appendChild(item);
  });

  list.querySelectorAll('button[data-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.getAttribute('data-id');
      const source = button.getAttribute('data-source');
      const confirmed = await window.api.confirm('Bu harcamayı silmek istediğinizden emin misiniz?');
      if (!confirmed) return;

      if (source === 'recurring') {
        state.data.recurringExpenses = state.data.recurringExpenses.filter((rule) => rule.id !== id);
        showToast('Tekrarlayan harcama silindi.');
      } else if (source === 'installment') {
        state.data.installmentPlans = state.data.installmentPlans.filter((plan) => plan.id !== id);
        showToast('Taksitli alım silindi.');
      } else {
        state.data.expenses = state.data.expenses.filter((expense) => expense.id !== id);
      }
      saveAndRender();
    });
  });
};

const renderRecurringList = () => {
  const list = document.getElementById('recurringList');
  list.innerHTML = '';
  const sorted = [...state.data.recurringExpenses].sort((a, b) =>
    a.startMonth.localeCompare(b.startMonth)
  );

  if (sorted.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'list-item';
    empty.textContent = 'Tekrarlayan harcama yok.';
    list.appendChild(empty);
    return;
  }

  sorted.forEach((rule) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    const endText = rule.endMonth ? rule.endMonth : 'Süresiz';
    item.innerHTML = `
      <div>
        <strong>${rule.label || 'Tekrarlayan harcama'}</strong>
        <small>${rule.startMonth} → ${endText} · ${rule.category || 'Genel'}</small>
      </div>
      <div class="list-actions">
        <span>${formatCurrency(rule.amount)}</span>
        <button class="icon-btn" data-id="${rule.id}">Sil</button>
      </div>
    `;
    list.appendChild(item);
  });

  list.querySelectorAll('button[data-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.getAttribute('data-id');
      const confirmed = await window.api.confirm('Bu tekrarlayan harcamayı silmek istediğinizden emin misiniz?');
      if (confirmed) {
        state.data.recurringExpenses = state.data.recurringExpenses.filter((rule) => rule.id !== id);
        saveAndRender();
      }
    });
  });
};

const renderInstallmentList = () => {
  const list = document.getElementById('installmentList');
  list.innerHTML = '';
  const sorted = [...state.data.installmentPlans].sort((a, b) =>
    a.startMonth.localeCompare(b.startMonth)
  );

  if (sorted.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'list-item';
    empty.textContent = 'Taksitli alım yok.';
    list.appendChild(empty);
    return;
  }

  sorted.forEach((plan) => {
    const monthly = plan.totalAmount / plan.months;
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div>
        <strong>${plan.label || 'Taksitli alım'}</strong>
        <small>${plan.startMonth} · ${plan.months} taksit · ${plan.category || 'Genel'}</small>
      </div>
      <div class="list-actions">
        <span>${formatCurrency(monthly)}</span>
        <button class="icon-btn" data-id="${plan.id}">Sil</button>
      </div>
    `;
    list.appendChild(item);
  });

  list.querySelectorAll('button[data-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.getAttribute('data-id');
      const confirmed = await window.api.confirm('Bu taksit planını silmek istediğinizden emin misiniz?');
      if (confirmed) {
        state.data.installmentPlans = state.data.installmentPlans.filter((plan) => plan.id !== id);
        saveAndRender();
      }
    });
  });
};

const renderAnalytics = () => {
  const today = new Date();
  const currentKey = monthKey(today.getFullYear(), today.getMonth());
  const currentSalary = getSalaryForMonth(currentKey);
  const currentSpend = totalExpensesForMonth(currentKey);
  const currentRemaining = currentSalary - currentSpend;

  const yearExpenses = expensesForYear(state.selectedYear);
  const totalExpense = yearExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const totalIncome = totalIncomeForYear(state.selectedYear);
  const yearRemaining = totalIncome - totalExpense;

  const averageSpend = totalExpense / 12;

  const categoryTotals = yearExpenses.reduce((acc, expense) => {
    const key = expense.category || 'Genel';
    acc[key] = (acc[key] || 0) + expense.amount;
    return acc;
  }, {});
  const topCategory =
    Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0] || ['Yok', 0];

  document.getElementById('currentRemaining').textContent = formatCurrency(currentRemaining);
  document.getElementById('currentSpend').textContent = formatCurrency(currentSpend);
  document.getElementById('yearRemaining').textContent = formatCurrency(yearRemaining);
  document.getElementById('avgSpend').textContent = formatCurrency(averageSpend);
  document.getElementById('topCategory').textContent = `${topCategory[0]} ${formatCurrency(
    topCategory[1]
  )}`;
};

const renderVersion = async () => {
  const version = await window.api.appVersion();
  const badge = document.getElementById('appVersion');
  badge.textContent = `v${version}`;
};

const renderSettings = () => {
  const s = state.data.settings;
  document.getElementById('cutoffMethod').value = s.cutoffMethod;
  document.getElementById('cutoffValue').value = s.cutoffValue;
  document.getElementById('settlementDelay').value = s.settlementDelay;
};

const renderAll = () => {
  renderSettings();
  renderYearOptions();
  renderMonthFilter();
  renderMonthTable();
  renderSalaryList();
  renderRecurringList();
  renderInstallmentList();
  renderExpenses();
  renderAnalytics();
};

const saveAndRender = async () => {
  state.data = await window.api.dataSave(state.data);
  renderAll();
};

const handleSalarySubmit = (event) => {
  event.preventDefault();
  const startMonth = document.getElementById('salaryStart').value;
  const amount = parseAmount(document.getElementById('salaryAmount').value);
  if (!startMonth || amount <= 0) {
    showToast('Maaş bilgilerini kontrol edin.');
    return;
  }

  const existing = state.data.salaries.find((rule) => rule.startMonth === startMonth);
  if (existing) {
    existing.amount = amount;
  } else {
    state.data.salaries.push({ id: createId(), startMonth, amount });
  }
  document.getElementById('salaryAmount').value = '';
  saveAndRender();
};

const handleRecurringSubmit = (event) => {
  event.preventDefault();
  const startMonth = document.getElementById('recurringStart').value;
  const endMonth = document.getElementById('recurringEnd').value;
  const amount = parseAmount(document.getElementById('recurringAmount').value);
  const category = document.getElementById('recurringCategory').value.trim();
  const note = document.getElementById('recurringNote').value.trim();

  if (!startMonth || amount <= 0) {
    showToast('Tekrarlayan harcama bilgilerini kontrol edin.');
    return;
  }

  if (endMonth && endMonth < startMonth) {
    showToast('Bitiş ayı başlangıçtan önce olamaz.');
    return;
  }

  state.data.recurringExpenses.push({
    id: createId(),
    startMonth,
    endMonth: endMonth || null,
    amount,
    category,
    label: note
  });

  document.getElementById('recurringAmount').value = '';
  document.getElementById('recurringCategory').value = '';
  document.getElementById('recurringNote').value = '';
  document.getElementById('recurringEnd').value = '';
  saveAndRender();
};

const handleInstallmentSubmit = (event) => {
  event.preventDefault();
  const purchaseDate = document.getElementById('installmentStart').value;
  const totalAmount = parseAmount(document.getElementById('installmentTotal').value);
  const months = Number.parseInt(document.getElementById('installmentMonths').value, 10);
  const category = document.getElementById('installmentCategory').value.trim();
  const note = document.getElementById('installmentNote').value.trim();

  if (!purchaseDate || totalAmount <= 0 || !Number.isFinite(months) || months < 2) {
    showToast('Taksit bilgilerini kontrol edin.');
    return;
  }

  const startMonth = calculateEffectiveMonth(purchaseDate);

  state.data.installmentPlans.push({
    id: createId(),
    purchaseDate,
    startMonth,
    totalAmount,
    months,
    category,
    label: note
  });

  document.getElementById('installmentTotal').value = '';
  document.getElementById('installmentMonths').value = '';
  document.getElementById('installmentCategory').value = '';
  document.getElementById('installmentNote').value = '';
  saveAndRender();
};

const handleExpenseSubmit = (event) => {
  event.preventDefault();
  const date = document.getElementById('expenseDate').value;
  const amount = parseAmount(document.getElementById('expenseAmount').value);
  const category = document.getElementById('expenseCategory').value.trim();
  const note = document.getElementById('expenseNote').value.trim();

  if (!date || amount <= 0) {
    showToast('Tutar ve tarih gerekli.');
    return;
  }

  state.data.expenses.push({
    id: createId(),
    date,
    amount,
    category,
    label: note
  });

  document.getElementById('expenseAmount').value = '';
  document.getElementById('expenseCategory').value = '';
  document.getElementById('expenseNote').value = '';
  saveAndRender();
};

const init = async () => {
  state.data = await window.api.dataLoad();

  const today = new Date();
  document.getElementById('expenseDate').value = today.toISOString().split('T')[0];
  document.getElementById('recurringStart').value = today.toISOString().slice(0, 7);
  document.getElementById('installmentStart').value = today.toISOString().split('T')[0];

  renderAll();
  renderVersion();

  document.getElementById('salaryForm').addEventListener('submit', handleSalarySubmit);
  document.getElementById('recurringForm').addEventListener('submit', handleRecurringSubmit);
  document.getElementById('installmentForm').addEventListener('submit', handleInstallmentSubmit);
  document.getElementById('expenseForm').addEventListener('submit', handleExpenseSubmit);

  const syncSettings = () => {
    state.data.settings.cutoffMethod = document.getElementById('cutoffMethod').value;
    state.data.settings.cutoffValue = Number(document.getElementById('cutoffValue').value);
    state.data.settings.settlementDelay = Number(document.getElementById('settlementDelay').value);
    saveAndRender();
  };

  document.getElementById('cutoffMethod').addEventListener('change', syncSettings);
  document.getElementById('cutoffValue').addEventListener('change', syncSettings);
  document.getElementById('settlementDelay').addEventListener('change', syncSettings);

  document.getElementById('toggleSettings').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('settingsMenu').classList.toggle('show');
  });

  document.addEventListener('click', (e) => {
    const menu = document.getElementById('settingsMenu');
    const btn = document.getElementById('toggleSettings');
    if (menu.classList.contains('show') && !menu.contains(e.target) && e.target !== btn) {
      menu.classList.remove('show');
    }
  });

  document.getElementById('yearSelect').addEventListener('change', (event) => {
    state.selectedYear = Number(event.target.value);
    state.selectedMonth = 'all';
    renderAll();
  });

  document.getElementById('monthFilter').addEventListener('change', (event) => {
    state.selectedMonth = event.target.value;
    renderExpenses();
  });

  document.getElementById('backupExport').addEventListener('click', async () => {
    const result = await window.api.dataExport(state.data);
    if (result.status === 'saved') {
      showToast('Yedek kaydedildi.');
    }
  });

  document.getElementById('backupImport').addEventListener('click', async () => {
    const result = await window.api.dataImport();
    if (result.status === 'loaded') {
      state.data = result.data;

      // Auto-switch to a year that has data
      const yearsWithData = getYearRange().filter(y => y !== new Date().getFullYear());
      if (yearsWithData.length > 0) {
        state.selectedYear = Math.max(...yearsWithData);
      }

      await saveAndRender();
      showToast('Yedek yüklendi.');
    } else if (result.status === 'error') {
      showToast('Yedek okunamadı.');
    }
  });

  document.getElementById('checkUpdates').addEventListener('click', async () => {
    const result = await window.api.updateCheck();
    if (result.status === 'dev') {
      showToast('Güncelleme kontrolü sadece kurulu sürümde çalışır.');
    }
  });

  window.api.onUpdateStatus((message) => {
    if (message) {
      showToast(message);
    }
  });

  // Modal Setup
  const editModal = document.getElementById('editModal');
  const editForm = document.getElementById('editForm');
  let currentEditingItem = null;

  const closeEditModal = () => {
    editModal.classList.add('hidden');
    editForm.innerHTML = '';
    currentEditingItem = null;
  };

  document.getElementById('closeModal').addEventListener('click', closeEditModal);
  document.getElementById('cancelEdit').addEventListener('click', closeEditModal);
  document.getElementById('saveEdit').addEventListener('click', () => editForm.requestSubmit());

  const setupEditDelegation = (listId, type) => {
    const list = document.getElementById(listId);
    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('.edit-btn');
      if (!btn) return;

      const id = btn.getAttribute('data-id');
      const source = btn.getAttribute('data-source');
      let item;

      if (type === 'salary') item = state.data.salaries.find(s => s.id === id);
      else if (type === 'recurring') item = state.data.recurringExpenses.find(r => r.id === id);
      else if (type === 'installment') item = state.data.installmentPlans.find(i => i.id === id);
      else if (type === 'expense') {
        if (source !== 'direct') {
          showToast('Taksit veya düzenli harcamaları ana listelerinden düzenleyin.');
          return;
        }
        item = state.data.expenses.find(ex => ex.id === id);
      }

      if (item) openEditModal(type, item);
    });
  };

  ['salaryList', 'recurringList', 'installmentList', 'expenseList'].forEach(id => {
    const type = id.replace('List', '').toLowerCase();
    setupEditDelegation(id, type === 'expens' ? 'expense' : type); // fix typo from list mapping
  });

  const openEditModal = (type, item) => {
    currentEditingItem = { type, id: item.id };
    document.getElementById('modalTitle').textContent = `${type.charAt(0).toUpperCase() + type.slice(1)} Düzenle`;
    editForm.innerHTML = '';

    const fields = [];
    if (type === 'salary') {
      fields.push({ label: 'Başlangıç Ayı', id: 'editSalaryStart', type: 'month', value: item.startMonth });
      fields.push({ label: 'Tutar', id: 'editSalaryAmount', type: 'number', value: item.amount });
    } else if (type === 'expense') {
      fields.push({ label: 'Tarih', id: 'editExpenseDate', type: 'date', value: item.date });
      fields.push({ label: 'Tutar', id: 'editExpenseAmount', type: 'number', value: item.amount });
      fields.push({ label: 'Kategori', id: 'editExpenseCategory', type: 'text', value: item.category });
      fields.push({ label: 'Açıklama', id: 'editExpenseLabel', type: 'text', value: item.label });
    } else if (type === 'recurring') {
      fields.push({ label: 'Başlangıç Ayı', id: 'editRecurringStart', type: 'month', value: item.startMonth });
      fields.push({ label: 'Tutar', id: 'editRecurringAmount', type: 'number', value: item.amount });
      fields.push({ label: 'Kategori', id: 'editRecurringCategory', type: 'text', value: item.category });
      fields.push({ label: 'Açıklama', id: 'editRecurringNote', type: 'text', value: item.label });
      fields.push({ label: 'Bitiş Ayı (Opsiyonel)', id: 'editRecurringEnd', type: 'month', value: item.endMonth || '' });
    } else if (type === 'installment') {
      fields.push({ label: 'Alım Tarihi', id: 'editInstallmentDate', type: 'date', value: item.purchaseDate });
      fields.push({ label: 'Toplam Tutar', id: 'editInstallmentTotal', type: 'number', value: item.totalAmount });
      fields.push({ label: 'Taksit Sayısı', id: 'editInstallmentMonths', type: 'number', value: item.months });
      fields.push({ label: 'Kategori', id: 'editInstallmentCategory', type: 'text', value: item.category });
      fields.push({ label: 'Açıklama', id: 'editInstallmentNote', type: 'text', value: item.label });
    }

    fields.forEach(f => {
      const group = document.createElement('div');
      group.className = 'form-group';
      group.innerHTML = `<label>${f.label}</label><input type="${f.type}" id="${f.id}" value="${f.value}" required />`;
      editForm.appendChild(group);
    });

    editModal.classList.remove('hidden');
  };

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentEditingItem) return;

    const { type, id } = currentEditingItem;
    if (type === 'salary') {
      const item = state.data.salaries.find(s => s.id === id);
      item.startMonth = document.getElementById('editSalaryStart').value;
      item.amount = parseAmount(document.getElementById('editSalaryAmount').value);
    } else if (type === 'expense') {
      const item = state.data.expenses.find(ex => ex.id === id);
      item.date = document.getElementById('editExpenseDate').value;
      item.amount = parseAmount(document.getElementById('editExpenseAmount').value);
      item.category = document.getElementById('editExpenseCategory').value.trim();
      item.label = document.getElementById('editExpenseLabel').value.trim();
    } else if (type === 'recurring') {
      const item = state.data.recurringExpenses.find(r => r.id === id);
      item.startMonth = document.getElementById('editRecurringStart').value;
      item.amount = parseAmount(document.getElementById('editRecurringAmount').value);
      item.category = document.getElementById('editRecurringCategory').value.trim();
      item.label = document.getElementById('editRecurringNote').value.trim();
      item.endMonth = document.getElementById('editRecurringEnd').value || null;
    } else if (type === 'installment') {
      const item = state.data.installmentPlans.find(i => i.id === id);
      const purchaseDate = document.getElementById('editInstallmentDate').value;
      item.purchaseDate = purchaseDate;
      item.startMonth = calculateEffectiveMonth(purchaseDate);
      item.totalAmount = parseAmount(document.getElementById('editInstallmentTotal').value);
      item.months = parseInt(document.getElementById('editInstallmentMonths').value);
      item.category = document.getElementById('editInstallmentCategory').value.trim();
      item.label = document.getElementById('editInstallmentNote').value.trim();
    }

    await saveAndRender();
    closeEditModal();
    showToast('Değişiklikler kaydedildi.');
  });
};

init();
