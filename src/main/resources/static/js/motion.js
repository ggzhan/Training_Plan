// Motion for both pages, built on GSAP (+ Flip). Every helper also works
// without GSAP or with "reduce motion": the state change happens, only the
// movement is dropped (short fades at most).
//
// Two curves cover almost everything: things arriving decelerate hard
// ("power3.out"), things travelling ease both ways ("power2.inOut").

const Motion = (() => {
    const gsap = window.gsap;
    const Flip = window.Flip;
    if (gsap && Flip) gsap.registerPlugin(Flip);
    // CSS keeps its own simple entrances for when GSAP is missing
    if (gsap) document.documentElement.classList.add('has-gsap');

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const full = () => !!gsap && !reduced.matches;
    const any = () => !!gsap;

    const ARRIVE = 'power3.out';
    const TRAVEL = 'power2.inOut';
    const LEAVE = 'power2.in';

    // ----- Disclosures: open to height:auto, close to 0 -----
    function toggle(body, open, onDone) {
        if (!any()) {
            body.hidden = !open;
            if (onDone) onDone();
            return;
        }
        gsap.killTweensOf(body);
        if (open) {
            body.hidden = false;
            if (!full()) {
                gsap.fromTo(body, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.12, clearProps: 'opacity,visibility', onComplete: onDone });
                return;
            }
            gsap.fromTo(body, { height: 0, autoAlpha: 0, overflow: 'hidden' }, {
                height: 'auto', autoAlpha: 1, duration: 0.28, ease: TRAVEL,
                clearProps: 'height,opacity,visibility,overflow', onComplete: onDone
            });
        } else {
            const done = () => {
                body.hidden = true;
                gsap.set(body, { clearProps: 'height,opacity,visibility,overflow' });
                if (onDone) onDone();
            };
            if (!full()) {
                gsap.to(body, { autoAlpha: 0, duration: 0.1, onComplete: done });
                return;
            }
            gsap.to(body, { height: 0, autoAlpha: 0, overflow: 'hidden', duration: 0.2, ease: LEAVE, onComplete: done });
        }
    }

    // ----- Dialogs: rise in from 0.97, sink out faster -----
    function openDialog(dialog) {
        dialog.showModal();
        if (!any()) return;
        gsap.killTweensOf(dialog);
        gsap.fromTo(dialog,
            full() ? { autoAlpha: 0, scale: 0.97, y: 8 } : { autoAlpha: 0 },
            { autoAlpha: 1, scale: 1, y: 0, duration: full() ? 0.25 : 0.12, ease: ARRIVE, clearProps: 'transform,opacity,visibility' });
    }

    function closeDialog(dialog) {
        if (!dialog.open) return;
        if (!any()) {
            dialog.close();
            return;
        }
        gsap.killTweensOf(dialog);
        dialog.classList.add('is-closing');
        gsap.to(dialog, {
            autoAlpha: 0, scale: full() ? 0.97 : 1, duration: 0.15, ease: LEAVE,
            onComplete: () => {
                dialog.close();
                dialog.classList.remove('is-closing');
                gsap.set(dialog, { clearProps: 'transform,opacity,visibility' });
            }
        });
    }

    // ----- Feedback -----
    // Wrong input: a damped side-to-side, not only a red border
    function shake(el) {
        if (!el || !full()) return;
        gsap.killTweensOf(el, 'x');
        gsap.to(el, { keyframes: { x: [0, -10, 10, -6, 6, -3, 0] }, duration: 0.36, ease: 'none', clearProps: 'transform' });
    }

    // A number that went up comes in from below, one that went down from above
    function tick(el, direction) {
        if (!el || !full() || !direction) return;
        gsap.fromTo(el, { yPercent: 55 * direction, autoAlpha: 0 },
            { yPercent: 0, autoAlpha: 1, duration: 0.22, ease: ARRIVE, clearProps: 'transform,opacity,visibility' });
    }

    // An icon that just changed state settles into place
    function pop(el) {
        if (!el || !full()) return;
        gsap.fromTo(el, { scale: 0.7 }, { scale: 1, duration: 0.25, ease: ARRIVE, clearProps: 'transform' });
    }

    // A short highlight that says "this changed"
    // (Web Animations rather than GSAP: the palette is oklch, which the browser blends natively)
    function flash(el) {
        if (!el || !el.animate) return;
        const soft = getComputedStyle(document.documentElement).getPropertyValue('--accent-soft').trim();
        el.animate([{ backgroundColor: soft }, { backgroundColor: getComputedStyle(el).backgroundColor }],
            { duration: reduced.matches ? 400 : 900, easing: 'ease-out' });
    }

    // ----- Lists -----
    // New items arrive; a short list may stagger, but never for long
    function enter(elements) {
        const els = [...(elements || [])].filter(Boolean);
        if (els.length === 0 || !any()) return;
        if (!full()) {
            gsap.from(els, { autoAlpha: 0, duration: 0.12, clearProps: 'opacity,visibility' });
            return;
        }
        gsap.from(els, {
            autoAlpha: 0, y: 10, duration: 0.3, ease: ARRIVE,
            stagger: { amount: Math.min(0.25, 0.04 * (els.length - 1)) },
            clearProps: 'transform,opacity,visibility'
        });
    }

    // Re-render with continuity: elements with the same data-flip-id glide from
    // where they were to where they are now; new ones fade in, gone ones fade out.
    function flip(selector, mutate, root = document) {
        if (!full() || !Flip) {
            mutate();
            return;
        }
        const state = Flip.getState(root.querySelectorAll(selector));
        mutate();
        Flip.from(state, {
            targets: root.querySelectorAll(selector),
            duration: 0.35,
            ease: TRAVEL,
            // Stay in the layout: taking items out collapses their container and the page jumps
            absolute: false,
            nested: true,
            scale: false,
            onEnter: els => gsap.fromTo(els, { autoAlpha: 0, scale: 0.97 }, { autoAlpha: 1, scale: 1, duration: 0.3, ease: ARRIVE }),
            onLeave: els => gsap.to(els, { autoAlpha: 0, duration: 0.15 })
        });
    }

    // ----- Toast -----
    function toastIn(el) {
        if (!el || !any()) return;
        gsap.fromTo(el, full() ? { autoAlpha: 0, y: 16 } : { autoAlpha: 0 },
            { autoAlpha: 1, y: 0, duration: full() ? 0.25 : 0.12, ease: ARRIVE });
    }

    function toastOut(el, onDone) {
        if (!el || !any()) {
            onDone();
            return;
        }
        gsap.to(el, { autoAlpha: 0, y: full() ? 8 : 0, duration: 0.15, ease: LEAVE, onComplete: onDone });
    }

    // ----- Sliding highlight (Übung number row) -----
    function slideTo(indicator, target, instant) {
        if (!indicator || !target) return;
        const x = target.offsetLeft;
        const width = target.offsetWidth;
        if (!any() || instant || !full()) {
            if (gsap) gsap.set(indicator, { x, width, autoAlpha: 1 });
            else Object.assign(indicator.style, { transform: `translateX(${x}px)`, width: `${width}px`, opacity: 1 });
            return;
        }
        gsap.to(indicator, { x, width, autoAlpha: 1, duration: 0.3, ease: TRAVEL, overwrite: 'auto' });
    }

    // Scroll to an element: glide with full motion, jump with reduced motion
    function scrollTo(el) {
        if (!el) return;
        el.scrollIntoView({ block: 'start', behavior: full() ? 'smooth' : 'auto' });
    }

    return { full, scrollTo, toggle, openDialog, closeDialog, shake, tick, pop, flash, enter, flip, toastIn, toastOut, slideTo };
})();
