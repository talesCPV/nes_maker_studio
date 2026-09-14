/**
 * Base path do app.
 * Produção (domínio na raiz):  deixe '' 
 * Localhost (ex: http://localhost/retrocompiler/):  '/retrocompiler'
 *
 * Pode definir ANTES deste script: window.APP_BASE = '/retrocompiler';
 * Se não definir, tenta detectar pelo pathname.
 */
(function () {
  function detect() {
    if (typeof window.APP_BASE === 'string') {
      return window.APP_BASE.replace(/\/$/, '');
    }
    var p = location.pathname || '';
    var entries = ['/login.html', '/register.html', '/index.html'];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (p.length >= e.length && p.slice(-e.length) === e) {
        var b = p.slice(0, -e.length);
        return b === '/' ? '' : b;
      }
    }
    // /algo/sistemas/nes/... ou /algo/sistemas/a2600/... → base = /algo
    var idxNes = p.indexOf('/sistemas/nes/');
    if (idxNes >= 0) return p.slice(0, idxNes);
    var idxA = p.indexOf('/sistemas/a2600/');
    if (idxA >= 0) return p.slice(0, idxA);
    var idxNesRoot = p.indexOf('/sistemas/nes');
    if (idxNesRoot >= 0) return p.slice(0, idxNesRoot);
    var idxARoot = p.indexOf('/sistemas/a2600');
    if (idxARoot >= 0) return p.slice(0, idxARoot);
    var idxMdRoot = p.indexOf('/sistemas/megadrive');
    if (idxMdRoot >= 0) return p.slice(0, idxMdRoot);
    // pathname é / ou /algo/
    if (p === '/' || p === '') return '';
    if (p.slice(-1) === '/') {
      var d = p.slice(0, -1);
      return d === '' ? '' : d;
    }
    return '';
  }

  var base = detect();
  window.APP_BASE = base;

  /** Monta URL absoluta no site: APP('/login.html') → '/retrocompiler/login.html' ou '/login.html' */
  window.APP = function (path) {
    var b = (window.APP_BASE || '').replace(/\/$/, '');
    var p = String(path || '');
    if (!p) return b || '/';
    if (/^https?:\/\//i.test(p)) return p;
    if (p.charAt(0) !== '/') p = '/' + p;
    return b + p;
  };
})();
