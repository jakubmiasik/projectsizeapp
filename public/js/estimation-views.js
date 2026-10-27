/* ==============================================================
   Optional estimation views: Architecture and Delivery process.

   Two extra tabs on the Project Estimate. Architecture shows an SVG
   diagram; Delivery process shows an interactive BPMN-style map, which is
   a whole HTML page of its own. Both come in with an estimation file
   (the v2 template carries them as static markup between FPS-VIEW
   markers, plus a #fps-views-data JSON block) or from an uploaded file.

   Loaded by the app, and inlined by Download into the estimation file,
   where it boots itself on the file's static markup. In the app the views
   are kept as data (getViews / setViews) and saved with the estimation.

   Neither diagram is trusted. The SVG is reduced to drawing elements
   before it is put in the page, and the process page only ever runs in a
   sandboxed frame without the app's origin.
   ============================================================== */
(function () {
  'use strict';

  var VIEW_KEYS = ['architecture', 'process'];
  var DEFAULT_TITLES = { architecture: 'Solution architecture', process: 'Delivery process' };
  var FORMATS = { architecture: 'svg', process: 'html' };
  var MAX_SVG = 3 * 1024 * 1024;
  var MAX_PROCESS = 8 * 1024 * 1024;
  var MAX_DATA = 512 * 1024;
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var SANDBOX = 'allow-scripts allow-downloads allow-popups allow-modals';

  // Drawing elements only: no script, foreignObject, links, animation or
  // style sheets, so nothing in the diagram can run or reach out.
  var SVG_ELEMENTS = {};
  ('svg g defs title desc symbol use marker clipPath mask pattern linearGradient radialGradient stop ' +
   'path rect circle ellipse line polyline polygon text tspan textPath image filter feBlend feColorMatrix ' +
   'feComponentTransfer feComposite feFlood feGaussianBlur feMerge feMergeNode feMorphology feOffset ' +
   'feDropShadow feFuncA feFuncB feFuncG feFuncR').split(' ').forEach(function (n) { SVG_ELEMENTS[n] = true; });

  function safeAttr(el, attr) {
    var name = attr.name.toLowerCase();
    var value = attr.value;
    if (name.indexOf('on') === 0) return false;
    if (/javascript:|vbscript:|expression\s*\(|@import/i.test(value)) return false;
    if (attr.localName === 'href') {
      if (value.charAt(0) === '#') return true;
      return el.localName === 'image' && /^data:image\/(png|jpe?g|gif|webp);base64,[\w+/=\s]*$/i.test(value);
    }
    // url(...) may only point inside the diagram (gradients, markers).
    if (/url\s*\(\s*['"]?\s*(?!#)/i.test(value)) return false;
    return true;
  }

  function sanitizeSvg(src) {
    if (typeof src !== 'string' || !src.trim() || src.length > MAX_SVG) return '';
    var doc = new DOMParser().parseFromString(src.trim().replace(/^<\?xml[^>]*\?>\s*/, ''), 'image/svg+xml');
    var svg = doc.documentElement;
    if (!svg || svg.localName !== 'svg' || svg.namespaceURI !== SVG_NS || doc.getElementsByTagName('parsererror').length) return '';
    (function walk(el) {
      Array.prototype.slice.call(el.childNodes).forEach(function (child) {
        if (child.nodeType === 1) {
          if (child.namespaceURI !== SVG_NS || !SVG_ELEMENTS[child.localName]) child.parentNode.removeChild(child);
          else walk(child);
        } else if (child.nodeType !== 3) {
          child.parentNode.removeChild(child);   // comments, processing instructions, CDATA
        }
      });
      Array.prototype.slice.call(el.attributes).forEach(function (attr) {
        if (!safeAttr(el, attr)) el.removeAttributeNode(attr);
      });
    })(svg);
    return new XMLSerializer().serializeToString(svg);
  }

  // The process page is stored as the content of its <head> and <body>
  // without the wrapper tags, the way the template's <template> holds it.
  function processFromPage(src) {
    if (typeof src !== 'string' || !src.trim()) return '';
    if (!/<html[\s>]|<body[\s>]|<head[\s>]/i.test(src)) return src.trim();
    var doc = new DOMParser().parseFromString(src, 'text/html');
    return (doc.head.innerHTML + '\n' + doc.body.innerHTML).trim();
  }

  function text(v, max) {
    return typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\s+/g, ' ').trim().slice(0, max) : '';
  }

  // The generator's own notes (source basis, diagram spec). Never rendered,
  // only carried along, so it just has to be plain, bounded JSON.
  function cleanData(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    try {
      var json = JSON.stringify(v);
      return json.length > MAX_DATA ? {} : JSON.parse(json);
    } catch (e) {
      return {};
    }
  }

  function cleanViews(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var out = {};
    VIEW_KEYS.forEach(function (key) {
      var v = raw[key];
      if (!v || typeof v !== 'object') return;
      var entry = {
        title: text(v.title, 200),
        description: text(v.description, 4000),
        notes: Array.isArray(v.notes) ? v.notes.map(function (n) { return text(n, 2000); }).filter(Boolean).slice(0, 50) : [],
        meta: text(v.meta, 2000),
        data: cleanData(v.data)
      };
      if (key === 'architecture') {
        entry.svg = sanitizeSvg(v.svg);
        if (!entry.svg) return;
      } else {
        entry.html = typeof v.html === 'string' && v.html.length <= MAX_PROCESS ? v.html.trim() : '';
        if (!entry.html) return;
      }
      out[key] = entry;
    });
    return Object.keys(out).length ? out : null;
  }

  // Reads the views out of a parsed estimation file. Only markup and JSON
  // are read; nothing in the file runs.
  function readFromDocument(doc) {
    var data = {};
    var dataEl = doc.getElementById('fps-views-data');
    if (dataEl && dataEl.tagName === 'SCRIPT' && dataEl.type === 'application/json') {
      try { data = JSON.parse(dataEl.textContent) || {}; } catch (e) { data = {}; }
    }
    var raw = {};
    VIEW_KEYS.forEach(function (key) {
      var pane = doc.querySelector('[data-fps-view="' + key + '"]');
      if (!pane) return;
      var pick = function (sel) { var el = pane.querySelector(sel); return el ? el.textContent : ''; };
      var entry = {
        title: pick('.fps-view-head h2'),
        description: pick('.fps-view-desc'),
        notes: Array.prototype.map.call(pane.querySelectorAll('.fps-view-notes li'), function (li) { return li.textContent; }),
        meta: pick('.fps-view-meta'),
        data: data[key]
      };
      if (key === 'architecture') {
        var svg = pane.querySelector('#fps-architecture-host svg');
        entry.svg = svg ? new XMLSerializer().serializeToString(svg) : '';
      } else {
        var tpl = pane.querySelector('template#fps-process-source');
        entry.html = tpl ? tpl.innerHTML : '';
      }
      raw[key] = entry;
    });
    return cleanViews(raw);
  }

  /* ---------- rendering into a view (the app's, or a file copy) ---------- */

  function paneOf(root, key) { return root.querySelector('[data-fps-view="' + key + '"]'); }

  function setEmpty(root, key, empty) {
    var p = paneOf(root, key);
    if (!p) return;
    p.querySelectorAll('.fps-diagram,.fps-frame,.fps-view-notes,.fps-view-meta,.fps-view-desc,.fps-view-head .actions').forEach(function (el) {
      el.hidden = empty || ((el.classList.contains('fps-view-notes') || el.classList.contains('fps-view-meta') || el.classList.contains('fps-view-desc')) && !el.textContent.trim());
    });
    var e = p.querySelector('.fps-view-empty');
    if (e) e.hidden = !empty;
    p.querySelectorAll('[data-fps-remove]').forEach(function (el) { el.hidden = empty; });
  }

  function renderView(root, key, v) {
    var p = paneOf(root, key);
    if (!p) return;
    var doc = p.ownerDocument;
    var h2 = p.querySelector('.fps-view-head h2');
    if (h2) h2.textContent = (v && v.title) || DEFAULT_TITLES[key];
    var desc = p.querySelector('.fps-view-desc');
    if (desc) desc.textContent = v ? v.description : '';
    var notes = p.querySelector('.fps-view-notes');
    if (notes) {
      notes.textContent = '';
      (v ? v.notes : []).forEach(function (n) { var li = doc.createElement('li'); li.textContent = n; notes.appendChild(li); });
    }
    var meta = p.querySelector('.fps-view-meta');
    if (meta) meta.textContent = v ? v.meta : '';
    if (key === 'architecture') {
      var host = p.querySelector('#fps-architecture-host');
      // Sanitised again here: data saved in the app may not have come
      // through this module.
      if (host) host.innerHTML = v ? sanitizeSvg(v.svg) : '';
    } else {
      var tpl = p.querySelector('#fps-process-source');
      if (tpl) tpl.innerHTML = v ? v.html : '';
    }
    setEmpty(root, key, !v);
  }

  // Fills a copy of the view for an estimation file: the content becomes
  // static markup, a view without content is taken out, and the app's own
  // edit controls go. Returns what #fps-views-data should hold.
  function writeToView(root, views) {
    var data = {};
    VIEW_KEYS.forEach(function (key) {
      var v = views && views[key];
      var p = paneOf(root, key);
      if (p) p.querySelectorAll('.fps-view-edit').forEach(function (el) { el.remove(); });
      if (!v) {
        var tab = root.querySelector('#de3-tabs [data-tab="' + key + '"]');
        if (tab) tab.remove();
        var pane = root.querySelector('#de3-pane-' + key);
        if (pane) pane.remove();
        return;
      }
      renderView(root, key, v);
      data[key] = Object.assign({}, v.data, { included: true, format: FORMATS[key] });
    });
    return data;
  }

  /* ---------- runtime: tabs, zoom, open, download ---------- */

  function escapeAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  function save(content, type, name) {
    var url = URL.createObjectURL(new Blob([content], { type: type }));
    var a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function openWindow(content, type) {
    var url = URL.createObjectURL(new Blob([content], { type: type }));
    window.open(url, '_blank', 'noopener');
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  function boot(root, opts) {
    opts = opts || {};
    if (!root || root.__fpsViews) return null;
    var getTitle = opts.title || function () {
      return (document.querySelector('.fps-file-banner strong') || {}).textContent || 'Project';
    };
    var slug = function () { return String(getTitle() || 'Project').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'Project'; };
    var archSvg = function () { var h = root.querySelector('#fps-architecture-host'); return h && h.querySelector('svg'); };
    var processSource = function () { var t = root.querySelector('#fps-process-source'); return t ? t.innerHTML.trim() : ''; };
    var processDoc = function () {
      return '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>' + String(getTitle()).replace(/</g, '&lt;') + ' – Delivery process</title></head><body>' + processSource() + '</body></html>';
    };
    // Opened on its own, the process page would run with the opener's
    // origin, so it goes into the same sandbox as the tab's frame.
    var processWindow = function () {
      return '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><title>' + String(getTitle()).replace(/</g, '&lt;') + ' – Delivery process</title>' +
        '<style>html,body{margin:0;height:100%}iframe{display:block;border:0;width:100%;height:100%}</style></head>' +
        '<body><iframe sandbox="' + SANDBOX + '" srcdoc="' + escapeAttr(processDoc()) + '"></iframe></body></html>';
    };
    var svgDoc = function () { var s = archSvg(); return s ? '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(s) : ''; };

    var loaded = false;
    function loadProcess() {
      if (loaded || !processSource()) return;
      var frame = root.querySelector('#fps-process-frame');
      if (!frame) return;
      loaded = true;
      frame.setAttribute('sandbox', SANDBOX);
      frame.srcdoc = processDoc();
    }
    function refresh() {
      setEmpty(root, 'architecture', !archSvg());
      setEmpty(root, 'process', !processSource());
      loaded = false;
      var frame = root.querySelector('#fps-process-frame');
      if (frame) frame.removeAttribute('srcdoc');
      var pane = root.querySelector('#de3-pane-process');
      if (pane && pane.classList.contains('active')) loadProcess();
    }
    refresh();

    root.addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b || !root.contains(b)) return;
      if (b.dataset.tab === 'process') loadProcess();
      if (b.dataset.fpsZoom === 'architecture') {
        var f = root.querySelector('#fps-architecture-host');
        var actual = f.classList.toggle('is-actual');
        b.textContent = actual ? 'Fit to width' : 'Actual size';
      }
      if (b.dataset.fpsDownload === 'architecture') save(svgDoc(), 'image/svg+xml', slug() + '-architecture.svg');
      if (b.dataset.fpsDownload === 'process') save(processDoc(), 'text/html', slug() + '-delivery-process.html');
      if (b.dataset.fpsOpen === 'architecture') openWindow(svgDoc(), 'image/svg+xml');
      if (b.dataset.fpsOpen === 'process') openWindow(processWindow(), 'text/html');
    });
    window.addEventListener('beforeprint', loadProcess);
    root.__fpsViews = { refresh: refresh };
    return root.__fpsViews;
  }

  /* ---------- app: views as data, with upload and remove ---------- */

  var app = { root: null, views: null, runtime: null, opts: {} };

  function setViews(views) {
    app.views = cleanViews(views);
    if (!app.root) return;
    VIEW_KEYS.forEach(function (key) { renderView(app.root, key, app.views && app.views[key]); });
    app.runtime.refresh();
  }

  function getViews() { return app.views ? JSON.parse(JSON.stringify(app.views)) : null; }

  function init(root, opts) {
    if (!root || app.root) return;
    app.root = root;
    app.opts = opts || {};
    app.runtime = boot(root, { title: app.opts.title });
    var notify = function (msg, title) { return app.opts.alert ? app.opts.alert(msg, title) : Promise.resolve(window.alert(msg)); };
    var confirm = function (msg, title) { return app.opts.confirm ? app.opts.confirm(msg, title) : Promise.resolve(window.confirm(msg)); };

    root.addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b || !root.contains(b) || b.disabled) return;
      if (b.dataset.fpsUpload) {
        var input = root.querySelector('input[data-fps-file="' + b.dataset.fpsUpload + '"]');
        if (input) { input.value = ''; input.click(); }
      }
      if (b.dataset.fpsRemove) {
        var key = b.dataset.fpsRemove;
        confirm('Remove the ' + DEFAULT_TITLES[key].toLowerCase() + ' from this estimation? Save the estimation to keep the change.', 'Remove diagram').then(function (ok) {
          if (!ok || !app.views) return;
          var next = getViews() || {};
          delete next[key];
          setViews(next);
        });
      }
    });

    root.addEventListener('change', function (ev) {
      var input = ev.target;
      var key = input.dataset && input.dataset.fpsFile;
      if (!key || !input.files || !input.files[0]) return;
      var file = input.files[0];
      var limit = key === 'architecture' ? MAX_SVG : MAX_PROCESS;
      if (file.size > limit) { notify('This file is too large for the ' + DEFAULT_TITLES[key].toLowerCase() + '.', 'Cannot use this file'); return; }
      file.text().then(function (src) {
        var next = getViews() || {};
        var entry = Object.assign({ title: '', description: '', notes: [], meta: '', data: {} }, next[key]);
        if (key === 'architecture') {
          entry.svg = sanitizeSvg(src);
          if (!entry.svg) { notify(file.name + ' is not an SVG image.', 'Cannot use this file'); return; }
        } else {
          entry.html = processFromPage(src);
          if (!entry.html) { notify(file.name + ' is empty.', 'Cannot use this file'); return; }
        }
        next[key] = entry;
        setViews(next);
      }, function (err) {
        notify('Could not read ' + file.name + ': ' + err.message, 'Cannot use this file');
      });
    });
    setViews(null);
  }

  window.FabricEstimationViews = {
    VIEW_KEYS: VIEW_KEYS,
    sanitizeSvg: sanitizeSvg,
    cleanViews: cleanViews,
    readFromDocument: readFromDocument,
    writeToView: writeToView,
    boot: boot,
    init: init,
    setViews: setViews,
    getViews: getViews
  };

  // In an estimation file the views are already static markup.
  if (document.body && document.body.classList.contains('fps-file')) {
    boot(document.getElementById('detailed-estimation-view'));
  }
})();
