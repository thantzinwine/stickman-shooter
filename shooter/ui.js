// Auth + shop UI for the login-gated demo game flow.
(function(){
  const authPanel = document.getElementById('auth-panel');
  const shopPanel = document.getElementById('shop-panel');
  const authOverlay = document.getElementById('auth-overlay');
  const authBox = document.getElementById('auth-box');
  const apiBase = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';

  let state = { token: localStorage.getItem('token'), user: null, skins: [], packs: [] };
  let soundState = { muted: false, master: 0.7, music: 0.16, sfx: 0.3, track: 0 };
  try { soundState = { ...soundState, ...(JSON.parse(localStorage.getItem('sound-settings') || '{}')) }; } catch (_) { localStorage.removeItem('sound-settings'); }

  function api(path, opts = {}) {
    opts.headers = opts.headers || {};
    opts.headers['Content-Type'] = 'application/json';
    if (state.token) opts.headers['Authorization'] = 'Bearer ' + state.token;
    return fetch(apiBase + path, opts)
      .then(async r => {
        const text = await r.text();
        let body = {};
        try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { error: text || 'Server returned an invalid response' }; }
        return { ok: r.ok, status: r.status, body };
      })
      .catch(e => ({ ok: false, body: { error: 'Cannot reach the game server. Open http://localhost:3000/ or start npm start.' }, error: e }));
  }

  function setLoginGate(show) {
    if (!authOverlay) return;
    authOverlay.classList.toggle('hidden', !show);
  }

  function renderAuthForm() {
    authBox.innerHTML = `
      <label>
        Username
        <input id="u_user" placeholder="Enter username" value="" autocomplete="off" />
      </label>
      <label>
        Password
        <input id="u_pass" type="password" placeholder="Enter password" value="" autocomplete="off" />
      </label>
      <div class="auth-actions">
        <button id="btn_login" class="primary-btn">Login</button>
        <button id="btn_signup" class="secondary-btn">Sign Up</button>
      </div>
      <div class="auth-status" id="auth-status"></div>
    `;

    const setAuthStatus = message => {
      const status = authBox.querySelector('#auth-status');
      if (status) status.textContent = message || '';
    };
    const setBusy = busy => authBox.querySelectorAll('button').forEach(button => { button.disabled = busy; button.style.opacity = busy ? '0.6' : '1'; });

    authBox.querySelector('#btn_login').onclick = async () => {
      const username = document.getElementById('u_user').value.trim();
      const password = document.getElementById('u_pass').value;
      if (!username || !password) return alert('Username and password are required.');
      setBusy(true); setAuthStatus('Signing in...');

      const res = await api('/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      if (res.ok) {
        state.token = res.body.token;
        localStorage.setItem('token', state.token);
        state.user = res.body.user;
        completeAuth();
        if (window.GameAPI?.goHome) window.GameAPI.goHome();
      } else {
        setAuthStatus(res.body?.error || 'Login failed');
        setBusy(false);
      }
    };

    authBox.querySelector('#btn_signup').onclick = async () => {
      const username = document.getElementById('u_user').value.trim();
      const password = document.getElementById('u_pass').value;
      if (!username || !password) return alert('Username and password are required.');
      setBusy(true); setAuthStatus('Creating account...');

      const res = await api('/signup', { method: 'POST', body: JSON.stringify({ username, password }) });
      if (res.ok) {
        state.token = res.body.token;
        localStorage.setItem('token', state.token);
        state.user = res.body.user;
        completeAuth();
        if (window.GameAPI?.goHome) window.GameAPI.goHome();
      } else {
        setAuthStatus(res.body?.error || 'Signup failed');
        setBusy(false);
      }
    };
  }

  function completeAuth() {
    setLoginGate(false);
    renderAuth();
    renderShop();
    if (window.GameAPI?.setLocalSkin && state.user?.selectedSkin) {
      window.GameAPI.setLocalSkin(state.user.selectedSkin);
    }
    Promise.all([loadSkins(), loadDemoPacks()]).then(renderShop).catch(error => console.error(error));
  }

  function renderAuth() {
    if (!state.user) {
      authPanel.style.display = 'none';
      authPanel.innerHTML = `
        <div class="card">
          <div class="user-bar">
            <span>Guest mode</span>
            <span class="diamond-pill">💎 0</span>
          </div>
        </div>
      `;
      renderAuthForm();
      setLoginGate(true);
      return;
    }

    authPanel.innerHTML = `
      <div class="card">
        <div class="user-bar">
          <span>👋 ${state.user.username}</span>
          <span class="diamond-pill">💎 <span id="diamonds">${state.user.diamonds}</span></span>
        </div>
        <div class="inline-note" style="margin-top:10px;">New player wallet starts at 0 diamonds.</div>
        <div class="auth-actions" style="margin-top:10px;">
          <button id="logout" class="secondary-btn">Logout</button>
        </div>
      </div>
    `;

    authPanel.querySelector('#logout').onclick = () => {
      localStorage.removeItem('token');
      state = { token: null, user: null, skins: state.skins, packs: state.packs };
      renderAll();
    };

    setLoginGate(false);
  }

  function renderShop() {
    if (!state.user) {
      shopPanel.classList.remove('open');
      shopPanel.innerHTML = '';
      return;
    }

    const purchased = (state.user && state.user.purchased) || [];
    const skinMarkup = (state.skins || []).map(s => {
      const owned = state.user && state.user.unlocked && state.user.unlocked.includes(s.id);
      const equippable = owned && (purchased.includes(s.id) || s.id === 'default');
      const equipped = state.user?.selectedSkin === s.id;
      const action = !owned
        ? `<button class="primary-btn" data-buy-skin="${s.id}">Buy ${s.price}💎</button>`
        : equippable
          ? `<button class="${equipped ? 'primary-btn' : 'secondary-btn'}" data-sel="${s.id}">${equipped ? 'Equipped' : 'Equip'}</button>`
          : `<button class="secondary-btn" disabled title="Purchased below list price — not equippable">Not equippable</button>`;
      return `
        <div class="shop-item" style="margin-top:8px;padding:10px;border:1px solid rgba(188,212,255,.2);border-radius:10px;background:rgba(255,255,255,.03);">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
            <strong>${s.name}</strong>
            <span style="color:${equipped ? '#8de8ff' : equippable ? '#8de8ff' : owned ? '#ffb45e' : '#fff'};">${equipped ? 'Equipped' : equippable ? 'Owned' : owned ? '⚠ Not equippable' : s.price + '💎'}</span>
          </div>
          <div style="margin-top:8px;">${action}</div>
        </div>
      `;
    }).join('');

    const packMarkup = (state.packs || []).map(pack => `
      <button class="pack-btn" data-pack="${pack.id}">
        <div class="usd">${pack.label}</div>
        <div class="diam">+${pack.diamonds}💎</div>
      </button>
    `).join('');
    const isAdmin = state.user.username.toLowerCase() === 'thant';

    shopPanel.innerHTML = `
      <div class="card">
        <div class="shop-header">
          <strong>Session Shop</strong>
          <span class="diamond-pill">💎 <span id="shop-diam">${state.user.diamonds}</span></span>
        </div>
        <button class="secondary-btn shop-close" id="shop-close">Close</button>
        <div class="bonus">${isAdmin ? 'Admin diamond purchase packs.' : 'Diamond purchases are available to the admin account only.'}</div>
        <div class="shop-row">${isAdmin ? packMarkup : (state.packs || []).map(pack => `<button class="pack-btn" disabled>${pack.label}<div class="diam">+${pack.diamonds}💎 (Admin only)</div></button>`).join('')}</div>
        <div style="margin-top:14px;">
          <strong style="display:block;margin-bottom:8px;">Skins</strong>
          ${skinMarkup}
        </div>
      </div>
    `;

    shopPanel.querySelector('#shop-close').onclick = () => shopPanel.classList.remove('open');

    shopPanel.querySelectorAll('[data-pack]').forEach(btn => {
      btn.onclick = async () => {
        const packId = btn.getAttribute('data-pack');
        const res = await api('/buy-diamonds', {
          method: 'POST',
          body: JSON.stringify({ packId }),
        });
        if (res.ok) {
          state.user.diamonds = res.body.diamonds;
          renderAll();
        } else {
          alert(res.body?.error || 'Payment demo failed');
        }
      };
    });

    shopPanel.querySelectorAll('[data-buy-skin]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-buy-skin');
        const res = await api('/purchase', { method: 'POST', body: JSON.stringify({ skinId: id }) });
        if (res.ok) {
          state.user.diamonds = res.body.diamonds;
          state.user.unlocked = res.body.unlocked;
          state.user.purchased = res.body.purchased || state.user.purchased || [];
          if (window.GameAPI?.setLocalSkin) window.GameAPI.setLocalSkin(id);
          renderAll();
        } else {
          alert(res.body?.error || 'Purchase failed');
        }
      };
    });

    shopPanel.querySelectorAll('[data-sel]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-sel');
        const res = await api('/select-skin', { method: 'POST', body: JSON.stringify({ skinId: id }) });
        if (!res.ok) return alert(res.body?.error || 'Could not equip skin');
        state.user.selectedSkin = res.body.selectedSkin || id;
        if (window.GameAPI?.setLocalSkin) window.GameAPI.setLocalSkin(id);
        renderShop();
      };
    });
  }

  async function loadSkins() {
    const res = await api('/skins', { method: 'GET' });
    if (res.ok) state.skins = res.body;
    else state.skins = [{ id: 'default', name: 'Default', price: 0 }];
  }

  async function loadDemoPacks() {
    const res = await api('/demo-packs', { method: 'GET' });
    if (res.ok) state.packs = res.body;
    else state.packs = [];
  }

  async function fetchMe() {
    if (!state.token) {
      state.user = null;
      return;
    }

    setLoginGate(false);

    const res = await api('/me', { method: 'GET' });
    if (res.ok) {
      state.user = res.body;
      window.__selectedSkin = state.user.selectedSkin || 'default';
      if (window.GameAPI?.setLocalSkin) window.GameAPI.setLocalSkin(window.__selectedSkin);
    } else {
      state.user = null;
      localStorage.removeItem('token');
      state.token = null;
    }
  }

  async function renderAll() {
    await fetchMe();
    await loadSkins();
    await loadDemoPacks();
    renderAuth();
    renderShop();
  }

  window.addEventListener('load', () => renderAll());
  // Auth helper exposed to the game
  const pendingAuthCallbacks = [];
  function runPendingAuth() { while (pendingAuthCallbacks.length) { const cb = pendingAuthCallbacks.shift(); try { cb(); } catch(e){} } }

  window.GameAuth = {
    isLoggedIn() { return !!state.user; },
    getUser() { return state.user; },
    logout() {
      localStorage.removeItem('token');
      state = { token: null, user: null, skins: state.skins, packs: state.packs };
      renderAll();
    },
    ensureAuth(cb) {
      if (state.user) return cb();
      // show overlay and queue callback for when login completes
      const ov = document.getElementById('auth-overlay'); if (ov) ov.classList.remove('hidden');
      pendingAuthCallbacks.push(cb);
    }
  };

  const modalBackdrop = document.getElementById('modal-backdrop');
  const openModals = [];
  function syncBackdrop() {
    if (!modalBackdrop) return;
    modalBackdrop.classList.toggle('show', openModals.length > 0);
  }
  function pushModal(panel) {
    if (!openModals.includes(panel)) openModals.push(panel);
    panel.classList.add('open');
    syncBackdrop();
  }
  function popModal(panel) {
    const i = openModals.indexOf(panel);
    if (i > -1) openModals.splice(i, 1);
    panel.classList.remove('open');
    syncBackdrop();
  }
  function closeTopModal() {
    if (openModals.length === 0) return;
    popModal(openModals[openModals.length - 1]);
  }
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', closeTopModal);
  }

  window.ShopUI = {
    open() {
      if (!state.user) return;
      pushModal(shopPanel);
    },
    close() { popModal(shopPanel); },
  };

  const soundBtn = document.getElementById('btn-sound');
  function refreshSoundIcon() {
    if (!soundBtn) return;
    soundBtn.textContent = soundState.muted ? '🔇' : '🔊';
  }
  if (soundBtn) soundBtn.onclick = () => { window.location.href = 'settings.html'; };

  const friendsBtn = document.getElementById('btn-friends');
  if (friendsBtn) friendsBtn.onclick = () => { window.location.href = 'friends.html'; };
  refreshSoundIcon();

  function saveSoundSettings() {
    localStorage.setItem('sound-settings', JSON.stringify(soundState));
    window.GameAPI?.setSoundSettings(soundState);
    refreshSoundIcon();
  }

  // When a login/signup completes, run pending callbacks
  const originalRenderAll = renderAll;
  renderAll = async function() {
    await fetchMe();
    await loadSkins();
    await loadDemoPacks();
    renderAuth();
    renderShop();
    runPendingAuth();
  };

  window._shopState = () => state;
})();
