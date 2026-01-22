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

const expensesForMonth = (key) =>
  state.data.expenses.filter((expense) => expense.date && expense.date.startsWith(key));

const expensesForYear = (year) =>
  state.data.expenses.filter((expense) => expense.date && expense.date.startsWith(String(year)));

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
        <button class="icon-btn" data-id="${rule.id}">Sil</button>
      </div>
    `;
    list.appendChild(item);
  });

  list.querySelectorAll('button[data-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.getAttribute('data-id');
      state.data.salaries = state.data.salaries.filter((rule) => rule.id !== id);
      saveAndRender();
    });
  });
};

const renderExpenses = () => {
  const list = document.getElementById('expenseList');
  list.innerHTML = '';
  const expenses = state.data.expenses
    .filter((expense) => {
      if (!expense.date) {
        return false;
      }
      const [year, month] = expense.date.split('-');
      if (Number(year) !== state.selectedYear) {
        return false;
      }
      if (state.selectedMonth === 'all') {
        return true;
      }
      return expense.date.startsWith(state.selectedMonth);
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  if (expenses.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'list-item';
    empty.textContent = 'Henüz harcama yok.';
    list.appendChild(empty);
    return;
  }

  expenses.forEach((expense) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div>
        <strong>${expense.label || 'Harcama'}</strong>
        <small>${expense.date} · ${expense.category || 'Genel'}</small>
      </div>
      <div class="list-actions">
        <span>${formatCurrency(expense.amount)}</span>
        <button class="icon-btn" data-id="${expense.id}">Sil</button>
      </div>
    `;
    list.appendChild(item);
  });

  list.querySelectorAll('button[data-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.getAttribute('data-id');
      state.data.expenses = state.data.expenses.filter((expense) => expense.id !== id);
      saveAndRender();
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

const renderAll = () => {
  renderYearOptions();
  renderMonthFilter();
  renderMonthTable();
  renderSalaryList();
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

  renderAll();
  renderVersion();

  document.getElementById('salaryForm').addEventListener('submit', handleSalarySubmit);
  document.getElementById('expenseForm').addEventListener('submit', handleExpenseSubmit);

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
};

init();
