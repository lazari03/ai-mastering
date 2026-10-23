"use client";

import { useEffect } from "react";

/**
 * Drives the .reveal scroll-entry animations defined in globals.css.
 *
 * Two deliberate properties:
 *
 * 1. It opts IN to the animation by setting data-reveal="on" on <html>
 *    at mount. Until that happens (JS disabled, bundle still loading, a
 *    throw anywhere upstream) .reveal elements render at full opacity —
 *    the content is never gated behind an effect running successfully.
 *
 * 2. IntersectionObserver, never a scroll listener: a scroll handler
 *    fires on every frame of every scroll and forces layout reads, which
 *    is exactly how a marketing page ends up janky on a mid-range phone.
 *    The observer wakes only at the threshold crossing.
 *
 * Elements are unobserved once shown, so this is one-shot per element —
 * sections don't re-animate when scrolled back past.
 */
export default function ScrollReveal() {
  useEffect(() => {
    const root = document.documentElement;
    const targets = Array.from(document.querySelectorAll(".reveal"));
    if (!targets.length) return undefined;

    // No IntersectionObserver (very old browser): leave everything
    // visible rather than opting into an animation nothing will finish.
    if (typeof IntersectionObserver === "undefined") return undefined;

    root.setAttribute("data-reveal", "on");

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      // Fires a little before the element's top edge reaches the
      // viewport bottom, so the motion reads as the section settling
      // into place rather than starting late and chasing the scroll.
      { threshold: 0.08, rootMargin: "0px 0px -8% 0px" },
    );

    targets.forEach((el) => observer.observe(el));

    // Anything already on screen at mount (the hero) shows immediately —
    // the observer would do this on its first callback anyway, but doing
    // it synchronously avoids a first-paint flash of the hidden state.
    targets.forEach((el) => {
      const { top } = el.getBoundingClientRect();
      if (top < window.innerHeight) {
        el.classList.add("is-visible");
        observer.unobserve(el);
      }
    });

    return () => {
      observer.disconnect();
      root.removeAttribute("data-reveal");
    };
  }, []);

  return null;
}
