/* Nongshim Sverige: scenen, navigationen, filter och flikar. Inga beroenden. */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const nav = $('[data-nav]');
  const wrap = $('.stage-wrap');
  const stage = $('.stage');
  const chapters = $$('.chapter', stage);
  const pills = $$('.switch [data-goto]', stage);
  const browseButtons = $$('.browse__btn', stage);
  const nowEl = $('.stage__now', stage);
  const nameEl = $('.browse__name', stage);
  const barEl = $('.stage__bar i', stage);
  const themeMeta = $('meta[name="theme-color"]');
  const sections = $$('[data-bg]');
  const last = chapters.length - 1;

  let active = -1;
  let lockUntil = 0; // medan en programmatisk scrollning pågår styr inte scrollen kapitlet

  /* ── Scenen ── */
  function setActive(i) {
    i = clamp(i, 0, last);
    if (i === active) return;
    active = i;
    chapters.forEach((chapter, k) => {
      chapter.classList.toggle('is-active', k === i);
      chapter.classList.toggle('is-before', k < i);
      chapter.toggleAttribute('inert', k !== i);
    });
    const style = chapters[i].style;
    for (const prop of ['--field', '--ink', '--accent']) {
      stage.style.setProperty(prop, style.getPropertyValue(prop));
    }
    pills.forEach((pill) => pill.setAttribute('aria-current', String(Number(pill.dataset.goto) === i)));
    browseButtons.forEach((btn) => { btn.disabled = i + Number(btn.dataset.dir) < 0 || i + Number(btn.dataset.dir) > last; });
    nowEl.textContent = String(i).padStart(2, '0');
    nameEl.textContent = chapters[i].dataset.name;
    updateNav();
  }

  function metrics() {
    const top = wrap.getBoundingClientRect().top + window.scrollY;
    const travel = wrap.offsetHeight - window.innerHeight;
    return { top, travel };
  }

  function onScroll() {
    const { top, travel } = metrics();
    const progress = travel > 0 ? clamp((window.scrollY - top) / travel, 0, 1) : 0;
    barEl.style.setProperty('--p', progress.toFixed(4));
    if (performance.now() > lockUntil) setActive(Math.round(progress * last));
    updateNav();
  }

  function goTo(i) {
    i = clamp(i, 0, last);
    const { top, travel } = metrics();
    const target = top + (travel * i) / last;
    const pinned = window.scrollY >= top - 2 && window.scrollY <= top + travel + 2;
    setActive(i);
    if (pinned || reduceMotion.matches) {
      // scenen står redan still på skärmen: hoppa direkt och låt kapitlet animera bytet
      lockUntil = performance.now() + 120;
      window.scrollTo({ top: target, behavior: 'instant' });
    } else {
      lockUntil = performance.now() + 1400;
      window.scrollTo({ top: target, behavior: 'smooth' });
    }
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-goto], .browse__btn');
    if (!trigger) return;
    event.preventDefault();
    closeMenu();
    if (trigger.matches('.browse__btn')) goTo(active + Number(trigger.dataset.dir));
    else goTo(Number(trigger.dataset.goto));
  });

  window.addEventListener('scrollend', () => { lockUntil = 0; onScroll(); });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    if (event.target.closest('input, textarea, select, [role="tab"]')) return;
    const { top, travel } = metrics();
    if (window.scrollY < top - 2 || window.scrollY > top + travel + 2) return;
    goTo(active + (event.key === 'ArrowRight' ? 1 : -1));
  });

  /* Paketet lutar sig lite efter pekaren (bara mus/styrplatta) */
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    let frame = 0;
    stage.addEventListener('pointermove', (event) => {
      if (reduceMotion.matches || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const rect = stage.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        stage.style.setProperty('--ry', `${(x * 14).toFixed(2)}deg`);
        stage.style.setProperty('--rx', `${(-y * 9).toFixed(2)}deg`);
      });
    });
    stage.addEventListener('pointerleave', () => {
      stage.style.setProperty('--ry', '0deg');
      stage.style.setProperty('--rx', '0deg');
    });
  }

  /* ── Navigationen tar färg efter sektionen den ligger över ── */
  function updateNav() {
    const line = nav.offsetHeight / 2;
    let bg; let ink; let onStage = false;
    if (wrap.getBoundingClientRect().bottom > line) {
      onStage = true;
      bg = stage.style.getPropertyValue('--field');
      ink = stage.style.getPropertyValue('--ink');
    } else {
      const current = sections.find((section) => {
        const rect = section.getBoundingClientRect();
        return rect.top <= line && rect.bottom > line;
      });
      if (current) { bg = current.dataset.bg; ink = current.dataset.ink; }
    }
    if (!bg) return;
    nav.style.setProperty('--nav-bg', bg);
    nav.style.setProperty('--nav-ink', ink);
    nav.classList.toggle('is-solid', !onStage);
    if (themeMeta && themeMeta.content !== bg) themeMeta.content = bg;
  }

  /* ── Mobilmeny ── */
  const toggle = $('.nav__toggle');
  function closeMenu() {
    if (!nav.classList.contains('is-open')) return;
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    document.documentElement.style.overflow = '';
  }
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
    document.documentElement.style.overflow = open ? 'hidden' : '';
  });
  $$('.nav__links a').forEach((link) => link.addEventListener('click', closeMenu));

  /* ── Mjuk entré när innehåll scrollas in ── */
  const revealables = $$('.reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealables.forEach((el) => observer.observe(el));
  } else {
    revealables.forEach((el) => el.classList.add('is-in'));
  }

  /* ── Filter i sortimentet ── */
  const cards = $$('[data-grid] .card');
  const chips = $$('.filters .chip');
  const countEl = $('[data-count]');
  const tests = {
    alla: () => true,
    pase: (card) => card.dataset.format === 'pase',
    kopp: (card) => card.dataset.format === 'kopp',
    stirfry: (card) => card.dataset.type === 'stirfry',
    mild: (card) => card.dataset.heat === '1',
    het: (card) => Number(card.dataset.heat) >= 2,
  };
  chips.forEach((chip) => chip.addEventListener('click', () => {
    const test = tests[chip.dataset.filter] || tests.alla;
    chips.forEach((other) => {
      other.classList.toggle('is-on', other === chip);
      other.setAttribute('aria-pressed', String(other === chip));
    });
    let shown = 0;
    cards.forEach((card) => {
      const show = test(card);
      card.hidden = !show;
      card.classList.remove('is-pop');
      if (show) {
        card.style.animationDelay = `${Math.min(shown, 12) * 25}ms`;
        void card.offsetWidth; // startar om animationen
        card.classList.add('is-pop');
        shown += 1;
      }
    });
    countEl.textContent = String(shown);
  }));

  /* ── Flikar i tillagningen ── */
  const tabs = $$('[role="tab"]');
  function selectTab(tab, focus) {
    tabs.forEach((other) => {
      const on = other === tab;
      other.classList.toggle('is-on', on);
      other.setAttribute('aria-selected', String(on));
      other.tabIndex = on ? 0 : -1;
      document.getElementById(other.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab, false));
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const step = event.key === 'ArrowRight' ? 1 : -1;
      selectTab(tabs[(index + step + tabs.length) % tabs.length], true);
    });
  });

  /* ── Start ── */
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
  if (window.location.hash === '#smaker') goTo(1);
})();
