(() => {
  const root = document.documentElement;

  // Theme toggle: remembers the visitor's choice, defaults to OS preference.
  document.querySelector('.theme-toggle').addEventListener('click', () => {
    const isDark = root.dataset.theme
      ? root.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = isDark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch (e) {}
  });

  // Mobile menu
  const menuBtn = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.nav');
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
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('in'));
  }

  // Active nav link follows the section in view
  const links = [...nav.querySelectorAll('a')];
  const sections = links.map((a) => document.querySelector(a.getAttribute('href')));
  const toTop = document.querySelector('.to-top');
  const onScroll = () => {
    const y = window.scrollY + window.innerHeight * 0.35;
    let current = 0;
    sections.forEach((s, i) => { if (s && s.offsetTop <= y) current = i; });
    links.forEach((a, i) => a.classList.toggle('active', i === current));
    toTop.classList.toggle('show', window.scrollY > window.innerHeight * 0.8);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  document.getElementById('year').textContent = new Date().getFullYear();
})();
