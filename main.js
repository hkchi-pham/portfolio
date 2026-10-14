(() => {
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Theme toggle: remembers the visitor's choice, defaults to OS preference.
  document.querySelector('.theme-toggle').addEventListener('click', () => {
    const isDark = root.dataset.theme
      ? root.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = isDark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch (e) {}
  });

  // Name intro: wrap each letter so it can rise in one after another.
  const title = document.querySelector('[data-split]');
  if (title) {
    title.setAttribute('aria-label', title.textContent.replace(/\s+/g, ' ').trim());
    let i = 0;
    const frag = document.createDocumentFragment();
    title.childNodes.forEach((node) => {
      if (node.nodeType !== Node.TEXT_NODE) { frag.appendChild(node.cloneNode()); return; }
      node.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
        const word = document.createElement('span');
        word.className = 'word';
        word.setAttribute('aria-hidden', 'true');
        [...part].forEach((c) => {
          const ch = document.createElement('span');
          ch.className = 'ch';
          ch.style.setProperty('--i', i++);
          ch.textContent = c;
          word.appendChild(ch);
        });
        frag.appendChild(word);
      });
    });
    title.replaceChildren(frag);
  }

  const nav = document.querySelector('.nav');
  const links = [...nav.querySelectorAll('a')];
  const contact = document.getElementById('contact');
  const toTop = document.querySelector('.to-top');

  // Folders: one open at a time, linkable by #about, #academics, ...
  const folders = document.querySelector('.folders');
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const panelIds = tabs.map((t) => t.getAttribute('aria-controls'));

  const openFolder = (id, { focus = false } = {}) => {
    tabs.forEach((tab) => {
      const on = tab.getAttribute('aria-controls') === id;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !on;
      if (on && focus) tab.focus();
      if (on) {
        // keep the active tab visible in the (mobile) sideways-scrolling strip
        const strip = tab.parentElement;
        const dx = tab.getBoundingClientRect().left - strip.getBoundingClientRect().left;
        if (dx < 0 || dx + tab.offsetWidth > strip.clientWidth) strip.scrollLeft += dx - 16;
      }
    });
    updateNav();
  };

  const showFolder = (id) => {
    openFolder(id);
    folders.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => {
      const id = tab.getAttribute('aria-controls');
      openFolder(id);
      history.replaceState(null, '', '#' + id);
    });
    tab.addEventListener('keydown', (e) => {
      const keys = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      const next = tabs[(keys[e.key] + tabs.length) % tabs.length];
      openFolder(next.getAttribute('aria-controls'), { focus: true });
      history.replaceState(null, '', '#' + next.getAttribute('aria-controls'));
    });
  });

  // Any link to a folder (nav, hero button, project page "back") opens it.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    if (!panelIds.includes(id)) return;
    e.preventDefault();
    history.pushState(null, '', '#' + id);
    showFolder(id);
  });

  const fromHash = () => {
    const id = location.hash.slice(1);
    if (panelIds.includes(id)) { showFolder(id); return true; }
    return false;
  };
  window.addEventListener('hashchange', fromHash);
  if (!fromHash()) openFolder('about');

  // Mobile menu
  const menuBtn = document.querySelector('.menu-toggle');
  const setMenu = (open) => {
    nav.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  };
  menuBtn.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  nav.addEventListener('click', (e) => { if (e.target.tagName === 'A') setMenu(false); });

  // Reveal on scroll
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('in'));
  }

  // Active nav link: the open folder while it's on screen, Contact at the end.
  function updateNav() {
    const y = window.scrollY + window.innerHeight * 0.4;
    let current = '';
    if (contact.offsetTop <= y) current = 'contact';
    else if (folders.offsetTop <= y) current = tabs.find((t) => t.getAttribute('aria-selected') === 'true').getAttribute('aria-controls');
    links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + current));
    toTop.classList.toggle('show', window.scrollY > window.innerHeight * 0.8);
  }
  window.addEventListener('scroll', updateNav, { passive: true });
  updateNav();

  document.getElementById('year').textContent = new Date().getFullYear();
})();
