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
      if (e.key === 'Escape') setNav(false);
    });
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
  if (overlay) {
    var lbImg = overlay.querySelector('[data-lightbox-img]');
    var lbCap = overlay.querySelector('[data-lightbox-cap]');
    var triggers = Array.prototype.slice.call(document.querySelectorAll('[data-lightbox]'));
    var index = -1;
    var lastFocus = null;

    var show = function (i) {
      if (!triggers.length) return;
      index = (i + triggers.length) % triggers.length;
      var t = triggers[index];
      lbImg.src = t.getAttribute('data-src');
      lbImg.alt = t.getAttribute('data-caption') || '';
      lbCap.textContent = t.getAttribute('data-caption') || '';
      overlay.hidden = false;
      document.body.style.overflow = 'hidden';
      overlay.querySelector('[data-lightbox-close]').focus();
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
      if (e.target === overlay || e.target.hasAttribute('data-lightbox-close')) hide();
    });

    document.addEventListener('keydown', function (e) {
      if (overlay.hidden) return;
      if (e.key === 'Escape') hide();
      if (e.key === 'ArrowRight') show(index + 1);
      if (e.key === 'ArrowLeft') show(index - 1);
    });
  }
})();
