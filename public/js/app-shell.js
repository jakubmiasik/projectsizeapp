/* ══════════════════════════════════════════════════════════════
   Fabric Project Sizing — App Shell
   Renders the sidebar navigation and wires the topbar controls
   (sidebar collapse, dark mode, compact density) for every page.

   Load this in <head> WITHOUT defer so the saved theme is applied
   before first paint; DOM rendering waits for DOMContentLoaded.
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var STORAGE = {
    theme: 'fps-theme',
    density: 'fps-density',
    sidebar: 'fps-sidebar'
  };

  // Nav entries shared by every page. The loaded project is nested underneath
  // Sizing Workspace by setProject(); there is no standalone Requirements entry
  // because Requirements only ever exists in the context of a project.
  var NAV_SECTIONS = [
    {
      title: 'Main',
      items: [
        { id: 'sizing', label: 'Sizing Workspace', icon: 'bi-speedometer2', href: '/' }
      ]
    }
  ];

  // Labels reused by both the sidebar tree and the breadcrumb so the two can
  // never drift apart.
  var STEP_LABELS = {
    sizing: 'Sizing Workspace',
    detailed: 'Detailed estimation',
    requirements: 'Requirements'
  };

  var state = {
    active: null,
    extraSections: [],
    user: null,
    project: null
  };

  /* ──── Preferences (applied immediately, before paint) ──── */

  function readStored(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }
  function writeStored(key, value) {
    try { global.localStorage.setItem(key, value); } catch (e) { /* private mode */ }
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    var root = document.documentElement;
    root.setAttribute('data-theme', theme);
    // Bootstrap 5.3 components (dropdowns, modals, tables) read data-bs-theme.
    root.setAttribute('data-bs-theme', theme);
    updateThemeIcon(theme);
  }

  function updateThemeIcon(theme) {
    var icon = document.getElementById('themeIcon');
    if (icon) icon.className = theme === 'dark' ? 'bi bi-sun' : 'bi bi-moon';
    var btn = document.getElementById('themeToggleBtn');
    if (btn) btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }

  function applyDensity(density) {
    document.body.setAttribute('data-density', density);
    var icon = document.getElementById('densityIcon');
    if (icon) icon.className = density === 'compact' ? 'bi bi-distribute-horizontal' : 'bi bi-distribute-vertical';
  }

  function applySidebar(collapsed) {
    var sidebar = document.getElementById('appSidebar');
    if (sidebar) sidebar.classList.toggle('collapsed', collapsed);
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    var icon = document.getElementById('collapseIcon');
    if (icon) icon.className = collapsed ? 'bi bi-layout-sidebar-inset-reverse' : 'bi bi-layout-sidebar-inset';
  }

  // Runs at script-eval time: <html> already exists, so the theme lands before
  // the body is painted and there is no light-mode flash on a dark-mode reload.
  applyTheme(readStored(STORAGE.theme) === 'dark' ? 'dark' : 'light');

  /* ──── Public toggles ──── */

  function toggleTheme() {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    writeStored(STORAGE.theme, next);
    toast('Theme switched to ' + next + ' mode', 'info');
  }

  function toggleDensity() {
    var next = document.body.getAttribute('data-density') === 'compact' ? 'comfortable' : 'compact';
    applyDensity(next);
    writeStored(STORAGE.density, next);
    toast('View: ' + next, 'info');
  }

  function toggleSidebarCollapse(event) {
    if (event) event.preventDefault();
    var sidebar = document.getElementById('appSidebar');
    if (!sidebar) return;
    var collapsed = !sidebar.classList.contains('collapsed');
    applySidebar(collapsed);
    writeStored(STORAGE.sidebar, collapsed ? 'collapsed' : 'expanded');
  }

  function toggleSidebarMobile() {
    var sidebar = document.getElementById('appSidebar');
    var backdrop = document.getElementById('sidebarBackdrop');
    if (sidebar) sidebar.classList.toggle('show');
    if (backdrop) backdrop.classList.toggle('show');
  }

  /* ──── Toasts ──── */

  function toast(message, type) {
    var container = document.querySelector('.app-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'app-toast-container';
      document.body.appendChild(container);
    }
    var icons = { success: 'bi-check-circle-fill', error: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' };
    var kind = icons[type] ? type : 'info';
    var item = document.createElement('div');
    item.className = 'app-toast-item toast-' + kind;
    var icon = document.createElement('i');
    icon.className = 'bi ' + icons[kind];
    var text = document.createElement('span');
    text.textContent = message;
    item.appendChild(icon);
    item.appendChild(text);
    container.appendChild(item);
    global.setTimeout(function () { item.remove(); }, 4000);
  }

  /* ──── Sidebar rendering ──── */

  function isActiveItem(id) {
    if (!id) return false;
    if (id === state.active) return true;
    // On the sizing page highlight both the section and its T-Shirt step.
    if (id === 'sizing-step' && state.active === 'sizing') return true;
    // The detailed estimator and requirements both live inside the project.
    if (id === 'sizing' && (state.active === 'detailed' || state.active === 'requirements')) return false;
    return false;
  }

  function buildLink(item) {
    var el = document.createElement(item.onClick ? 'button' : 'a');
    el.className = 'sidebar-link' + (isActiveItem(item.id) ? ' active' : '');
    if (item.depth) {
      el.classList.add('sidebar-link-child');
      el.dataset.depth = String(item.depth);
    }
    if (item.onClick) {
      el.type = 'button';
      el.addEventListener('click', item.onClick);
    } else {
      el.href = item.href;
    }
    el.title = item.label;
    if (item.id) el.dataset.navId = item.id;

    if (item.icon) {
      var icon = document.createElement('i');
      icon.className = 'bi ' + item.icon;
      el.appendChild(icon);
    } else {
      // Tree nodes use a connector dash instead of an icon so the hierarchy
      // reads as a tree rather than a flat list of unrelated destinations.
      var dash = document.createElement('span');
      dash.className = 'sidebar-link-dash';
      dash.setAttribute('aria-hidden', 'true');
      el.appendChild(dash);
    }
    var label = document.createElement('span');
    label.textContent = item.label;
    el.appendChild(label);
    return el;
  }

  /* ──── Loaded project hierarchy ──── */

  // Every hop carries the project so navigating between pages keeps the same
  // estimation loaded instead of dropping the user on an empty workspace.
  function projectQuery(project) {
    var params = new global.URLSearchParams({
      estimationId: project.id || '',
      version: project.version || 1,
      title: project.title || ''
    });
    return params.toString();
  }

  function projectUrls(project) {
    var q = projectQuery(project);
    return {
      project: '/?' + q,
      sizing: '/?' + q,
      detailed: '/?' + q + '#detailed',
      requirements: '/requirements.html?' + q
    };
  }

  function projectTreeItems() {
    var project = state.project;
    if (!project || !project.id) return [];
    var urls = projectUrls(project);
    var nodes = [
      { id: 'project', label: project.title || 'Untitled project', href: urls.project, depth: 1, icon: 'bi-folder2-open' },
      { id: 'sizing-step', label: 'T-Shirt Sizing', href: urls.sizing, depth: 2 },
      { id: 'detailed', label: '3-Layer Architecture Effort Estimator', href: urls.detailed, depth: 3 },
      { id: 'requirements', label: 'Requirements', href: urls.requirements, depth: 4 }
    ];
    // The deeper steps stay admin-only, matching the buttons they replaced.
    var allowed = project.steps;
    if (!allowed) return nodes;
    return nodes.filter(function (node) {
      if (node.id === 'project' || node.id === 'sizing-step') return true;
      return allowed.indexOf(node.id) !== -1;
    });
  }


  function renderSidebar() {
    var sidebar = document.getElementById('appSidebar');
    if (!sidebar) return;
    sidebar.innerHTML = '';

    // Brand
    var brand = document.createElement('a');
    brand.className = 'sidebar-brand';
    brand.href = '/';
    var logo = document.createElement('span');
    logo.className = 'brand-logo';
    logo.textContent = 'F';
    var brandText = document.createElement('span');
    brandText.className = 'brand-text';
    brandText.appendChild(document.createTextNode('Fabric Project Sizing'));
    var brandSub = document.createElement('small');
    brandSub.textContent = 'xdcWarsaw internal';
    brandText.appendChild(brandSub);
    brand.appendChild(logo);
    brand.appendChild(brandText);
    sidebar.appendChild(brand);

    // Navigation
    var nav = document.createElement('nav');
    nav.className = 'sidebar-nav';

    NAV_SECTIONS.concat(state.extraSections).forEach(function (section) {
      if (!section.items.length) return;
      var title = document.createElement('p');
      title.className = 'nav-section-title';
      title.textContent = section.title;
      nav.appendChild(title);
      section.items.forEach(function (item) {
        nav.appendChild(buildLink(item));
        // The loaded project hangs off Sizing Workspace as a nested tree.
        if (item.id === 'sizing') {
          var tree = projectTreeItems();
          if (tree.length) {
            var group = document.createElement('div');
            group.className = 'sidebar-tree';
            group.id = 'projectTree';
            tree.forEach(function (node) { group.appendChild(buildLink(node)); });
            nav.appendChild(group);
          }
        }
      });
    });

    // Collapse toggle always sits at the bottom of the nav
    var collapse = document.createElement('button');
    collapse.type = 'button';
    collapse.className = 'sidebar-link mt-2';
    collapse.id = 'collapseLink';
    collapse.title = 'Collapse sidebar';
    collapse.addEventListener('click', toggleSidebarCollapse);
    var collapseIcon = document.createElement('i');
    collapseIcon.className = 'bi bi-layout-sidebar-inset';
    collapseIcon.id = 'collapseIcon';
    var collapseLabel = document.createElement('span');
    collapseLabel.textContent = 'Collapse';
    collapse.appendChild(collapseIcon);
    collapse.appendChild(collapseLabel);
    nav.appendChild(collapse);

    sidebar.appendChild(nav);

    // Footer (user + sign out) — filled in by setUser()
    var footer = document.createElement('div');
    footer.className = 'sidebar-footer';
    footer.id = 'sidebarFooter';
    sidebar.appendChild(footer);

    renderFooter();
  }

  function renderFooter() {
    var footer = document.getElementById('sidebarFooter');
    if (!footer) return;
    footer.innerHTML = '';

    if (!state.user) {
      var signIn = document.createElement('a');
      signIn.className = 'sidebar-link';
      signIn.href = '/login';
      signIn.title = 'Sign In';
      signIn.innerHTML = '<i class="bi bi-box-arrow-in-right"></i>';
      var signInLabel = document.createElement('span');
      signInLabel.textContent = 'Sign In';
      signIn.appendChild(signInLabel);
      footer.appendChild(signIn);
      return;
    }

    var row = document.createElement('div');
    row.className = 'sidebar-user';
    var avatar = document.createElement('div');
    avatar.className = 'sidebar-user-avatar';
    avatar.textContent = (state.user.name || 'U').charAt(0).toUpperCase();
    var info = document.createElement('div');
    info.className = 'sidebar-user-info';
    var name = document.createElement('div');
    name.className = 'sidebar-user-name';
    name.textContent = state.user.name || 'User';
    var email = document.createElement('div');
    email.className = 'sidebar-user-email';
    email.textContent = state.user.email || '';
    info.appendChild(name);
    info.appendChild(email);
    row.appendChild(avatar);
    row.appendChild(info);
    row.title = (state.user.name || '') + (state.user.email ? ' · ' + state.user.email : '');
    footer.appendChild(row);

    var signOut = document.createElement('button');
    signOut.type = 'button';
    signOut.className = 'sidebar-link';
    signOut.id = 'sidebarSignOut';
    signOut.title = 'Sign Out';
    signOut.style.fontSize = '0.8rem';
    signOut.innerHTML = '<i class="bi bi-box-arrow-right"></i>';
    var signOutLabel = document.createElement('span');
    signOutLabel.textContent = 'Sign Out';
    signOut.appendChild(signOutLabel);
    signOut.addEventListener('click', function () {
      if (typeof state.user.onSignOut === 'function') state.user.onSignOut();
      else global.location.href = '/.auth/logout?post_logout_redirect_uri=/';
    });
    footer.appendChild(signOut);
  }

  /* ──── Breadcrumb ──── */

  // Home › Project title › current step. The project crumb keeps its query
  // string so going "up" reopens the same estimation.
  function renderBreadcrumb() {
    var nav = document.querySelector('.topbar-breadcrumb');
    if (!nav) return;
    nav.innerHTML = '';

    var home = document.createElement('a');
    home.href = '/';
    home.setAttribute('aria-label', 'Home');
    home.innerHTML = '<i class="bi bi-house-fill"></i>';
    nav.appendChild(home);

    var crumbs = [];
    if (state.project && state.project.id) {
      crumbs.push({ label: state.project.title || 'Untitled project', href: projectUrls(state.project).project });
    }
    crumbs.push({ label: STEP_LABELS[state.active] || STEP_LABELS.sizing });

    crumbs.forEach(function (crumb, index) {
      var sep = document.createElement('span');
      sep.className = 'separator';
      sep.textContent = '/';
      nav.appendChild(sep);

      var isLast = index === crumbs.length - 1;
      var el;
      if (crumb.href && !isLast) {
        el = document.createElement('a');
        el.href = crumb.href;
      } else {
        el = document.createElement('span');
        el.className = 'current';
      }
      el.textContent = crumb.label;
      el.title = crumb.label;
      nav.appendChild(el);
    });
  }

  /* ──── Topbar wiring ──── */

  function wireTopbar() {
    var themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    var densityBtn = document.getElementById('densityToggleBtn');
    if (densityBtn) densityBtn.addEventListener('click', toggleDensity);

    var mobileBtn = document.getElementById('mobileToggleBtn');
    if (mobileBtn) mobileBtn.addEventListener('click', toggleSidebarMobile);

    var backdrop = document.getElementById('sidebarBackdrop');
    if (backdrop) backdrop.addEventListener('click', toggleSidebarMobile);

    var clock = document.getElementById('lastRefreshed');
    if (clock) {
      var tick = function () { clock.textContent = new Date().toLocaleTimeString(); };
      tick();
      global.setInterval(tick, 1000);
    }
  }

  function wireShortcuts() {
    document.addEventListener('keydown', function (e) {
      if (!e.ctrlKey && !e.metaKey) return;
      var key = (e.key || '').toLowerCase();
      if (e.shiftKey && key === 'd') { e.preventDefault(); toggleTheme(); return; }
      // Plain Ctrl+D would otherwise bookmark the page.
      if (!e.shiftKey && !e.altKey && key === 'd') { e.preventDefault(); toggleDensity(); }
    });
  }

  /* ──── Init ──── */

  function init(options) {
    var opts = options || {};
    state.active = opts.active || null;

    function boot() {
      applyDensity(readStored(STORAGE.density) === 'compact' ? 'compact' : 'comfortable');
      renderSidebar();
      // Sidebar starts collapsed unless the user explicitly expanded it before.
      applySidebar(readStored(STORAGE.sidebar) !== 'expanded');
      wireTopbar();
      wireShortcuts();
      renderBreadcrumb();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }

  /** Adds a nav section (e.g. an admin-only group) and re-renders the sidebar. */
  function addNavSection(section) {
    state.extraSections.push(section);
    if (document.getElementById('appSidebar')) renderSidebar();
  }

  /** Sets the signed-in user shown in the sidebar footer. */
  function setUser(user) {
    state.user = user;
    renderFooter();
  }

  /**
   * Publishes the currently loaded estimation so the sidebar shows its
   * hierarchy and the breadcrumb points back at it. Pass null to clear.
   * @param {{id:string,title:string,version:number|string}|null} project
   */
  function setProject(project) {
    state.project = project && project.id ? {
      id: project.id,
      title: project.title || '',
      version: project.version || 1,
      steps: project.steps || null
    } : null;
    if (document.getElementById('appSidebar')) renderSidebar();
    renderBreadcrumb();
  }

  function setActive(id) {
    state.active = id;
    if (document.getElementById('appSidebar')) renderSidebar();
    renderBreadcrumb();
  }

  global.AppShell = {
    init: init,
    addNavSection: addNavSection,
    setUser: setUser,
    setProject: setProject,
    getProject: function () { return state.project; },
    setActive: setActive,
    toggleTheme: toggleTheme,
    toggleDensity: toggleDensity,
    toggleSidebar: toggleSidebarMobile,
    collapseSidebar: toggleSidebarCollapse,
    toast: toast,
    getTheme: currentTheme
  };
})(window);
