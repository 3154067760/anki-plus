const state = {
  frontImages: [],
  backImages: [],
  frontAudio: '',
  backAudio: '',
  reviewQueue: [],
  currentCard: null,
  mediaRecorder: null,
  recordingSide: null,
  cardListFilter: null,
  detailCardId: null,
  editingId: null,
  searchKeyword: ''
};

const FILTER_TITLES = { all: '总卡片', due: '待复习', new: '新卡片' };

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('show');
  setTimeout(() => {
    el.classList.add('hidden');
    el.classList.remove('show');
  }, 2500);
}

function switchTab(name) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
  if (name === 'review') loadReview();
  if (name === 'settings') loadSettings();
  if (name === 'manage') loadManageList();
}

function cardPreviewText(card) {
  if (card.front_text) return card.front_text;
  if (card.front_images?.length) return '[图片]';
  if (card.front_audio) return '[音频]';
  return '（空）';
}

function formatDueDate(ts) {
  const now = Date.now();
  const diff = ts - now;
  const dayMs = 86400000;
  if (diff <= 0) return '待复习';
  const days = Math.ceil(diff / dayMs);
  if (days === 1) return '明天';
  if (days < 30) return `${days}天后`;
  if (days < 365) return `${Math.round(days / 30)}个月后`;
  return `${(days / 365).toFixed(1)}年后`;
}

function formatDate(ts) {
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

function renderCardListItems(cards, { showActions = false } = {}) {
  if (cards.length === 0) {
    return '<div class="card-list-empty">暂无卡片</div>';
  }
  return cards.map(card => {
    const thumb = card.front_images?.[0]
      ? `<img class="card-list-thumb" src="${card.front_images[0]}" alt="">` : '';
    let badge = '';
    if (card.repetitions === 0) badge = '<span class="card-list-badge new">新</span>';
    else if (card.due_date <= Date.now()) badge = '<span class="card-list-badge due">待复习</span>';
    else badge = `<span class="card-list-badge">${formatDueDate(card.due_date)}</span>`;
    const actions = showActions ? `
      <div class="card-list-actions">
        <button type="button" class="btn btn-outline btn-sm card-edit-btn" data-id="${card.id}">编辑</button>
        <button type="button" class="btn btn-danger btn-sm card-delete-btn" data-id="${card.id}">删除</button>
      </div>` : '';
    return `<div class="card-list-item" data-id="${card.id}">
      ${thumb}
      <span class="card-list-preview">${escapeHtml(cardPreviewText(card))}</span>
      ${badge}
      ${actions}
    </div>`;
  }).join('');
}

async function loadCardList(filter) {
  state.cardListFilter = filter;
  $$('.stat-clickable').forEach(el => el.classList.toggle('active', el.dataset.filter === filter));

  const query = filter === 'all' ? '' : `?filter=${filter}`;
  const cards = await api(`/cards${query}`);

  $('#cardListTitle').textContent = FILTER_TITLES[filter] + `（${cards.length}）`;
  $('#cardListBody').innerHTML = renderCardListItems(cards);
  $('#cardListPanel').classList.remove('hidden');
}

async function loadManageList(keyword) {
  if (keyword !== undefined) state.searchKeyword = keyword;
  const q = state.searchKeyword.trim();
  const path = q ? `/cards?search=${encodeURIComponent(q)}` : '/cards';
  const cards = await api(path);
  $('#manageListBody').innerHTML = renderCardListItems(cards, { showActions: true });
}

async function deleteCardById(id) {
  if (!confirm('确定删除这张卡片吗？')) return;
  await api(`/cards/${id}`, { method: 'DELETE' });
  toast('卡片已删除');
  refreshStats();
  if (state.cardListFilter) await loadCardList(state.cardListFilter);
  if ($('#tab-manage').classList.contains('active')) await loadManageList();
  if (state.detailCardId === id) closeCardDetail();
  if (state.editingId === id) clearForm();
}

function closeCardList() {
  state.cardListFilter = null;
  $$('.stat-clickable').forEach(el => el.classList.remove('active'));
  $('#cardListPanel').classList.add('hidden');
}

async function openCardDetail(id) {
  const card = await api(`/cards/${id}`);
  state.detailCardId = id;
  $('#detailFront').innerHTML = renderCardContent('front', card);
  $('#detailBack').innerHTML = renderCardContent('back', card);
  const status = card.repetitions === 0 ? '新卡片'
    : card.due_date <= Date.now() ? '待复习' : formatDueDate(card.due_date);
  $('#detailMeta').innerHTML = `
    <div>状态：${status}</div>
    <div>复习次数：${card.repetitions} 次</div>
    <div>当前间隔：${card.interval || 0} 天</div>
    <div>创建时间：${formatDate(card.created_at)}</div>
  `;
  $('#cardDetailModal').classList.remove('hidden');
}

function closeCardDetail() {
  state.detailCardId = null;
  $('#cardDetailModal').classList.add('hidden');
}

async function deleteDetailCard() {
  if (!state.detailCardId) return;
  await deleteCardById(state.detailCardId);
  closeCardDetail();
}

function loadFormFromCard(card) {
  state.editingId = card.id;
  state.frontImages = [...(card.front_images || [])];
  state.backImages = [...(card.back_images || [])];
  state.frontAudio = card.front_audio || '';
  state.backAudio = card.back_audio || '';
  $('#frontText').value = card.front_text || '';
  $('#backText').value = card.back_text || '';
  renderImages('front');
  renderImages('back');
  renderAudio('front');
  renderAudio('back');
  $('#editBanner').classList.remove('hidden');
  $('#saveCardBtn').textContent = '保存修改';
  switchTab('create');
}

async function startEditCard(id) {
  const card = await api(`/cards/${id}`);
  closeCardDetail();
  loadFormFromCard(card);
  toast('已进入编辑模式');
}

function cancelEdit() {
  clearForm();
  toast('已取消编辑');
}

async function refreshStats() {
  const stats = await api('/stats');
  $('#dueCount').textContent = stats.due;
  $('#statTotal').textContent = stats.total;
  $('#statDue').textContent = stats.due;
  $('#statNew').textContent = stats.new_cards;
}

function renderImages(side) {
  const urls = side === 'front' ? state.frontImages : state.backImages;
  const zone = $(`#${side}Drop`);
  zone.innerHTML = '';
  if (urls.length === 0) {
    zone.innerHTML = '<span class="drop-hint">粘贴的图片会显示在这里 (Ctrl+V)</span>';
    zone.classList.remove('has-images');
    return;
  }
  zone.classList.add('has-images');
  urls.forEach((url, i) => {
    const div = document.createElement('div');
    div.className = 'img-thumb';
    div.innerHTML = `<img src="${url}" alt=""><button class="remove-img" data-side="${side}" data-idx="${i}">&times;</button>`;
    zone.appendChild(div);
  });
}

function renderAudio(side) {
  const url = side === 'front' ? state.frontAudio : state.backAudio;
  const el = $(`#${side}AudioPreview`);
  el.innerHTML = url ? `<audio controls src="${url}"></audio>` : '';
}

async function uploadFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  if (!res.ok) throw new Error('上传失败');
  const data = await res.json();
  return data.url;
}

async function uploadFiles(files) {
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  const res = await fetch('/api/upload/batch', { method: 'POST', body: fd });
  if (!res.ok) throw new Error('上传失败');
  const data = await res.json();
  return data.urls;
}

async function handlePaste(e, side) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      const url = await uploadFile(file);
      if (side === 'front') state.frontImages.push(url);
      else state.backImages.push(url);
      renderImages(side);
    }
  }
}

function setupDropZone(zone) {
  const side = zone.dataset.side;
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    const urls = await uploadFiles(files);
    if (side === 'front') state.frontImages.push(...urls);
    else state.backImages.push(...urls);
    renderImages(side);
  });
  zone.addEventListener('click', async (e) => {
    if (e.target.classList.contains('remove-img')) {
      const idx = parseInt(e.target.dataset.idx, 10);
      const s = e.target.dataset.side;
      if (s === 'front') state.frontImages.splice(idx, 1);
      else state.backImages.splice(idx, 1);
      renderImages(s);
    }
  });
}

function clearForm() {
  state.editingId = null;
  state.frontImages = [];
  state.backImages = [];
  state.frontAudio = '';
  state.backAudio = '';
  $('#frontText').value = '';
  $('#backText').value = '';
  renderImages('front');
  renderImages('back');
  renderAudio('front');
  renderAudio('back');
  $('#editBanner').classList.add('hidden');
  $('#saveCardBtn').textContent = '保存卡片';
}

async function saveCard() {
  const front_text = $('#frontText').value.trim();
  const back_text = $('#backText').value.trim();
  if (!front_text && !state.frontImages.length) {
    toast('请填写正面内容');
    return;
  }
  const body = {
    front_text,
    back_text,
    front_images: state.frontImages,
    back_images: state.backImages,
    front_audio: state.frontAudio,
    back_audio: state.backAudio
  };
  if (state.editingId) {
    await api(`/cards/${state.editingId}`, { method: 'PUT', body });
    toast('卡片已更新');
  } else {
    await api('/cards', { method: 'POST', body });
    toast('卡片已保存');
  }
  clearForm();
  refreshStats();
  if ($('#tab-manage').classList.contains('active')) await loadManageList();
}

async function toggleRecording(side) {
  const btn = side === 'front' ? $('#frontRecordBtn') : $('#backRecordBtn');
  if (state.mediaRecorder?.state === 'recording' && state.recordingSide === side) {
    state.mediaRecorder.stop();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      btn.classList.remove('recording');
      btn.textContent = '开始录音';
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const file = new File([blob], 'recording.webm', { type: 'audio/webm' });
      const url = await uploadFile(file);
      if (side === 'front') state.frontAudio = url;
      else state.backAudio = url;
      renderAudio(side);
      state.mediaRecorder = null;
      state.recordingSide = null;
    };
    recorder.start();
    state.mediaRecorder = recorder;
    state.recordingSide = side;
    btn.classList.add('recording');
    btn.textContent = '停止录音';
  } catch {
    toast('无法访问麦克风');
  }
}

function renderCardContent(side, card) {
  let html = '';
  const text = side === 'front' ? card.front_text : card.back_text;
  const images = side === 'front' ? card.front_images : card.back_images;
  const audio = side === 'front' ? card.front_audio : card.back_audio;
  if (text) html += `<div>${escapeHtml(text)}</div>`;
  if (images?.length) {
    html += images.map(u => `<img src="${u}" alt="">`).join('');
  }
  if (audio) html += `<audio controls src="${audio}"></audio>`;
  return html || '<p style="color:#94a3b8">（空）</p>';
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function loadReview() {
  state.reviewQueue = await api('/cards/due');
  state.currentCard = null;
  if (state.reviewQueue.length === 0) {
    $('#reviewEmpty').classList.remove('hidden');
    $('#reviewArea').classList.add('hidden');
    return;
  }
  $('#reviewEmpty').classList.add('hidden');
  $('#reviewArea').classList.remove('hidden');
  showNextCard();
}

async function updateGradeLabels() {
  if (!state.currentCard) return;
  const { intervals } = await api(`/cards/${state.currentCard.id}/intervals`);
  intervals.forEach(({ quality, label }) => {
    const el = document.querySelector(`.grade-days[data-for="${quality}"]`);
    if (el) el.textContent = label;
  });
}

function showNextCard() {
  if (state.reviewQueue.length === 0) {
    loadReview();
    return;
  }
  state.currentCard = state.reviewQueue.shift();
  $('#reviewRemaining').textContent = state.reviewQueue.length;
  $('#reviewFront').innerHTML = renderCardContent('front', state.currentCard);
  $('#reviewBack').innerHTML = renderCardContent('back', state.currentCard);
  $('#reviewBack').classList.add('hidden');
  $('#showAnswerArea').classList.remove('hidden');
  $('#gradeArea').classList.add('hidden');
}

async function gradeCard(quality) {
  if (!state.currentCard) return;
  const result = await api(`/cards/${state.currentCard.id}/review`, {
    method: 'POST',
    body: { quality }
  });
  $('#dueCount').textContent = result.stats.due;
  showNextCard();
}

async function loadSettings() {
  const s = await api('/settings');
  $('#initialInterval').value = s.initialInterval;
  $('#graduatingInterval').value = s.graduatingInterval;
  $('#easyBonus').value = s.easyBonus;
  $('#hardInterval').value = s.hardInterval;
  $('#maxInterval').value = s.maxInterval;
  $('#minEase').value = s.minEase;
  $('#newCardsPerDay').value = s.newCardsPerDay;
  $('#reviewsPerDay').value = s.reviewsPerDay;
  refreshStats();
}

async function saveSettings() {
  await api('/settings', {
    method: 'PUT',
    body: {
      initialInterval: parseFloat($('#initialInterval').value),
      graduatingInterval: parseFloat($('#graduatingInterval').value),
      easyBonus: parseFloat($('#easyBonus').value),
      hardInterval: parseFloat($('#hardInterval').value),
      maxInterval: parseFloat($('#maxInterval').value),
      minEase: parseFloat($('#minEase').value),
      newCardsPerDay: parseInt($('#newCardsPerDay').value, 10),
      reviewsPerDay: parseInt($('#reviewsPerDay').value, 10)
    }
  });
  toast('设置已保存');
}

function init() {
  $$('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  $('#frontText').addEventListener('paste', (e) => handlePaste(e, 'front'));
  $('#backText').addEventListener('paste', (e) => handlePaste(e, 'back'));

  setupDropZone($('#frontDrop'));
  setupDropZone($('#backDrop'));

  $$('.batch-upload').forEach(input => {
    input.addEventListener('change', async (e) => {
      const side = e.target.dataset.side;
      const files = [...e.target.files];
      if (!files.length) return;
      const urls = await uploadFiles(files);
      if (side === 'front') state.frontImages.push(...urls);
      else state.backImages.push(...urls);
      renderImages(side);
      e.target.value = '';
    });
  });

  $$('.audio-upload').forEach(input => {
    input.addEventListener('change', async (e) => {
      const side = e.target.dataset.side;
      const file = e.target.files[0];
      if (!file) return;
      const url = await uploadFile(file);
      if (side === 'front') state.frontAudio = url;
      else state.backAudio = url;
      renderAudio(side);
      e.target.value = '';
    });
  });

  $('#frontRecordBtn').addEventListener('click', () => toggleRecording('front'));
  $('#backRecordBtn').addEventListener('click', () => toggleRecording('back'));
  $('#saveCardBtn').addEventListener('click', saveCard);
  $('#clearFormBtn').addEventListener('click', clearForm);
  $('#showAnswerBtn').addEventListener('click', async () => {
    $('#reviewBack').classList.remove('hidden');
    $('#showAnswerArea').classList.add('hidden');
    $('#gradeArea').classList.remove('hidden');
    await updateGradeLabels();
  });
  $$('.grade-btn').forEach(btn => {
    btn.addEventListener('click', () => gradeCard(parseInt(btn.dataset.quality, 10)));
  });
  $('#saveSettingsBtn').addEventListener('click', saveSettings);

  $$('.stat-clickable').forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;
      if (state.cardListFilter === filter) closeCardList();
      else loadCardList(filter);
    });
  });
  $('#closeCardList').addEventListener('click', closeCardList);
  $('#cardListBody').addEventListener('click', (e) => {
    const item = e.target.closest('.card-list-item');
    if (item) openCardDetail(item.dataset.id);
  });

  $('#searchBtn').addEventListener('click', () => loadManageList($('#searchInput').value));
  $('#searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadManageList($('#searchInput').value);
  });
  let searchTimer;
  $('#searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadManageList(e.target.value), 300);
  });
  $('#manageListBody').addEventListener('click', (e) => {
    if (e.target.closest('.card-edit-btn')) {
      e.stopPropagation();
      startEditCard(e.target.closest('.card-edit-btn').dataset.id);
      return;
    }
    if (e.target.closest('.card-delete-btn')) {
      e.stopPropagation();
      deleteCardById(e.target.closest('.card-delete-btn').dataset.id);
      return;
    }
    const item = e.target.closest('.card-list-item');
    if (item) openCardDetail(item.dataset.id);
  });

  $('#cancelEditBtn').addEventListener('click', cancelEdit);
  $('#editCardBtn').addEventListener('click', () => {
    if (state.detailCardId) startEditCard(state.detailCardId);
  });
  $('#closeCardDetail').addEventListener('click', closeCardDetail);
  $('#closeCardDetailBtn').addEventListener('click', closeCardDetail);
  $('#modalBackdrop').addEventListener('click', closeCardDetail);
  $('#deleteCardBtn').addEventListener('click', deleteDetailCard);

  refreshStats();
}

init();
