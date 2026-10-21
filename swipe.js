// 宵宿：スマホの横フリックでタブ（料金比較・予約・会員ステータス・キャンペーン）を切り替える。4ページ共通。
// ・判定：touchstart〜touchend の横移動が70px以上、かつ縦移動の1.5倍以上のときだけ
// ・画面の左右端20px以内で始まった操作（ブラウザの戻る・進むの操作）は無視
// ・横スクロールできる表・入力欄・選択・スイッチ・年切替（2026/2027）の上で始まった操作は無視
// ・端のタブでは止める（ループしない）。タップでの切り替えはこれまでどおり
// ・切り替え時：タブ表示をすぐ移し、内容を150msで横にスライド。各タブの縦スクロール位置は覚えて戻す
// ・タッチ操作だけで動く（PCのマウス操作では反応しない）
(function () {
  const PAGES = [{ key: 'cmp', href: './' }, { key: 'bookings', href: 'bookings.html' }, { key: 'status', href: 'status.html' }, { key: 'campaigns', href: 'campaigns.html' }];
  const file = location.pathname.split('/').pop();
  const idx = file === 'bookings.html' ? 1 : file === 'status.html' ? 2 : file === 'campaigns.html' ? 3 : 0;
  const SCROLL_KEY = 'yoiyado_scroll_' + PAGES[idx].key, IN_KEY = 'yoiyado_swipe_in';
  const ss = {
    get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} },
    del: k => { try { sessionStorage.removeItem(k); } catch (e) {} },
  };
  const content = () => [document.querySelector('main'), document.querySelector('footer')].filter(Boolean);

  // ---- 縦スクロール位置：離れるときに覚え、戻ったら復元（内容は控え→最新の順に描かれ高さが伸びるので、少し待ちながら合わせる）
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const save = () => ss.set(SCROLL_KEY, String(Math.round(window.scrollY)));
  addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.tabs a')) save(); }, true);
  const want = Number(ss.get(SCROLL_KEY) || 0);
  let restoring = want > 0, tries = 0;
  const stopRestore = () => { restoring = false; };
  addEventListener('touchstart', stopRestore, { passive: true, once: true });
  addEventListener('wheel', stopRestore, { passive: true, once: true });
  const restore = () => {
    if (!restoring) return;
    const max = document.documentElement.scrollHeight - innerHeight;
    window.scrollTo(0, Math.min(want, Math.max(0, max)));
    if (max < want && ++tries < 30) setTimeout(restore, 100); else restoring = false;
  };
  if (restoring) { restore(); addEventListener('load', restore); }

  // ---- 入ってくるときのスライド（フリックで来たときだけ）
  const slide = (frames) => {
    document.documentElement.style.overflowX = 'hidden';
    content().forEach(el => el.animate(frames, { duration: 150, easing: 'ease-out' }));
    setTimeout(() => { document.documentElement.style.overflowX = ''; }, 170);
  };
  const dirIn = ss.get(IN_KEY);
  if (dirIn) {
    ss.del(IN_KEY);
    const from = dirIn === 'next' ? '30%' : '-30%';
    slide([{ transform: `translateX(${from})`, opacity: 0.3 }, { transform: 'none', opacity: 1 }]);
  }
  // 「戻る」で前のページが保存状態のまま表示されたときは、出ていくスライドの名残とタブ表示を元に戻す
  addEventListener('pageshow', e => {
    if (!e.persisted) return;
    content().forEach(el => el.getAnimations().forEach(a => a.cancel()));
    document.querySelectorAll('.tabs a').forEach((a, i) => {
      if (i === idx) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  });

  // ---- フリックの判定
  const EDGE = 20, MIN_X = 70, RATIO = 1.5;
  const ignoreTarget = el => {
    if (!el || !el.closest) return false;
    if (el.closest('input, select, textarea, label.switch, .switch, .yrs, #yrs, [data-noswipe]')) return true;
    for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if ((ox === 'auto' || ox === 'scroll') && n.scrollWidth > n.clientWidth + 1) return true;  // 横スクロールできる要素
    }
    return false;
  };
  let sx = 0, sy = 0, armed = false;
  addEventListener('touchstart', e => {
    armed = false;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (t.clientX <= EDGE || t.clientX >= window.innerWidth - EDGE) return;
    if (ignoreTarget(e.target)) return;
    sx = t.clientX; sy = t.clientY; armed = true;
  }, { passive: true });
  addEventListener('touchcancel', () => { armed = false; }, { passive: true });
  addEventListener('touchend', e => {
    if (!armed) return;
    armed = false;
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < MIN_X || Math.abs(dx) < Math.abs(dy) * RATIO) return;
    const to = idx + (dx < 0 ? 1 : -1);  // 左へフリック＝右隣のタブ
    if (to < 0 || to >= PAGES.length) return;  // 端のタブでは止める
    go(to, dx < 0 ? 'next' : 'prev');
  }, { passive: true });

  function go(to, dir) {
    save();
    document.querySelectorAll('.tabs a').forEach((a, i) => {
      if (i === to) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    ss.set(IN_KEY, dir);
    const off = dir === 'next' ? '-30%' : '30%';
    document.documentElement.style.overflowX = 'hidden';
    content().forEach(el => el.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${off})`, opacity: 0.3 }],
      { duration: 150, easing: 'ease-in', fill: 'forwards' }));
    setTimeout(() => { location.href = PAGES[to].href; }, 150);
  }
})();
