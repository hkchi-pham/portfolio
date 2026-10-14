(() => {
  const root = document.documentElement;

  document.querySelector('.theme-toggle').addEventListener('click', () => {
    const isDark = root.dataset.theme
      ? root.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = isDark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch (e) {}
  });

  // App-store style "more" toggle on the description
  const desc = document.getElementById('desc');
  const more = document.querySelector('.more');
  if (desc && more) {
    desc.classList.add('clamped');
    more.addEventListener('click', () => {
      const open = desc.classList.toggle('clamped') === false;
      more.setAttribute('aria-expanded', String(open));
      more.textContent = open ? 'less' : 'more';
    });
  }

  document.getElementById('year').textContent = new Date().getFullYear();
})();
