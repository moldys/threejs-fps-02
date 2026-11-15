// The HUD. One module owns every piece of on-screen UI: health and armor,
// ammunition, money, the round timer, the score, the crosshair (whose gap
// mirrors bloom), the killfeed, banners and the overlays — start, pause, buy
// and death. It writes the DOM directly and caches text so it only touches
// the document when a value changes.
export function createHud(onAction) {
  const el = (id) => document.getElementById(id);
  const cache = {};

  function setText(id, value) {
    if (cache[id] === value) return;
    cache[id] = value;
    const node = el(id);
    if (node) node.textContent = value;
  }

  function setDisplay(id, show) {
    const flag = 'disp_' + id;
    const want = show ? 'block' : 'none';
    if (cache[flag] === want) return;
    cache[flag] = want;
    const node = el(id);
    if (node) node.style.display = want;
  }

  // ---- Core HUD -----------------------------------------------------------
  function render(snapshot) {
    const hp = Math.max(0, Math.round(snapshot.health));
    setText('hp-text', String(hp));
    const hpFill = el('hp-fill');
    if (hpFill) hpFill.style.width = `${hp}%`;
    setText('armor-text', String(Math.round(snapshot.armor)));
    const armorFill = el('armor-fill');
    if (armorFill) armorFill.style.width = `${snapshot.armor}%`;

    setText('ammo-mag', String(snapshot.mag));
    setText('ammo-reserve', '/ ' + String(snapshot.reserve));
    setText('weapon-name', snapshot.weaponName);
    setText('money', '$' + String(snapshot.money));
    setText('score-ct', String(snapshot.wins));
    setText('score-t', String(snapshot.losses));
    setText('round-number', 'ROUND ' + String(snapshot.round));
    setText('round-timer', snapshot.roundTime);

    if (snapshot.bombPlanted) {
      setText('bomb-status', `CORE @ ${snapshot.bombSite} · ${snapshot.bombTime}${snapshot.defusing ? ' · DEFUSING' : ''}`);
      setDisplay('bomb-status', true);
    } else {
      setDisplay('bomb-status', false);
    }

    if (snapshot.interactHint) {
      setText('interact-hint', snapshot.interactHint);
      setDisplay('interact-hint', true);
    } else {
      setDisplay('interact-hint', false);
    }

    // Crosshair gap from bloom (0..1 -> 4..22px).
    const gap = 4 + snapshot.bloom01 * 18;
    const ch = el('crosshair-gap');
    if (ch) ch.style.width = `${gap}px`;
    const ch2 = el('crosshair-gap-v');
    if (ch2) ch2.style.height = `${gap}px`;

    // Buy menu visibility.
    setDisplay('menu-buy', snapshot.buyOpen && snapshot.phase === 'buy');
  }

  function hitMarker(headshot, holdMs) {
    const marker = el('hitmarker');
    if (!marker) return;
    marker.classList.add('on');
    if (headshot) marker.classList.add('head');
    clearTimeout(marker._t);
    marker._t = setTimeout(() => {
      marker.classList.remove('on', 'head');
    }, holdMs);
  }

  function killfeed(list) {
    const feed = el('killfeed');
    if (!feed) return;
    feed.innerHTML = '';
    for (let i = 0; i < list.length; i += 1) {
      const line = document.createElement('div');
      line.className = 'kf-line';
      line.textContent = list[i];
      feed.appendChild(line);
    }
  }

  function banner(title, sub) {
    setText('banner-title', title);
    setText('banner-sub', sub || '');
    setDisplay('banner', true);
    clearTimeout(banner._t);
    banner._t = setTimeout(() => setDisplay('banner', false), 3200);
  }

  // ---- Overlays -----------------------------------------------------------
  function showOverlay(kind) {
    setDisplay('menu-start', kind === 'start');
    setDisplay('menu-pause', kind === 'paused');
    setDisplay('menu-dead', kind === 'dead');
    setDisplay('menu-end', kind === 'end');
    setDisplay('menu-buy', kind === 'buy');
    if (kind) el('overlay').style.display = 'grid';
    else el('overlay').style.display = 'none';
  }

  function showBuy(open) {
    const menu = el('menu-buy');
    if (!menu) return;
    setDisplay('menu-buy', open);
    if (open && onAction.onBuyList) {
      const rows = onAction.onBuyList();
      const tbody = el('buy-list');
      if (tbody) {
        tbody.innerHTML = '';
        for (let i = 0; i < rows.length; i += 1) {
          const r = rows[i];
          const tr = document.createElement('tr');
          const nameTd = document.createElement('td');
          nameTd.textContent = r.label;
          const costTd = document.createElement('td');
          costTd.textContent = r.owned ? 'OWNED' : '$' + r.cost;
          costTd.className = r.owned ? 'owned' : 'cost';
          const actTd = document.createElement('td');
          const btn = document.createElement('button');
          btn.textContent = r.owned ? '—' : 'BUY';
          btn.disabled = r.owned;
          btn.addEventListener('click', () => onAction.onBuy && onAction.onBuy(r.key));
          actTd.appendChild(btn);
          tr.appendChild(nameTd);
          tr.appendChild(costTd);
          tr.appendChild(actTd);
          tbody.appendChild(tr);
        }
      }
      if (onAction.onBuyMoney) {
        setText('buy-money', '$' + onAction.onBuyMoney());
      }
    }
  }

  function bindStart() {
    const play = el('start-play');
    if (play) play.addEventListener('click', () => onAction.onStart && onAction.onStart());
    const resume = el('pause-resume');
    if (resume) resume.addEventListener('click', () => onAction.onResume && onAction.onResume());
    const buyClose = el('buy-close');
    if (buyClose) buyClose.addEventListener('click', () => onAction.onBuyClose && onAction.onBuyClose());
    const buyNext = el('buy-next');
    if (buyNext) buyNext.addEventListener('click', () => onAction.onBuyNext && onAction.onBuyNext());
    const endNext = el('end-next');
    if (endNext) endNext.addEventListener('click', () => onAction.onEndNext && onAction.onEndNext());
  }

  return {
    render,
    hitMarker,
    killfeed,
    banner,
    showOverlay,
    showBuy,
    bindStart,
    setDisplay,
    setText,
  };
}
