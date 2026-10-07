const $ = selector => document.querySelector(selector);
let me = null, mode = 'register', next = null, profileUser = null, selectedPhoto = null, previewUrl = null, routeVersion = 0;
let messageTimer;
function notice(text, persistent = false) { clearTimeout(messageTimer); $('#message').textContent = text; $('#message').hidden = !text; if (!persistent) messageTimer = setTimeout(() => { $('#message').hidden = true; }, 6500); }
async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, { method, credentials: 'same-origin', headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Knips-Request': '1' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { if (response.status === 401 && me && !path.endsWith('/login')) { me = null; showSession(); } throw Error(data.error || 'Der Server ist gerade nicht erreichbar.'); }
  return data;
}
function initials(name) { return name.trim().slice(0, 2).toUpperCase(); }
function clearPhoto() { selectedPhoto = null; if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null; $('#photo').value = ''; $('#preview').removeAttribute('src'); $('#preview-wrap').hidden = true; $('#file-label').hidden = false; }
function setMode(value) { mode = value; $('#register-tab').classList.toggle('active', mode === 'register'); $('#login-tab').classList.toggle('active', mode === 'login'); $('#display-label').hidden = mode === 'login'; $('#display-label input').required = mode === 'register'; $('#password').autocomplete = mode === 'register' ? 'new-password' : 'current-password'; $('#password').minLength = mode === 'register' ? 10 : 1; $('#auth-title').textContent = mode === 'register' ? 'Dein Platz ist noch frei.' : 'Schön, dich wiederzusehen.'; $('#auth-help').hidden = mode === 'login'; }
$('#register-tab').addEventListener('click', () => setMode('register'));
$('#login-tab').addEventListener('click', () => setMode('login'));
$('#auth-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = $('#auth-submit'); button.disabled = true;
  try { const fields = Object.fromEntries(new FormData(event.currentTarget)); me = (await api(`/api/${mode}`, { method: 'POST', body: fields })).user; event.currentTarget?.reset(); $('#auth-form').reset(); showSession(); notice(`Hey ${me.displayName}. Schön, dass du da bist.`); }
  catch (error) { notice(error.message, true); } finally { button.disabled = false; }
});
async function logout() { try { await api('/api/logout', { method: 'POST', body: {} }); me = null; clearPhoto(); $('#feed').replaceChildren(); showSession(); notice('Du bist abgemeldet.'); } catch (error) { notice(error.message); } }
$('#logout').addEventListener('click', logout);
function showSession() {
  $('#auth').hidden = !!me; $('#app').hidden = !me;
  if (!me) { routeVersion++; $('#feed').replaceChildren(); $('#profile').replaceChildren(); $('#post-form').reset(); clearPhoto(); return; }
  $('#self-name').textContent = me.displayName; $('#self-handle').textContent = `@${me.username}`; $('#self-avatar').textContent = initials(me.displayName); route();
}
function currentView() { const hash = location.hash.slice(1); if (hash === 'new') return { type: 'new' }; if (hash === 'me') return { type: 'profile', username: me?.username }; const match = hash.match(/^user\/([a-z0-9_]{3,24})$/); return match ? { type: 'profile', username: match[1] } : { type: 'feed' }; }
async function route() {
  if (!me) return; const version = ++routeVersion, view = currentView();
  profileUser = view.type === 'profile' ? view.username : null; next = null;
  $('#nav-feed').classList.toggle('active', view.type === 'feed'); $('#nav-new').classList.toggle('active', view.type === 'new'); $('#nav-me').classList.toggle('active', view.type === 'profile' && view.username === me.username);
  $('#composer').hidden = view.type !== 'new'; $('#feed').hidden = view.type === 'new'; $('#profile').hidden = view.type !== 'profile'; $('#load-more').hidden = true; $('#refresh').hidden = view.type === 'new'; $('#profile').replaceChildren(); $('#feed').replaceChildren();
  $('#page-title').textContent = view.type === 'new' ? 'Dein Moment' : view.type === 'profile' ? 'Fotoalbum' : 'Momente'; $('#page-eyebrow').textContent = view.type === 'new' ? 'BEHALT ES NICHT FÜR DICH' : view.type === 'profile' ? 'EIN BLICK DURCH DEINE LINSE' : 'FRISCH GEKNIPST'; $('#page-subtitle').textContent = view.type === 'new' ? 'Ein Foto reicht, um etwas zu erzählen.' : view.type === 'profile' ? 'Alle geteilten Bilder, vom neuesten zum ältesten.' : 'Die neuesten Bilder aus eurem kleinen Kosmos.';
  if (view.type === 'new') return;
  try {
    if (view.type === 'profile') {
      const info = await api(`/api/profiles/${view.username}`); if (version !== routeVersion || !me) return;
      const avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.textContent = initials(info.user.displayName);
      const details = document.createElement('div'), title = document.createElement('h2'), handle = document.createElement('p'), count = document.createElement('small'); title.textContent = info.user.displayName; handle.textContent = `@${info.user.username}`; count.textContent = `${info.posts} ${info.posts === 1 ? 'Moment' : 'Momente'} geteilt`; details.append(title, handle, count); $('#profile').append(avatar, details);
      if (view.username === me.username) {
        const actions = document.createElement('div'); actions.className = 'account-actions';
        actions.append(actionButton('Abmelden ↗', logout), actionButton('Blockierte Konten', showBlocks), actionButton('Konto löschen', deleteAccount)); $('#profile').append(actions);
        if (me.moderator) actions.append(actionButton('Meldungen prüfen', showModeration));
      }
    }
    await loadFeed(false, version);
  } catch (error) { if (version === routeVersion) { notice(error.message, true); showEmpty('Das hat nicht geklappt.', 'Versuche es gleich noch einmal mit dem Aktualisieren-Knopf.', false); } }
}
function showEmpty(title, text, offerUpload = true) { const box = document.createElement('div'); box.className = 'empty'; const mark = document.createElement('span'); mark.className = 'empty-icon'; mark.textContent = '✳'; const heading = document.createElement('h2'); heading.textContent = title; const paragraph = document.createElement('p'); paragraph.textContent = text; box.append(mark, heading, paragraph); if (offerUpload) { const link = document.createElement('a'); link.href = '#new'; link.textContent = 'Ersten Moment teilen ↗'; box.append(link); } $('#feed').replaceChildren(box); }
async function loadFeed(append = false, version = routeVersion) {
  $('#feed').setAttribute('aria-busy', 'true'); $('#load-more').disabled = true;
  try {
    const query = new URLSearchParams(); if (profileUser) query.set('user', profileUser); if (append && next) query.set('before', next);
    const result = await api(`/api/feed?${query}`); if (version !== routeVersion || !me) return;
    if (!append) $('#feed').replaceChildren(); result.posts.forEach(post => $('#feed').append(renderPost(post))); next = result.next; $('#load-more').hidden = !next;
    if (!append && !result.posts.length) showEmpty(profileUser ? 'Noch ein unbeschriebenes Album.' : 'Hier beginnt euer Fotoalbum.', profileUser ? 'Wenn hier ein Foto geteilt wird, findest du es genau an dieser Stelle.' : 'Noch keine Bilder. Mach den Anfang und teile einen kleinen Moment.', !profileUser || profileUser === me.username);
  } finally { if (version === routeVersion) { $('#feed').setAttribute('aria-busy', 'false'); $('#load-more').disabled = false; } }
}
function renderPost(post) {
  const article = $('#post-template').content.firstElementChild.cloneNode(true); article.dataset.postId = post.id;
  const author = article.querySelector('.post-author'); author.href = `#user/${post.user.username}`; author.querySelector('.avatar').textContent = initials(post.user.displayName); author.querySelector('.display-name').textContent = post.user.displayName; author.querySelector('.handle').textContent = `@${post.user.username}`;
  const time = article.querySelector('time'); time.dateTime = new Date(post.createdAt).toISOString(); time.textContent = new Intl.DateTimeFormat('de', { day: 'numeric', month: 'short' }).format(post.createdAt); time.title = new Date(post.createdAt).toLocaleString('de');
  const image = article.querySelector('.post-image'); image.src = post.image; image.alt = post.caption || `Foto von ${post.user.displayName}`; image.width = post.width; image.height = post.height;
  const like = article.querySelector('.like-button'); like.setAttribute('aria-pressed', String(post.liked)); like.setAttribute('aria-label', post.liked ? 'Gefällt mir zurücknehmen' : 'Gefällt mir'); like.querySelector('.heart').textContent = post.liked ? '♥' : '♡'; like.querySelector('.like-count').textContent = `${post.likes} ${post.likes === 1 ? 'Gefällt mir' : 'Gefällt mir'}`;
  article.querySelector('.comment-count').textContent = `${post.commentCount} ${post.commentCount === 1 ? 'Gedanke' : 'Gedanken'}`;
  const caption = article.querySelector('.post-caption'); caption.textContent = post.caption; caption.hidden = !post.caption;
  const comments = article.querySelector('.comments'); if (post.commentCount > post.comments.length) { const summary = document.createElement('span'); summary.className = 'comments-summary'; summary.textContent = `Die neuesten ${post.comments.length} von ${post.commentCount} Kommentaren`; comments.append(summary); }
  for (const comment of post.comments) { const row = document.createElement('p'); row.className = 'comment'; const who = document.createElement('a'); who.href = `#user/${comment.user.username}`; who.textContent = comment.user.username; row.append(who, document.createTextNode(comment.body)); comments.append(row); }
  like.addEventListener('click', async () => { like.disabled = true; try { const result = await api(`/api/posts/${post.id}/like`, { method: post.liked ? 'DELETE' : 'PUT', body: {} }); if (article.isConnected) article.replaceWith(renderPost(result.post)); } catch (error) { notice(error.message); like.disabled = false; } });
  const form = article.querySelector('.comment-form'); form.addEventListener('submit', async event => { event.preventDefault(); const button = form.querySelector('button'); button.disabled = true; try { const result = await api(`/api/posts/${post.id}/comments`, { method: 'POST', body: { body: form.elements.comment.value } }); if (article.isConnected) article.replaceWith(renderPost(result.post)); } catch (error) { notice(error.message); button.disabled = false; } });
  const remove = article.querySelector('.delete-post'); remove.hidden = !post.mine; remove.addEventListener('click', async () => { if (!await askConfirm('Diesen Moment und seine Kommentare endgültig löschen?')) return; remove.disabled = true; try { await api(`/api/posts/${post.id}`, { method: 'DELETE', body: {} }); await route(); notice('Der Moment wurde gelöscht.'); } catch (error) { notice(error.message); remove.disabled = false; } });
  if (!post.mine) {
    const actions = document.createElement('div'); actions.className = 'safety-actions';
    actions.append(actionButton('Beitrag melden', async () => {
      const reason = await askText('Warum möchtest du diesen Beitrag melden?', 'Meldegrund'); if (!reason) return;
      await api(`/api/posts/${post.id}/report`, { method: 'POST', body: { reason: reason.trim() } }); notice('Deine Meldung wurde beim Server gespeichert.');
    }), actionButton('Konto blockieren', async () => {
      if (!await askConfirm(`@${post.user.username} blockieren? Eure Beiträge werden gegenseitig ausgeblendet.`)) return;
      await api(`/api/blocks/${post.user.username}`, { method: 'PUT', body: {} }); await route(); notice('Konto blockiert.');
    })); article.querySelector('.post-body').append(actions);
  }
  return article;
}
function actionButton(label, action) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'subtle'; button.textContent = label;
  button.addEventListener('click', async () => { button.disabled = true; try { await action(); } catch (error) { notice(error.message, true); } finally { button.disabled = false; } }); return button;
}
async function showBlocks() {
  const { users } = await api('/api/blocks'); document.querySelector('.blocked-accounts')?.remove();
  const list = document.createElement('section'); list.className = 'blocked-accounts';
  const heading = document.createElement('h3'); heading.textContent = 'Blockierte Konten'; list.append(heading);
  if (!users.length) { const text = document.createElement('p'); text.textContent = 'Du hast niemanden blockiert.'; list.append(text); }
  for (const user of users) list.append(actionButton(`@${user.username} freigeben`, async () => {
    await api(`/api/blocks/${user.username}`, { method: 'DELETE', body: {} }); await showBlocks();
  })); $('#profile').append(list);
}
async function showModeration() {
  const version = routeVersion;
  const { reports } = await api('/api/moderation/reports');
  if (version !== routeVersion || !me?.moderator) return;
  document.querySelector('.moderation')?.remove();
  const section = document.createElement('section'); section.className = 'moderation';
  const title = document.createElement('h3'); title.textContent = 'Offene Meldungen'; section.append(title);
  const help = document.createElement('p'); help.textContent = reports.length ? 'Bis zu 50 Meldungen, älteste zuerst. Nach Bearbeitung werden weitere geladen.' : 'Keine offenen Meldungen.'; section.append(help);
  for (const report of reports) {
    const card = document.createElement('article'); card.className = 'moderation-report';
    const author = document.createElement('strong'); author.textContent = `Beitrag von @${report.author}`;
    const caption = document.createElement('p'); caption.textContent = report.caption || '(Ohne Bildtext)';
    const reason = document.createElement('p'); reason.textContent = `Meldung von @${report.reporter}: ${report.reason}`;
    const image = document.createElement('img'); image.src = report.image; image.alt = 'Gemeldetes Foto zur Prüfung'; image.loading = 'lazy'; image.className = 'moderation-image';
    card.append(author, image, caption, reason);
    for (const [label, action] of [['Meldung schließen', 'dismiss'], ['Beitrag endgültig entfernen', 'remove-post']]) {
      card.append(actionButton(label, async () => {
        if (action === 'remove-post' && !await askConfirm('Diesen Beitrag samt Foto, Likes und Kommentaren endgültig entfernen?')) return;
        await api(`/api/moderation/reports/${report.id}`, { method: 'POST', body: { action } });
        await showModeration(); notice('Meldung bearbeitet.');
      }));
    }
    section.append(card);
  }
  $('#profile').append(section);
}
async function deleteAccount() {
  if (!await askConfirm('Dein Konto und alle deine Fotos, Kommentare und Likes endgültig löschen? Das lässt sich nicht rückgängig machen.')) return;
  const password = await askPassword(); if (!password) return;
  await api('/api/account', { method: 'DELETE', body: { password } });
  me = null; showSession(); location.hash = 'feed'; notice('Dein Konto und deine Inhalte wurden gelöscht.');
}
function askConfirm(message) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog'), form = document.createElement('form');
    const text = document.createElement('p'); text.textContent = message; form.append(text);
    const accept = document.createElement('button'); accept.type = 'submit'; accept.className = 'primary'; accept.textContent = 'Bestätigen';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'subtle'; cancel.textContent = 'Abbrechen';
    let answer = false; cancel.onclick = () => dialog.close(); form.append(accept, cancel);
    form.onsubmit = event => { event.preventDefault(); answer = true; dialog.close(); };
    dialog.append(form); document.body.append(dialog); dialog.addEventListener('close', () => { dialog.remove(); resolve(answer); }, { once: true }); dialog.showModal(); accept.focus();
  });
}
function askText(title, placeholder) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog'), form = document.createElement('form'), label = document.createElement('label'), input = document.createElement('textarea');
    label.textContent = title; input.placeholder = placeholder; input.maxLength = 1000; input.required = true; input.rows = 4; label.append(input); form.append(label);
    const submit = document.createElement('button'); submit.type = 'submit'; submit.className = 'primary'; submit.textContent = 'Senden';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'subtle'; cancel.textContent = 'Abbrechen'; cancel.onclick = () => dialog.close(); form.append(submit, cancel);
    let value = null; form.onsubmit = event => { event.preventDefault(); value = input.value.trim(); if (value) dialog.close(); };
    dialog.append(form); document.body.append(dialog); dialog.addEventListener('close', () => { dialog.remove(); resolve(value); }, { once: true }); dialog.showModal(); input.focus();
  });
}
function askPassword() {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog'), form = document.createElement('form'), label = document.createElement('label'), input = document.createElement('input');
    label.textContent = 'Mit deinem Passwort endgültig löschen'; input.type = 'password'; input.autocomplete = 'current-password'; input.required = true; label.append(input); form.append(label);
    const submit = document.createElement('button'); submit.textContent = 'Endgültig löschen'; submit.className = 'primary'; form.append(submit);
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Abbrechen'; cancel.className = 'subtle'; cancel.onclick = () => dialog.close(); form.append(cancel);
    let password = null; form.onsubmit = event => { event.preventDefault(); password = input.value; dialog.close(); };
    dialog.append(form); document.body.append(dialog); dialog.addEventListener('close', () => { dialog.remove(); resolve(password); }, { once: true }); dialog.showModal(); input.focus();
  });
}
$('#refresh').addEventListener('click', route); $('#load-more').addEventListener('click', () => loadFeed(true).catch(error => notice(error.message))); window.addEventListener('hashchange', route);
$('#change-photo').addEventListener('click', () => { clearPhoto(); $('#photo').click(); });
$('#photo').addEventListener('change', () => { const file = $('#photo').files[0]; if (!file) return; clearPhoto(); if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return notice('Bitte ein JPEG-, PNG- oder WebP-Foto auswählen.'); if (file.size > 6 * 1024 * 1024) return notice('Das Foto darf höchstens 6 MB groß sein.'); selectedPhoto = file; previewUrl = URL.createObjectURL(file); $('#preview').src = previewUrl; $('#preview-wrap').hidden = false; $('#file-label').hidden = true; $('#photo').required = false; });
async function preparePhoto(file) {
  // Re-encoding strips EXIF/location metadata and bounds the upload dimensions.
  const bitmap = await createImageBitmap(file); try { if (bitmap.width * bitmap.height > 40_000_000 || bitmap.width > 8192 || bitmap.height > 8192) throw Error('Das Foto ist zu groß. Bitte verkleinere es auf höchstens 40 Megapixel und 8192 Pixel pro Seite.'); const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height)); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); return canvas.toDataURL('image/jpeg', .9).split(',')[1]; } finally { bitmap.close(); }
}
$('#post-form').addEventListener('submit', async event => { event.preventDefault(); if (!selectedPhoto) return notice('Bitte zuerst ein Foto auswählen.'); const button = $('#post-submit'); button.disabled = true; button.textContent = 'Wird geteilt …'; try { const image = await preparePhoto(selectedPhoto); await api('/api/posts', { method: 'POST', body: { image, caption: $('#caption').value } }); $('#post-form').reset(); clearPhoto(); location.hash = 'feed'; notice('Dein Moment ist jetzt im Feed.'); } catch (error) { notice(error.message || 'Dieses Foto konnte nicht gelesen werden.'); } finally { button.disabled = false; button.textContent = 'Moment teilen ↗'; } });
try { me = (await api('/api/me')).user; showSession(); } catch { showSession(); notice('Keine Verbindung zu Knips. Läuft der Server?', true); }
