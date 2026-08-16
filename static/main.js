/* CFAOC — small progressive enhancements. Everything still works without them. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------- masthead on scroll */
  var masthead = document.querySelector('[data-masthead]');
  if (masthead) {
    var onScroll = function () {
      masthead.classList.toggle('is-stuck', window.scrollY > 24);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* --------------------------------------------------------- mobile nav */
  var toggle = document.querySelector('[data-navtoggle]');
  var nav = document.querySelector('[data-nav]');
  if (toggle && nav) {
    var setNav = function (open) {
      toggle.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
    };
    toggle.addEventListener('click', function () {
      setNav(toggle.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setNav(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || toggle.getAttribute('aria-expanded') !== 'true') return;
      setNav(false);
      toggle.focus();
    });
    /* Closing the drawer by resizing past the breakpoint keeps state honest. */
    window.addEventListener('resize', function () {
      if (window.innerWidth > 860) setNav(false);
    });
  }

  /* -------------------------------------- which section am I looking at? */
  var spyLinks = [].slice
    .call(document.querySelectorAll('.nav__list a[href*="#"]'))
    .map(function (a) {
      var id = a.getAttribute('href').split('#')[1];
      var target = id && document.getElementById(id);
      return target ? { link: a, target: target } : null;
    })
    .filter(Boolean);

  if (spyLinks.length && 'IntersectionObserver' in window) {
    var mark = function (active) {
      spyLinks.forEach(function (s) {
        if (s.link === active) s.link.setAttribute('aria-current', 'true');
        else s.link.removeAttribute('aria-current');
      });
    };
    var spy = new IntersectionObserver(
      function () {
        var best = null;
        var line = window.innerHeight * 0.35;
        spyLinks.forEach(function (s) {
          var top = s.target.getBoundingClientRect().top;
          if (top <= line && (!best || top > best.top)) best = { top: top, link: s.link };
        });
        mark(best && best.link);
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: [0, 1] }
    );
    spyLinks.forEach(function (s) { spy.observe(s.target); });
  }

  /* ----------------------------------------------------------- countdown */
  document.querySelectorAll('[data-countdown]').forEach(function (el) {
    var target = new Date(el.getAttribute('data-countdown')).getTime();
    if (isNaN(target)) return;

    var fields = {
      days: el.querySelector('[data-cd="days"]'),
      hours: el.querySelector('[data-cd="hours"]'),
      mins: el.querySelector('[data-cd="mins"]'),
    };

    var tick = function () {
      var left = target - Date.now();
      if (left <= 0) {
        el.hidden = true;
        return;
      }
      el.hidden = false;
      var mins = Math.floor(left / 60000);
      fields.days.textContent = Math.floor(mins / 1440);
      fields.hours.textContent = Math.floor((mins % 1440) / 60);
      fields.mins.textContent = mins % 60;
    };

    tick();
    setInterval(tick, 30000);
  });

  /* -------------------------------------------------------- reveal on scroll */
  var revealables = document.querySelectorAll('[data-reveal]');
  if (reduced || !('IntersectionObserver' in window)) {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry, i) {
          if (!entry.isIntersecting) return;
          setTimeout(function () { entry.target.classList.add('is-in'); }, i * 60);
          io.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    revealables.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------- lightbox */
  var overlay = document.querySelector('[data-lightbox-overlay]');
  var triggers = [].slice.call(document.querySelectorAll('[data-lightbox]'));
  if (overlay && triggers.length) {
    var lbImg = overlay.querySelector('[data-lightbox-img]');
    var lbCap = overlay.querySelector('[data-lightbox-cap]');
    var btnClose = overlay.querySelector('[data-lightbox-close]');
    var btnPrev = overlay.querySelector('[data-lightbox-prev]');
    var btnNext = overlay.querySelector('[data-lightbox-next]');
    var index = -1;
    var lastFocus = null;

    if (triggers.length > 1) {
      btnPrev.hidden = false;
      btnNext.hidden = false;
    }

    var show = function (i) {
      index = (i + triggers.length) % triggers.length;
      var t = triggers[index];
      lbImg.src = t.getAttribute('data-src');
      lbImg.alt = t.getAttribute('data-caption') || '';
      lbCap.textContent = t.getAttribute('data-caption') || '';
      overlay.hidden = false;
      document.body.style.overflow = 'hidden';
      btnClose.focus();
    };

    var hide = function () {
      overlay.hidden = true;
      document.body.style.overflow = '';
      if (lastFocus) lastFocus.focus();
    };

    triggers.forEach(function (t, i) {
      t.addEventListener('click', function () {
        lastFocus = t;
        show(i);
      });
    });

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) hide();
    });
    btnClose.addEventListener('click', hide);
    btnPrev.addEventListener('click', function () { show(index - 1); });
    btnNext.addEventListener('click', function () { show(index + 1); });

    document.addEventListener('keydown', function (e) {
      if (overlay.hidden) return;
      if (e.key === 'Escape') hide();
      if (e.key === 'ArrowRight') show(index + 1);
      if (e.key === 'ArrowLeft') show(index - 1);
      /* Keep tabbing inside the dialog while it is open. */
      if (e.key === 'Tab') {
        var stops = [].slice.call(overlay.querySelectorAll('button:not([hidden])'));
        var first = stops[0];
        var last = stops[stops.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* ------------------------------------------------------------- printing */
  /* Delegates print the event page — a collapsed answer is a lost answer. */
  var reopen = [];
  window.addEventListener('beforeprint', function () {
    reopen = [].slice.call(document.querySelectorAll('details:not([open])'));
    reopen.forEach(function (d) { d.open = true; });
  });
  window.addEventListener('afterprint', function () {
    reopen.forEach(function (d) { d.open = false; });
    reopen = [];
  });
})();
