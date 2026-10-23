// fordi viewer: screen/state navigation, width toggle, and the 375px rule check (window.fordiCheck).
// Works on any page with main.wf-frame > section.screen[data-screen] > .state[data-state].
// Copied into ux/prototype/ by "fordi.mjs scaffold prototype"; never edit the copy by hand.
(() => {
  const frame = document.querySelector('.wf-frame');
  const screens = [...frame.querySelectorAll('section.screen[data-screen]')];
  const statesOf = (screen) => [...screen.querySelectorAll(':scope > .state[data-state]')];
  const WIDTHS = [375, 1024];
  const STATE_LABELS = {
    default: 'پیش‌فرض', empty: 'خالی', loading: 'بارگذاری', error: 'خطا', success: 'موفق',
    offline: 'آفلاین', 'pending-sync': 'در صف همگام‌سازی', conflict: 'تداخل', 'slot-taken': 'زمان پر شد',
    'permission-denied': 'بدون دسترسی', 'message-failed': 'پیام ارسال نشد',
  };
  const label = (state) => STATE_LABELS[state] ?? state;
  const fa = (n) => n.toLocaleString('fa-IR', { useGrouping: false });

  // ---------- chrome ----------
  const stage = document.createElement('div');
  stage.className = 'wf-stage';
  frame.replaceWith(stage);
  stage.append(frame);

  const controls = document.createElement('header');
  controls.className = 'wf-controls';
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'صفحه');
  for (const s of screens) select.add(new Option(`${s.dataset.screen} · ${s.dataset.title ?? ''}`, s.dataset.screen));
  const stateGroup = document.createElement('div');
  stateGroup.className = 'wf-group wf-states';
  stateGroup.setAttribute('role', 'group');
  stateGroup.setAttribute('aria-label', 'حالت');
  const widthGroup = document.createElement('div');
  widthGroup.className = 'wf-group';
  const checkBtn = document.createElement('button');
  checkBtn.textContent = 'بررسی ۳۷۵';
  const trace = document.createElement('span');
  trace.className = 'wf-trace';
  controls.append(select, stateGroup, widthGroup, checkBtn, trace);
  document.body.prepend(controls);

  const report = document.createElement('div');
  report.className = 'wf-report';
  report.hidden = true;
  controls.after(report);

  let width = 375;
  const setWidth = (w) => {
    width = w;
    document.documentElement.style.setProperty('--wf-width', `${w}px`);
    for (const b of widthGroup.children) b.setAttribute('aria-pressed', String(Number(b.dataset.w) === w));
  };
  for (const w of WIDTHS) {
    const b = document.createElement('button');
    b.dataset.w = w;
    b.textContent = `${fa(w)}px`;
    b.addEventListener('click', () => setWidth(w));
    widthGroup.append(b);
  }

  // ---------- navigation ----------
  function show(screenId, stateId) {
    const screen = screens.find((s) => s.dataset.screen === screenId) ?? screens[0];
    if (!screen) return;
    const states = statesOf(screen);
    const state = states.find((s) => s.dataset.state === stateId)
      ?? states.find((s) => s.dataset.state === 'default') ?? states[0];
    for (const s of screens) s.hidden = s !== screen;
    for (const s of states) s.hidden = s !== state;
    select.value = screen.dataset.screen;

    stateGroup.replaceChildren(...states.map((s) => {
      const b = document.createElement('button');
      b.textContent = label(s.dataset.state);
      b.setAttribute('aria-pressed', String(s === state));
      b.addEventListener('click', () => go(`${screen.dataset.screen}/${s.dataset.state}`));
      return b;
    }));
    stateGroup.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    trace.textContent = state ? `${screen.dataset.screen}.${state.dataset.state}` : screen.dataset.screen;
    frame.scrollTo({ top: 0 });
  }

  const go = (target) => { location.hash = target; };
  const fromHash = () => {
    const [screen, state] = decodeURIComponent(location.hash.slice(1)).split('/');
    show(screen, state);
  };

  select.addEventListener('change', () => go(select.value));
  frame.addEventListener('click', (e) => {
    const link = e.target.closest('[data-goto]');
    if (link) { e.preventDefault(); go(link.dataset.goto); }
  });
  window.addEventListener('hashchange', fromHash);

  // ---------- 375 check: the Persian/RTL hard rules, measured ----------
  // Works on the wireframe kit classes and on any prototype markup: native controls, role=button,
  // navigation links, and rows marked data-row.
  const CONTROLS = 'button, input, select, textarea, [role="button"], a[data-goto], .btn, .field > .input';
  const ROWS = '[data-row], .row, .dock, .banner';
  const isButton = (el) => el.matches('button, [role="button"], a[data-goto], .btn');
  // Counts the label's real text lines: its text boxes sit at more than one vertical position.
  const wrapsLabel = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0).map((r) => r.top);
    return tops.length > 1 && Math.max(...tops) - Math.min(...tops) > parseFloat(getComputedStyle(el).fontSize) * 0.8;
  };

  function check() {
    const before = { hash: location.hash, width };
    setWidth(375);
    const problems = [];
    let checked = 0;
    const visible = (el) => el.getClientRects().length > 0;

    for (const screen of screens) {
      for (const state of statesOf(screen)) {
        show(screen.dataset.screen, state.dataset.state);
        checked++;
        const where = `${screen.dataset.screen}.${state.dataset.state}`;
        const add = (kind, detail) => problems.push({ where, kind, detail });

        if (frame.scrollWidth > frame.clientWidth + 1) {
          add('overflow', `محتوا ${fa(frame.scrollWidth - frame.clientWidth)}px از عرض ۳۷۵ بیرون می‌زند`);
        }
        for (const el of state.querySelectorAll(CONTROLS)) {
          if (!visible(el) || getComputedStyle(el).display === 'inline') continue; // inline text links are prose
          const text = el.textContent.trim().slice(0, 30);
          if (isButton(el)) {
            if (el.scrollWidth > el.clientWidth + 1) add('button-clipped', `متن دکمه جا نمی‌شود: «${text}»`);
            else if (text && wrapsLabel(el)) add('button-wraps', `متن دکمه دو خطی شده: «${text}»`);
          }
          if (el.getBoundingClientRect().height < 43.5) add('small-target', `کمتر از ۴۴px: «${text}»`);
        }
        for (const row of state.querySelectorAll(ROWS)) {
          const controls = [...row.children].filter((c) => visible(c) && (c.matches(CONTROLS) || c.querySelector(CONTROLS)));
          const heights = controls.map((c) => Math.round(c.getBoundingClientRect().height));
          if (new Set(heights).size > 1) add('row-uneven', `ارتفاع کنترل‌های یک ردیف برابر نیست: ${heights.map(fa).join('، ')}`);
        }
      }
    }
    setWidth(before.width);
    if (before.hash) location.hash = before.hash; else fromHash();
    fromHash();
    return { checked, problems };
  }
  window.fordiCheck = check;

  checkBtn.addEventListener('click', () => {
    const { checked, problems } = check();
    report.hidden = false;
    report.replaceChildren();
    const head = document.createElement('strong');
    head.textContent = problems.length
      ? `${problems.length.toLocaleString('fa-IR')} مشکل در ${checked.toLocaleString('fa-IR')} حالت`
      : `همه‌ی ${checked.toLocaleString('fa-IR')} حالت در ۳۷۵ سالم است`;
    report.append(head);
    if (problems.length) {
      const ul = document.createElement('ul');
      for (const p of problems) {
        const li = document.createElement('li');
        li.textContent = `${p.where}: ${p.detail}`;
        ul.append(li);
      }
      report.append(ul);
    }
  });

  setWidth(375);
  fromHash();
})();
