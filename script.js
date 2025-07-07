document.addEventListener('DOMContentLoaded', () => {
    // Initialize Typed.js
    if (document.querySelector('#im-a')) {
        new Typed('#im-a', {
            strings: [
                "I code things that actually work.",
                "I mess with security (ethically, ofc).",
                "I make the web faster and smarter.",
                "I bring ideas to life with code.",
                "I debug faster than you can say 'syntax error'.",
                "I automate things so I can be lazy efficiently.",
                "I build, break, and fix stuff—sometimes in that order.",
                "I make the internet a better place, one bug fix at a time.",
                "I reverse-engineer problems before they exist.",
                "I write code that future me won't hate (hopefully).",
                "I turn coffee into code, errors, and then solutions.",
                "I optimize everything... except my sleep schedule."
            ],
            typeSpeed: window.matchMedia("(max-width: 768px)").matches ? 75 : 100,
            backSpeed: window.matchMedia("(max-width: 768px)").matches ? 40 : 50,
            loop: true,
            showCursor: true,
            cursorChar: '',
            smartBackspace: true,
            contentType: 'html'
        });
    }

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    // Add a class to the body for touch/non-touch devices
    document.body.classList.add(('ontouchstart' in window || navigator.maxTouchPoints) ? 'touch-device' : 'non-touch-device');

    // Navbar scroll effect
    const navbar = document.querySelector('header');
    if (navbar) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        });
    }
});
