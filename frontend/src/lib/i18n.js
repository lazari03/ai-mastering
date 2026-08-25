"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { PLANS, SINGLE_MASTER } from "./pricing.js";

// Single source of truth for every user-facing string on the site —
// English + Albanian. Nothing under src/app or src/components should have
// a literal English sentence in it; it should call t("some.key") and look
// it up here instead. Two languages, no plural/format rules needed, so a
// plain object + React context does the job — not a full i18n library.
const DICT = {
  "nav.features": { en: "Features", sq: "Veçoritë" },
  "nav.howTo": { en: "How It Works", sq: "Si Funksionon" },
  "nav.faq": { en: "FAQ", sq: "Pyetje" },
  "nav.contact": { en: "Contact", sq: "Kontakt" },
  "nav.pricing": { en: "Pricing", sq: "Çmimet" },
  "nav.blog": { en: "Guides", sq: "Udhëzues" },
  "nav.signin": { en: "Sign in", sq: "Hyrje" },
  "nav.openApp": { en: "Open App", sq: "Hap Aplikacionin" },

  "hero.eyebrow": { en: "AI Audio Mastering, Online", sq: "Masterizim Audio me AI, Online" },
  "hero.title1": { en: "Professional AI Mastering.", sq: "Masterizim Profesional me AI." },
  "hero.title2": { en: "Built on Real DSP.", sq: "I Ndërtuar mbi DSP të Vërtetë." },
  "hero.body": {
    en: "Master your tracks online with adaptive DSP — genre-specific processing, instant A/B comparison, and codec preview for how it'll actually sound on Spotify or Instagram.",
    sq: "Masterizo këngët e tua online me DSP adaptiv — përpunim specifik për zhanrin, krahasim A/B të menjëhershëm, dhe parapamje kodeku për si do të tingëllojë realisht në Spotify apo Instagram.",
  },
  "hero.ctaPrimary": { en: "Master a Track Free", sq: "Masterizo Falas" },
  "hero.ctaSecondary": { en: "Explore Features", sq: "Eksploro Veçoritë" },
  "hero.ctaReassurance": { en: "3 free masters · No credit card", sq: "3 masterë falas · Pa kartë krediti" },
  "hero.stat1.value": { en: "8", sq: "8" },
  "hero.stat1.label": { en: "Genre engines", sq: "Motorë zhanri" },
  "hero.stat2.value": { en: "21+", sq: "21+" },
  "hero.stat2.label": { en: "Built-in presets", sq: "Presete të integruara" },
  "hero.stat3.value": { en: "-1dBTP", sq: "-1dBTP" },
  "hero.stat3.label": { en: "True-peak safe", sq: "I sigurt në true-peak" },

  "demo.eyebrow": { en: "Hear It", sq: "Dëgjoje" },
  "demo.title": { en: "Before and after, in your own ears", sq: "Para dhe pas, me veshët e tu" },
  "demo.body": {
    en: "Real tracks, run through the actual engine — not a marketing clip. Toggle Before/After at the same point in the song and hear exactly what changes.",
    sq: "Këngë reale, të përpunuara nga vetë motori — jo një klip marketingu. Kalo mes Para/Pas në të njëjtin moment të këngës dhe dëgjo saktësisht çfarë ndryshon.",
  },

  "features.eyebrow": { en: "Features", sq: "Veçoritë" },
  "features.title": { en: "Everything a real release needs", sq: "Gjithçka që i duhet një botimi real" },
  "features.f1.eyebrow": { en: "Precision", sq: "Precizion" },
  "features.f1.title": { en: "Adaptive DSP", sq: "DSP Adaptive" },
  "features.f1.body": {
    en: "Automatic analysis-first processing for tonal balance, loudness, and dynamics — measured before anything is touched.",
    sq: "Përpunim automatik i bazuar në analizë për balancë tonale, volum, dhe dinamikë — matur para se të prekët gjë.",
  },
  "features.f2.eyebrow": { en: "Workflow", sq: "Rrjedha e Punës" },
  "features.f2.title": { en: "Pro Presets", sq: "Presete Profesionale" },
  "features.f2.body": {
    en: "21 curated mixing presets plus editable JSON chains for repeatable release consistency across a whole catalog.",
    sq: "21 presete miksimi të kuruara plus zinxhirë JSON të modifikueshëm për konsistencë të përsëritshme botimi në të gjithë katalogun.",
  },
  "features.f3.eyebrow": { en: "Control", sq: "Kontroll" },
  "features.f3.title": { en: "Instant A/B", sq: "A/B Menjëherë" },
  "features.f3.body": {
    en: "Compare original and mastered output instantly, with playback levels gain-matched so loudness alone never wins the comparison.",
    sq: "Krahaso menjëherë origjinalin me rezultatin e masterizuar, me nivele të përputhura që volumi vetëm të mos e fitojë krahasimin.",
  },
  "features.f4.eyebrow": { en: "Identity", sq: "Identitet" },
  "features.f4.title": { en: "Saved Artist Masters", sq: "Masterë Artistësh të Ruajtur" },
  "features.f4.body": {
    en: "Import a full mastering chain for an artist once, then apply it to every new track from a dropdown — private to your account.",
    sq: "Importo një zinxhir të plotë masterizimi për një artist një herë, pastaj aplikoje në çdo këngë të re nga një menu — privat për llogarinë tënde.",
  },
  "features.f5.eyebrow": { en: "Delivery", sq: "Dërgesa" },
  "features.f5.title": { en: "Codec Preview", sq: "Parapamje Kodeku" },
  "features.f5.body": {
    en: "Hear what actually reaches a listener after MP3, AAC, or Opus compression — a real encode/decode round-trip, not an estimate.",
    sq: "Dëgjo çfarë arrin realisht te dëgjuesi pas kompresimit MP3, AAC, ose Opus — një cikël real kodimi/dekodimi, jo një vlerësim.",
  },
  "features.f6.eyebrow": { en: "Separation", sq: "Ndarje" },
  "features.f6.title": { en: "Stem-Aware Mastering", sq: "Masterizim me Ndarje Instrumentesh" },
  "features.f6.body": {
    en: "Optionally split vocals, drums, bass, and other elements for independent, more targeted processing before the final mix-down.",
    sq: "Opsionalisht ndaj vokalet, daullet, basin, dhe elementë të tjerë për përpunim të pavarur dhe më të synuar para përzierjes finale.",
  },

  "howTo.eyebrow": { en: "How It Works", sq: "Si Funksionon" },
  "howTo.title": { en: "From raw mix to final master", sq: "Nga miksimi bruto te masteri final" },
  "howTo.subtitle": {
    en: "Five steps, most of it automatic. You stay in control of the parts that matter.",
    sq: "Pesë hapa, shumica automatikë. Ti mbetesh në kontroll të pjesëve që kanë rëndësi.",
  },
  "howTo.s1.title": { en: "Create an account", sq: "Krijo një llogari" },
  "howTo.s1.body": {
    en: "Sign up with email or Google. Every render and every saved artist preset is private to your account.",
    sq: "Regjistrohu me email ose Google. Çdo renderim dhe çdo preset artisti i ruajtur është privat për llogarinë tënde.",
  },
  "howTo.s2.title": { en: "Upload your track", sq: "Ngarko këngën" },
  "howTo.s2.body": {
    en: "Drop in your mix, plus an optional reference track if you want spectral balance matched against something specific.",
    sq: "Ngarko miksimin tënd, plus opsionalisht një këngë referimi nëse do balancë spektrale të përputhur me diçka specifike.",
  },
  "howTo.s3.title": { en: "Choose a profile", sq: "Zgjidh një profil" },
  "howTo.s3.body": {
    en: "Pick a genre and style, fine-tune with tags, or select a saved artist master from the dropdown to apply it exactly as written.",
    sq: "Zgjidh një zhanër dhe stil, rregullo me etiketa, ose zgjidh një master artisti të ruajtur nga menuja për ta aplikuar saktësisht siç është shkruar.",
  },
  "howTo.s4.title": { en: "Let the engine process", sq: "Lëre motorin të përpunojë" },
  "howTo.s4.body": {
    en: "The engine measures loudness, tonal balance, dynamics, and stereo width, then applies EQ, compression, saturation, and true-peak-safe limiting.",
    sq: "Motori mat volumin, balancën tonale, dinamikën, dhe gjerësinë stereo, më pas aplikon EQ, kompresim, saturim, dhe kufizim të sigurt në true-peak.",
  },
  "howTo.s5.title": { en: "Compare, preview, download", sq: "Krahaso, dëgjo paraprakisht, shkarko" },
  "howTo.s5.body": {
    en: "A/B the original against the master, preview how it'll sound after streaming-codec compression, then download the final file.",
    sq: "Krahaso origjinalin me masterin, dëgjo paraprakisht si do të tingëllojë pas kompresimit të kodekut, dhe shkarko skedarin final.",
  },

  "faq.eyebrow": { en: "FAQ", sq: "Pyetje të Shpeshta" },
  "faq.title": { en: "Frequently asked questions", sq: "Pyetjet më të shpeshta" },
  "faq.q1": { en: "What file formats are supported?", sq: "Cilat formate skedarësh mbështeten?" },
  "faq.a1": {
    en: "Common audio formats (WAV, MP3, FLAC, AIFF, and more) are accepted on upload and decoded automatically before processing. Final export is WAV or MP3.",
    sq: "Formate të zakonshme audio (WAV, MP3, FLAC, AIFF, e më shumë) pranohen në ngarkim dhe dekodohen automatikisht para përpunimit. Eksportimi final është WAV ose MP3.",
  },
  "faq.q2": { en: "What's the difference between Standard and Professional?", sq: "Cili është ndryshimi midis Standard dhe Professional?" },
  "faq.a2": {
    en: "Standard applies fast, safe adaptive mastering — 3 full-length renders a month are free. Professional adds oversampled true-peak limiting, finer dynamic EQ, and tempo-aware compression timing for release-grade results, unlocked (along with a much higher monthly limit) on the Studio plan or higher. Free previews use the Standard engine.",
    sq: "Standard aplikon masterizim adaptiv të shpejtë dhe të sigurt — 3 renderë të plotë në muaj janë falas. Professional shton kufizim true-peak me oversampling, EQ dinamik më të hollësishëm, dhe kohëzgjatje kompresimi të ndjeshme ndaj tempos, i zhbllokuar (bashkë me një limit mujor shumë më të lartë) me planin Studio ose më lart. Parapamjet falas përdorin motorin Standard.",
  },
  "faq.q3": { en: "Can I save an artist's exact mastering chain?", sq: "Mund ta ruaj zinxhirin e saktë të masterizimit të një artisti?" },
  "faq.a3": {
    en: "Yes — import a full preset JSON under Saved Artists (genre, style, and a processing spec), and apply it to any future track from a dropdown, run exactly as written. It's private to your account.",
    sq: "Po — importo një JSON preseti të plotë tek Saved Artists (zhanri, stili, dhe një specifikim përpunimi), dhe aplikoje në çdo këngë të ardhshme nga një menu, ekzekutuar saktësisht siç është shkruar. Është privat për llogarinë tënde.",
  },
  "faq.q4": { en: "Why does my mono source sound mono after mastering?", sq: "Pse burimi mono tingëllon mono edhe pas masterizimit?" },
  "faq.a4": {
    en: "If the uploaded file itself is mono (or near-mono), the output is mathematically mono too — mastering doesn't fabricate stereo information that was never there. The app detects and flags this so it's never a surprise.",
    sq: "Nëse skedari i ngarkuar është vetë mono (ose pothuajse mono), edhe rezultati është matematikisht mono — masterizimi nuk shpik informacion stereo që s'ka ekzistuar kurrë. Aplikacioni e zbulon dhe e sinjalizon këtë.",
  },
  "faq.q5": { en: "Is stem separation available?", sq: "A ofrohet ndarja e instrumenteve (stems)?" },
  "faq.a5": {
    en: "Yes — enable stem-aware processing to master vocals, drums, bass, and other elements with independent, more targeted control. It's included free with the Studio plan or higher — not available on Free.",
    sq: "Po — aktivizo përpunimin me ndarje instrumentesh për të masterizuar vokalet, daullet, basin, dhe elementë të tjerë me kontroll të pavarur. Është e përfshirë falas me planin Studio ose më lart — nuk ofrohet në planin Free.",
  },
  "faq.q6": { en: "Can I hear how it'll sound on Spotify or Instagram before downloading?", sq: "Mund të dëgjoj si do tingëllojë në Spotify apo Instagram para se ta shkarkoj?" },
  "faq.a6": {
    en: "Yes — Codec Preview runs a real MP3/AAC/Opus encode-decode round-trip on your mastered file and reports the true-peak, loudness, and high-frequency changes it caused.",
    sq: "Po — Codec Preview kryen një cikël real kodimi/dekodimi MP3/AAC/Opus mbi skedarin tënd të masterizuar dhe raporton ndryshimet në true-peak, volum, dhe frekuenca të larta.",
  },
  "faq.q7": { en: "Is my music private?", sq: "A janë private këngët e mia?" },
  "faq.a7": {
    en: "Every route except the public landing page requires a signed-in account, and Saved Artist presets are stored per-user — no one else using the app sees your uploads or your artist chains.",
    sq: "Çdo rrugë përveç faqes publike kërkon një llogari të kyçur, dhe presetet e Saved Artists ruhen për çdo përdorues veç e veç — askush tjetër që përdor aplikacionin nuk sheh ngarkimet a zinxhirët e tu.",
  },
  "faq.q8": { en: "What's actually free?", sq: "Çfarë është vërtet falas?" },
  // Numbers interpolated from lib/pricing.js (not hand-typed) — this
  // exact string went stale twice already after pricing changes before
  // this fix (once missing the free-trial-not-monthly correction, once
  // missing Chords Monthly entirely on a different page). Deriving from
  // the same source PLANS/pricing cards read means a price change here
  // is now structurally impossible to forget.
  "faq.a8": {
    en: `30-second mastering previews (unlimited, Standard engine) and 3 full-length masters total, free — a one-time trial, not renewed monthly. After that, single masters are ${SINGLE_MASTER.price} each, or subscribe: ${PLANS.studio.label} (${PLANS.studio.price}${PLANS.studio.period}) gives ${PLANS.studio.masterLimit}/month (resets monthly) and adds Professional mastering and stem separation. ${PLANS.pro.label} (${PLANS.pro.price}${PLANS.pro.period}) gives ${PLANS.pro.masterLimit}/month and adds unlimited chord detection.`,
    sq: `Parapamje masterizimi 30-sekondëshe (të pakufizuara, motori Standard) dhe 3 masterë të plotë gjithsej, falas — një provë një-herëshe, nuk rinovohet çdo muaj. Pas kësaj, çdo master i vetëm kushton ${SINGLE_MASTER.price}, ose abonohu: ${PLANS.studio.label} (${PLANS.studio.price}${PLANS.studio.period.replace("/mo", "/muaj")}) jep ${PLANS.studio.masterLimit}/muaj (rinovohet çdo muaj) dhe shton masterizimin Professional e ndarjen e instrumenteve. ${PLANS.pro.label} (${PLANS.pro.price}${PLANS.pro.period.replace("/mo", "/muaj")}) jep ${PLANS.pro.masterLimit}/muaj dhe shton zbulim të pakufizuar akordesh.`,
  },

  "contact.eyebrow": { en: "Contact", sq: "Kontakt" },
  "contact.title": { en: "Questions or studio inquiries", sq: "Pyetje ose kërkesa nga studio" },
  "contact.body": {
    en: "Reach out for onboarding a studio, custom preset design, or anything else — we read every message.",
    sq: "Na kontakto për të regjistruar një studio, dizajn presetesh me porosi, ose çdo gjë tjetër — lexojmë çdo mesazh.",
  },
  "contact.emailLabel": { en: "Email", sq: "Email" },

  "footer.tagline": { en: "Professional mastering software with a real DSP engine.", sq: "Program masterizimi profesional me DSP engine." },
  "footer.rights": { en: "All rights reserved.", sq: "Të gjitha të drejtat e rezervuara." },

  "login.brand": { en: "Auralith Forge", sq: "Auralith Forge" },
  "login.back": { en: "Back to home", sq: "Kthehu te kryefaqja" },
  "login.signin": { en: "Sign in", sq: "Hyr" },
  "login.signup": { en: "Create an account", sq: "Krijo një llogari" },
  "login.email": { en: "Email", sq: "Email" },
  "login.password": { en: "Password", sq: "Fjalëkalimi" },
  "login.submitSignin": { en: "Sign in", sq: "Hyr" },
  "login.submitSignup": { en: "Create account", sq: "Krijo llogari" },
  "login.working": { en: "Working…", sq: "Duke punuar…" },
  "login.or": { en: "or", sq: "ose" },
  "login.google": { en: "Continue with Google", sq: "Vazhdo me Google" },
  "login.toSignin": { en: "Already have an account? Sign in", sq: "Ke tashmë një llogari? Hyr" },
  "login.toSignup": { en: "No account yet? Create one", sq: "S'ke llogari ende? Krijo një" },
  "login.firstName": { en: "First name", sq: "Emri" },
  "login.lastName": { en: "Last name", sq: "Mbiemri" },
  "login.phone": { en: "Phone number", sq: "Numri i telefonit" },
  "login.termsPrefix": { en: "I agree to the", sq: "Pajtohem me" },
  "login.termsLink": { en: "Terms & Conditions", sq: "Kushtet e Përdorimit" },
  "login.termsAnd": { en: "and", sq: "dhe" },
  "login.privacyLink": { en: "Privacy Policy", sq: "Politikën e Privatësisë" },

  "footer.legal.terms": { en: "Terms & Conditions", sq: "Kushtet e Përdorimit" },
  "footer.legal.privacy": { en: "Privacy Policy", sq: "Politika e Privatësisë" },
  "footer.legal.refund": { en: "Refund Policy", sq: "Politika e Rimbursimit" },

  "gallery.eyebrow": { en: "Inside the Session", sq: "Brenda Seancës" },
  "gallery.title": { en: "Real desks, real signal chains", sq: "Tavolina reale, zinxhirë sinjali realë" },
  "gallery.img1.caption": { en: "Every render runs through a real DSP chain", sq: "Çdo renderim kalon në një zinxhir real DSP" },
  "gallery.img2.caption": { en: "Fader-level control, automated", sq: "Kontroll në nivel fader-i, i automatizuar" },
  "gallery.img3.caption": { en: "Built for people who mix for a living", sq: "Ndërtuar për njerëz që miksojnë për jetesë" },

  "pricing.eyebrow": { en: "Pricing", sq: "Çmimet" },
  "pricing.title": { en: "Three plans. No confusing add-ons.", sq: "Tre plane. Pa shtesa konfuze." },
  "pricing.subtitle": {
    en: "Start free with 3 full masters a month. Upgrade only when you actually need more.",
    sq: "Fillo falas me 3 masterë të plotë në muaj. Përmirëso vetëm kur të nevojitet më shumë.",
  },
  "pricing.badge": { en: "Best Value", sq: "Vlera më e Mirë" },
  "pricing.freeCta": { en: "Start Free", sq: "Fillo Falas" },
  "pricing.subCta": { en: "Get Started", sq: "Fillo Tani" },
  "pricing.subReassurance": { en: "Cancel anytime, no questions asked.", sq: "Anulo kur të duash, pa pyetje." },
  "pricing.compareLink": { en: "Comparing tools? See how this stacks up against LANDR & eMastered →", sq: "Po krahason mjete? Shiko si krahasohet me LANDR & eMastered →" },

  "app.tab.master": { en: "Master Audio", sq: "Masterizo Audio" },
  "app.tab.chords": { en: "Show Chords", sq: "Shfaq Akordet" },
  "app.tab.myMasters": { en: "My Masters", sq: "Masterat e Mia" },
  "app.tab.help": { en: "Help & Support", sq: "Ndihmë & Asistencë" },
  "app.tab.settings": { en: "Settings", sq: "Cilësimet" },
  "app.signout": { en: "Sign out", sq: "Dil" },
};

const LanguageContext = createContext({ lang: "en", setLang: () => {}, t: (key) => key });

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState("en");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("lang") : null;
    if (stored === "en" || stored === "sq") {
      setLangState(stored);
    }
  }, []);

  const setLang = useCallback((next) => {
    setLangState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("lang", next);
    }
  }, []);

  const t = useCallback((key) => DICT[key]?.[lang] || DICT[key]?.en || key, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
