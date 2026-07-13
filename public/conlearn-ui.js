/* Conlearn UI interactions based on Chain Summit template styles */

function animateCounters() {
  const counters = document.querySelectorAll('.stat-number');
  if (!counters.length) return;

  counters.forEach((counter) => {
    const target = Number.parseInt(counter.getAttribute('data-target') || '0', 10);
    if (!target) return;

    const increment = Math.max(1, Math.floor(target / 200));
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        counter.textContent = String(target);
        clearInterval(timer);
      } else {
        counter.textContent = String(current);
      }
    }, 12);
  });
}

function updateCountdown() {
  const countdown = document.getElementById('countdown');
  if (!countdown) return;

  const eventDate = new Date(countdown.getAttribute('data-date') || '2026-01-15T09:00:00');
  const now = new Date();
  const diff = eventDate - now;

  if (diff <= 0) return;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  const daysEl = document.getElementById('days');
  const hoursEl = document.getElementById('hours');
  const minutesEl = document.getElementById('minutes');
  const secondsEl = document.getElementById('seconds');

  if (daysEl) daysEl.textContent = String(days).padStart(2, '0');
  if (hoursEl) hoursEl.textContent = String(hours).padStart(2, '0');
  if (minutesEl) minutesEl.textContent = String(minutes).padStart(2, '0');
  if (secondsEl) secondsEl.textContent = String(seconds).padStart(2, '0');
}

function createNeuralNetwork() {
  const container = document.getElementById('neuralNetwork');
  if (!container) return;

  const nodes = 20;
  for (let i = 0; i < nodes; i += 1) {
    const node = document.createElement('div');
    node.className = 'node';
    node.style.left = `${Math.random() * 100}%`;
    node.style.top = `${Math.random() * 100}%`;
    node.style.animationDelay = `${Math.random() * 2}s`;
    container.appendChild(node);

    if (i > 0 && Math.random() > 0.5) {
      const connection = document.createElement('div');
      connection.className = 'connection';
      connection.style.left = `${Math.random() * 100}%`;
      connection.style.top = `${Math.random() * 100}%`;
      connection.style.width = `${Math.random() * 200 + 50}px`;
      connection.style.animationDelay = `${Math.random() * 3}s`;
      container.appendChild(connection);
    }
  }
}

function createParticles() {
  const container = document.getElementById('particles');
  if (!container) return;

  const particleCount = 50;
  for (let i = 0; i < particleCount; i += 1) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.animationDelay = `${Math.random() * 6}s`;
    particle.style.animationDuration = `${10 + Math.random() * 4}s`;
    container.appendChild(particle);
  }
}

function setupScheduleTabs() {
  const tabs = document.querySelectorAll('[data-schedule-tab]');
  if (!tabs.length) return;

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-target');
      if (!target) return;

      document.querySelectorAll('.schedule-content').forEach((content) => {
        content.classList.remove('active');
      });
      document.querySelectorAll('[data-schedule-tab]').forEach((btn) => {
        btn.classList.remove('active');
      });

      const targetEl = document.getElementById(target);
      if (targetEl) targetEl.classList.add('active');
      tab.classList.add('active');
    });
  });
}

function setupTimelineItems() {
  const items = document.querySelectorAll('.timeline-item');
  if (!items.length) return;

  items.forEach((item) => {
    item.addEventListener('click', () => {
      item.classList.toggle('expanded');
    });
  });
}

function setupMobileMenu() {
  const mobileMenu = document.querySelector('.mobile-menu');
  const mobileNav = document.getElementById('mobileNav');
  if (!mobileMenu || !mobileNav) return;

  mobileMenu.addEventListener('click', () => {
    mobileMenu.classList.toggle('active');
    mobileNav.classList.toggle('active');
    document.body.style.overflow = mobileNav.classList.contains('active') ? 'hidden' : 'auto';
  });

  mobileNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      mobileMenu.classList.remove('active');
      mobileNav.classList.remove('active');
      document.body.style.overflow = 'auto';
    });
  });
}

function setupSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (event) => {
      const targetId = anchor.getAttribute('href');
      if (!targetId || targetId === '#') return;

      const target = document.querySelector(targetId);
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function setupActiveMenuHighlight() {
  const sections = document.querySelectorAll('section[id]');
  if (!sections.length) return;

  const update = () => {
    const scrollPosition = window.scrollY + 120;

    sections.forEach((section) => {
      const sectionTop = section.offsetTop;
      const sectionHeight = section.offsetHeight;
      const sectionId = section.getAttribute('id');

      if (!sectionId) return;
      if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
        document.querySelectorAll('.nav-links a').forEach((link) => {
          link.classList.toggle('active', link.getAttribute('href') === `#${sectionId}`);
        });
        document.querySelectorAll('.mobile-nav a').forEach((link) => {
          link.classList.toggle('active', link.getAttribute('href') === `#${sectionId}`);
        });
      }
    });
  };

  update();
  window.addEventListener('scroll', update);
}

function setupHeaderScroll() {
  const header = document.querySelector('header');
  if (!header) return;

  const onScroll = () => {
    if (window.scrollY > 100) {
      header.style.background = 'rgba(10, 10, 15, 0.95)';
      header.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';
    } else {
      header.style.background = 'rgba(10, 10, 15, 0.9)';
      header.style.borderBottom = '1px solid rgba(255, 255, 255, 0.05)';
    }
  };

  onScroll();
  window.addEventListener('scroll', onScroll);
}

const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -100px 0px',
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('animated');
    }
  });
}, observerOptions);

function initScrollAnimations() {
  // Enable the JS-gated hidden reveal state only now that the observer is
  // running — no-JS users keep seeing content.
  document.documentElement.classList.add('js-reveal');

  document.querySelectorAll('.animate-on-scroll').forEach((el) => {
    if (el.closest('[data-dashboard-shell]')) return;
    observer.observe(el);
  });

  document.querySelectorAll('.timeline-item').forEach((item, index) => {
    if (item.closest('[data-dashboard-shell]')) return;
    item.style.setProperty('--stagger', String(index + 1));
    item.classList.add('stagger-animation');
  });

  // Safety net: the reveal hidden-state fails closed (invisible) if the
  // observer never fires — e.g. a card parked in the bottom rootMargin band
  // on a very short viewport. Reveal any still-hidden element that's already
  // within view so nothing can get stuck invisible; off-screen ones still
  // reveal normally on scroll.
  setTimeout(() => {
    document.querySelectorAll('.premium-reveal:not(.animated)').forEach((el) => {
      if (el.closest('[data-dashboard-shell]')) return;
      if (el.getBoundingClientRect().top < window.innerHeight) {
        el.classList.add('animated');
      }
    });
  }, 1400);
}

function addHexDecorations() {
  const sections = document.querySelectorAll('.section');
  sections.forEach((section, index) => {
    if (section.closest('[data-dashboard-shell]')) return;
    if (index === 0) return;

    const hexCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < hexCount; i += 1) {
      const hex = document.createElement('div');
      hex.className = 'hex-decoration';
      hex.style.top = `${Math.random() * 80 + 10}%`;
      hex.style.left = `${Math.random() * 80 + 10}%`;
      hex.style.animationDelay = `${Math.random() * 6}s`;
      section.style.position = 'relative';
      section.appendChild(hex);
    }
  });
}

function setupFormHandlers() {
  const contactForm = document.querySelector('[data-contact-form]');
  const contactMessage = document.getElementById('contactFormMessage');
  if (contactForm) {
    contactForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (contactMessage) {
        contactMessage.textContent = 'Thanks! We will reply within 24 hours.';
        contactMessage.className = 'form-message success';
        contactMessage.style.display = 'block';
      }
      contactForm.reset();
    });
  }

  document.querySelectorAll('[data-email-form]').forEach((form) => {
    const message = form.querySelector('.form-message');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (message) {
        message.textContent = 'You are in! We will send updates soon.';
        message.className = 'form-message success';
        message.style.display = 'block';
      }
      form.reset();
    });
  });
}

function initConlearnUi() {
  if (window.__conlearnUiInitialized) return;
  window.__conlearnUiInitialized = true;

  animateCounters();
  createNeuralNetwork();
  createParticles();
  updateCountdown();
  initScrollAnimations();
  addHexDecorations();
  setupScheduleTabs();
  setupTimelineItems();
  setupMobileMenu();
  setupSmoothScroll();
  setupActiveMenuHighlight();
  setupHeaderScroll();
  setupFormHandlers();

  if (document.getElementById('countdown')) {
    setInterval(updateCountdown, 1000);
  }
}

function scheduleConlearnUi() {
  const run = () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if ('requestIdleCallback' in window) {
          window.requestIdleCallback(initConlearnUi, { timeout: 1500 });
        } else {
          window.setTimeout(initConlearnUi, 250);
        }
      });
    });
  };

  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
}

scheduleConlearnUi();
