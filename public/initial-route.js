try {
  const theme = window.localStorage.getItem('conectavagasdf.theme') === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = theme === 'dark' ? '#101713' : '#F7F6F2';
} catch {
  document.documentElement.dataset.theme = 'light';
}

if (window.location.pathname !== '/') {
  document.documentElement.classList.add('initial-other-route');
}
