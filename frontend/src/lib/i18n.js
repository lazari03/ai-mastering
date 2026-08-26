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
  "footer.newsletter.title": { en: "Get 10% off", sq: "Merr 10% zbritje" },
  "footer.newsletter.body": {
    en: "Join the newsletter — occasional updates, no spam, unsubscribe any time.",
    sq: "Bashkohu në newsletter — përditësime të rralla, pa spam, çregjistrohu kur të duash.",
  },
  "footer.col.freeTools": { en: "Free Tools", sq: "Mjete Falas" },
  "footer.col.compare": { en: "Compare", sq: "Krahaso" },
  "footer.col.company": { en: "Company", sq: "Kompania" },
  "footer.link.chordDetector": { en: "Chord Detector", sq: "Zbulues Akordesh" },
  "footer.link.songKeyFinder": { en: "Song Key Finder", sq: "Gjetës Tonaliteti" },
  "footer.link.bpmFinder": { en: "BPM Finder", sq: "Gjetës BPM" },
  "footer.link.chordProgressionFinder": { en: "Chord Progression Finder", sq: "Gjetës Progresioni Akordesh" },
  "footer.link.aiMasteringOnline": { en: "AI Mastering Online", sq: "Masterizim AI Online" },
  "footer.link.loudnessTargets": { en: "Loudness Targets by Genre", sq: "Objektivat e Zërit sipas Zhanrit" },
  "footer.link.vsLandr": { en: "vs LANDR", sq: "vs LANDR" },
  "footer.link.vsEmastered": { en: "vs eMastered", sq: "vs eMastered" },

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

  "newsletter.subscribed.title": { en: "You're on the list.", sq: "Je regjistruar." },
  "newsletter.subscribed.withCode": {
    en: "Here's your 10% off code — use it at checkout, any time.",
    sq: "Ja kodi yt 10% zbritje — përdore në checkout, kur të duash.",
  },
  "newsletter.subscribed.pending": { en: "Your discount code is on its way.", sq: "Kodi yt i zbritjes po vjen." },
  "newsletter.copy": { en: "Copy", sq: "Kopjo" },
  "newsletter.copied": { en: "Copied", sq: "U kopjua" },
  "newsletter.emailPlaceholder": { en: "you@email.com", sq: "ti@email.com" },
  "newsletter.submit": { en: "Get 10% Off", sq: "Merr 10% Zbritje" },
  "newsletter.submitting": { en: "…", sq: "…" },
  "newsletter.error": { en: "Couldn't subscribe — try again.", sq: "Regjistrimi dështoi — provo përsëri." },

  "newsletterPage.title": { en: "Get 10% off your first master", sq: "Merr 10% zbritje në masterin e parë" },
  "newsletterPage.body": {
    en: "Join the newsletter for occasional product updates and a discount code you can use right away. No spam, unsubscribe any time.",
    sq: "Bashkohu në newsletter për përditësime të rralla dhe një kod zbritjeje që mund ta përdorësh menjëherë. Pa spam, çregjistrohu kur të duash.",
  },
  "newsletterPage.back": { en: "← Back to the app", sq: "← Kthehu te aplikacioni" },

  "demoPlayer.before": { en: "Before", sq: "Para" },
  "demoPlayer.after": { en: "After — Mastered", sq: "Pas — Masterizuar" },

  "myMasters.title": { en: "My Masters", sq: "Masterat e Mia" },
  "myMasters.subtitle": {
    en: "Your last 25 renders. Files are removed 48 hours after creation — download what you need before then.",
    sq: "25 renderimet e fundit. Skedarët fshihen 48 orë pas krijimit — shkarko çfarë të duhet para kësaj.",
  },
  "myMasters.loadFailed": { en: "Failed to load history", sq: "Dështoi ngarkimi i historikut" },
  "myMasters.deleteFailed": { en: "Failed to delete", sq: "Fshirja dështoi" },
  "myMasters.shareFailed": { en: "Failed to create share link", sq: "Krijimi i lidhjes së ndarjes dështoi" },
  "myMasters.downloadFailed": { en: "Download failed", sq: "Shkarkimi dështoi" },
  "myMasters.empty": { en: "No renders yet — master a track to see it here.", sq: "Ende pa renderime — masterizo një këngë për ta parë këtu." },
  "myMasters.filter.active": { en: "Active", sq: "Aktive" },
  "myMasters.filter.expired": { en: "Expired", sq: "Skaduar" },
  "myMasters.filter.all": { en: "All", sq: "Të gjitha" },
  "myMasters.emptyExpired": { en: "Nothing expired yet.", sq: "Ende asgjë e skaduar." },
  "myMasters.emptyActive": { en: "Nothing active — everything here has expired.", sq: "Asgjë aktive — gjithçka këtu ka skaduar." },
  "myMasters.custom": { en: "custom", sq: "e personalizuar" },
  "myMasters.standard": { en: "standard", sq: "standarde" },
  "myMasters.expired": { en: "expired", sq: "skaduar" },
  "myMasters.minutesLeft": { en: "{n}m left", sq: "{n}m mbetur" },
  "myMasters.hoursLeft": { en: "{n}h left", sq: "{n}o mbetur" },
  "myMasters.download": { en: "Download", sq: "Shkarko" },
  "myMasters.share": { en: "Share", sq: "Ndaj" },
  "myMasters.shareAllAccess": { en: "All-Access", sq: "All-Access" },
  "myMasters.shareTitle": { en: "Share links are an All-Access feature", sq: "Lidhjet e ndarjes janë veçori e All-Access" },
  "myMasters.confirmDelete": { en: "Confirm delete", sq: "Konfirmo fshirjen" },
  "myMasters.deleting": { en: "Deleting…", sq: "Duke fshirë…" },
  "myMasters.cancel": { en: "Cancel", sq: "Anulo" },
  "myMasters.delete": { en: "Delete", sq: "Fshi" },
  "myMasters.shareLinkTitle": { en: "Share link — no sign-in needed", sq: "Lidhje ndarjeje — pa nevojë për hyrje" },
  "myMasters.shareLinkBody": {
    en: "Anyone with this link can play or download just this file. It stops working once the file expires",
    sq: "Kushdo me këtë lidhje mund ta luajë ose shkarkojë vetëm këtë skedar. Pushon së punuari kur skedari skadon",
  },
  "myMasters.shareLinkTail": {
    en: "— same as everything else here, nothing is stored longer than that.",
    sq: "— njësoj si gjithçka tjetër këtu, asgjë nuk ruhet më gjatë se kaq.",
  },
  "myMasters.copy": { en: "Copy", sq: "Kopjo" },
  "myMasters.copied": { en: "Copied", sq: "U kopjua" },
  "myMasters.pagePrev": { en: "Prev", sq: "Mbrapa" },
  "myMasters.pageNext": { en: "Next", sq: "Para" },
  "myMasters.pageOf": { en: "Page {page} of {count} · {total} total", sq: "Faqja {page} nga {count} · {total} gjithsej" },

  "billing.title": { en: "Billing", sq: "Faturimi" },
  "billing.current": { en: "Current", sq: "Aktual" },
  "billing.manage": { en: "Manage billing", sq: "Menaxho faturimin" },
  "billing.redirecting": { en: "Redirecting…", sq: "Duke ridrejtuar…" },
  "billing.updating": { en: "Updating…", sq: "Duke përditësuar…" },
  "billing.upgrade": { en: "Upgrade", sq: "Përmirëso" },
  "billing.switch": { en: "Switch", sq: "Ndrysho" },
  "billing.switchedTo": { en: "Switched to {plan} — charged the prorated difference now.", sq: "Kalove tek {plan} — u fature diferenca proporcionale tani." },
  "billing.scheduledTo": {
    en: "Scheduled: you'll move to {plan} at the start of your next billing period, no charge yet.",
    sq: "E planifikuar: do kalosh tek {plan} në fillim të periudhës tënde të radhës të faturimit, ende pa pagesë.",
  },
  "billing.checkoutFailed": { en: "Failed to start checkout.", sq: "Nisja e checkout dështoi." },
  "billing.portalFailed": { en: "Failed to open billing portal.", sq: "Hapja e portalit të faturimit dështoi." },
  "billing.mastersThisMonth": { en: "Masters this month", sq: "Masterë këtë muaj" },
  "billing.freeTrialMasters": { en: "Free trial masters", sq: "Masterë të provës falas" },
  "billing.leftOf": { en: "{remaining} of {limit} left", sq: "{remaining} nga {limit} mbetur" },
  "billing.resetsNextMonth": { en: "resets next month", sq: "rinovohet muajin tjetër" },
  "billing.oneTimeNoRenew": { en: "one-time, doesn't renew", sq: "një-herëshe, nuk rinovohet" },
  "billing.plusCreditsMaster": { en: "+{n} single-master credit{s} on top", sq: "+{n} kredit{s} master-i-vetëm shtesë" },
  "billing.buyOne": { en: "Buy one", sq: "Bli një" },
  "billing.noSubNote": { en: "No subscription — just this one track.", sq: "Pa abonim — vetëm kjo këngë." },
  "billing.chordDetection": { en: "Chord detection", sq: "Zbulim akordesh" },
  "billing.freeTrialChords": { en: "Free trial chord detections", sq: "Zbulime akordesh të provës falas" },
  "billing.unlimitedAllAccess": { en: "Unlimited on All-Access.", sq: "Të pakufizuara në All-Access." },
  "billing.unlimitedChordsMonthly": { en: "Unlimited on Chords Monthly.", sq: "Të pakufizuara në Chords Monthly." },
  "billing.plusCreditsChord": { en: "+{n} credit{s} on top", sq: "+{n} kredit{s} shtesë" },
  "billing.manageShort": { en: "Manage", sq: "Menaxho" },
  "billing.subscribe": { en: "Subscribe", sq: "Abonohu" },
  "billing.stemsThisMonth": { en: "Stem separations this month", sq: "Ndarje instrumentesh këtë muaj" },
  "billing.plusCreditsStem": { en: "+{n} extra credit{s} on top", sq: "+{n} kredit{s} shtesë" },
  "billing.stemNoteAllAccess": { en: "For when your monthly 20 run out — no need to wait for reset.", sq: "Për kur 20-shi mujor mbaron — pa pritur rinovimin." },
  "billing.stemNoteOther": { en: "Or get 20/month included on All-Access.", sq: "Ose merr 20/muaj të përfshira në All-Access." },

  "console.title": { en: "Master Audio", sq: "Masterizo Audio" },
  "console.subtitle": { en: "Choose audio → choose mastering mode → master → review.", sq: "Zgjidh audio → zgjidh mënyrën → masterizo → shqyrto." },
  "console.step.audio": { en: "Audio", sq: "Audio" },
  "console.step.mode": { en: "Mode", sq: "Mënyra" },
  "console.step.master": { en: "Master", sq: "Master" },
  "console.files": { en: "Files", sq: "Skedarë" },
  "console.audioFile": { en: "Audio File *", sq: "Skedar Audio *" },
  "console.referenceTrack": { en: "Reference Track (optional)", sq: "Këngë Referimi (opsionale)" },
  "console.referenceActive": {
    en: "Reference Mastering active — your master will be matched to this track's tonal balance automatically. Set up in the next step.",
    sq: "Masterizim me Referim aktiv — masteri yt do të përputhet automatikisht me balancën tonale të kësaj kënge. Rregulloje në hapin tjetër.",
  },
  "console.referenceHint": {
    en: "Add a reference track to switch into Reference Mastering — no manual setup needed, the engine matches its tone automatically.",
    sq: "Shto një këngë referimi për të kaluar në Masterizim me Referim — pa rregullim manual, motori përputhet automatikisht me tonin e saj.",
  },
  "console.referenceMastering": { en: "Reference Mastering", sq: "Masterizim me Referim" },
  "console.referenceIsActive": { en: "Reference Mastering is active.", sq: "Masterizimi me Referim është aktiv." },
  "console.referenceAnalyze": { en: "We analyze", sq: "Analizojmë" },
  "console.referenceBody2": {
    en: "and automatically shape your master's tonal balance to match it — no manual EQ, genre, or style selection needed.",
    sq: "dhe formësojmë automatikisht balancën tonale të masterit tënd për ta përputhur — pa EQ manual, zhanër, ose zgjedhje stili.",
  },
  "console.referenceBody3": {
    en: "Loudness and dynamics still use our standard mastering profile; only the tonal balance is matched to your reference.",
    sq: "Volumi dhe dinamika ende përdorin profilin tonë standard masterizimi; vetëm balanca tonale përputhet me referimin tënd.",
  },
  "console.switchManual": { en: "Switch to manual mastering", sq: "Kalo te masterizimi manual" },
  "console.stemSeparation": { en: "Stem separation", sq: "Ndarje instrumentesh" },
  "console.premium": { en: "Premium", sq: "Premium" },
  "console.stemUsedUp": { en: "Your 20/month are used up.", sq: "20-shi yt mujor ka mbaruar." },
  "console.stemIncluded": { en: "All-Access includes 20/month, or buy one here.", sq: "All-Access përfshin 20/muaj, ose bli një këtu." },
  "console.buyStemUsedUp": { en: "Buy one — your 20/month are used up", sq: "Bli një — 20-shi yt mujor ka mbaruar" },
  "console.buyStemPrice": { en: "Buy one — {price}", sq: "Bli një — {price}" },
  "console.redirecting": { en: "Redirecting…", sq: "Duke ridrejtuar…" },
  "console.masteringMode": { en: "Mastering Mode", sq: "Mënyra e Masterizimit" },
  "console.quickMaster": { en: "Quick Master", sq: "Master i Shpejtë" },
  "console.quickMasterBody": {
    en: "Automatic — pick a genre and style, the DSP engine sets everything else for you. Fastest path, no dials to touch.",
    sq: "Automatik — zgjidh një zhanër dhe stil, motori DSP rregullon gjithçka tjetër për ty. Rruga më e shpejtë, pa butona për të prekur.",
  },
  "console.proMaster": { en: "Pro Master", sq: "Master Pro" },
  "console.proMasterBody": {
    en: "Hands-on knobs for EQ, dynamics, multiband, saturation, stereo, and the limiter. Same engine, full control.",
    sq: "Kontroll i plotë për EQ, dinamikë, multiband, saturim, stereo, dhe limiter. I njëjti motor, kontroll i plotë.",
  },
  "console.profile": { en: "Profile", sq: "Profili" },
  "console.preset": { en: "Preset", sq: "Preset" },
  "console.custom": { en: "Custom", sq: "I Personalizuar" },
  "console.engine": { en: "Engine", sq: "Motori" },
  "console.standard": { en: "Standard", sq: "Standard" },
  "console.professionalOption": { en: "Professional (true-peak limiting)", sq: "Professional (kufizim true-peak)" },
  "console.studioPlanSuffix": { en: " — Studio plan", sq: " — plani Studio" },
  "console.needsStudio": { en: "Needs the Studio plan or higher.", sq: "Kërkon planin Studio ose më lart." },
  "console.genre": { en: "Genre", sq: "Zhanri" },
  "console.masteringStyle": { en: "Mastering Style", sq: "Stili i Masterizimit" },
  "console.masteringObjective": { en: "Mastering Objective", sq: "Objektivi i Masterizimit" },
  "console.masteringObjectiveHint": {
    en: "Optional — biases the mastering strategy toward a musical goal (Clean, Club, Punch, ...). The engine still decides how much correction your track actually needs.",
    sq: "Opsionale — e orienton strategjinë e masterizimit drejt një qëllimi muzikor (Clean, Club, Punch, ...). Motori vazhdon të vendosë sa korrigjim ka nevojë vërtet gjurma jote.",
  },
  "console.objectiveAuto": { en: "Auto", sq: "Auto" },
  "console.masteringObjectiveProHint": {
    en: "In Pro Master, picking an objective or tag seeds the manual knobs below with real computed values for this track — hand-tune from there. Doesn't re-apply until you change the selection again.",
    sq: "Në Pro Master, zgjedhja e një objektivi ose etikete i mbush butonat manualë më poshtë me vlera reale të llogaritura për këtë këngë — rregulloji me dorë nga ai pikënisje. Nuk ri-aplikohet derisa të ndryshosh sërish zgjedhjen.",
  },
  "console.tags": { en: "Tags", sq: "Etiketa" },
  "console.savedArtists": { en: "Saved Artists", sq: "Artistë të Ruajtur" },
  "console.savedArtistsBody": {
    en: "Pick a previously-imported artist master and it's applied exactly as saved. Private to your account.",
    sq: "Zgjidh një master artisti të importuar më parë dhe aplikohet saktësisht siç është ruajtur. Privat për llogarinë tënde.",
  },
  "console.chooseArtist": { en: "Choose an artist…", sq: "Zgjidh një artist…" },
  "console.noSavedArtists": { en: "No saved artists yet", sq: "Ende pa artistë të ruajtur" },
  "console.remove": { en: "Remove", sq: "Hiq" },
  "console.importPresetJson": { en: "Import Preset JSON", sq: "Importo Preset JSON" },
  "console.importPresetBody": {
    en: "Pick a JSON file, give it an artist name, and it's saved to your account and applied immediately — including full professional presets with an EQ/dynamics/limiter spec, which switch you into Pro mode with those exact values.",
    sq: "Zgjidh një skedar JSON, jepi një emër artisti, dhe ruhet në llogarinë tënde dhe aplikohet menjëherë — përfshirë presete të plota profesionale me specifikim EQ/dinamikë/limiter, që të kalojnë në mënyrën Pro me ato vlera të sakta.",
  },
  "console.getTemplate": { en: "Don't have a preset file? Get a template + how-to →", sq: "S'ke skedar preseti? Merr një shabllon + udhëzime →" },
  "console.artistNamePlaceholder": { en: "Artist name (e.g. The Weeknd)", sq: "Emri i artistit (p.sh. The Weeknd)" },
  "console.choosePresetFile": { en: "Choose preset JSON file…", sq: "Zgjidh skedarin JSON të presetit…" },
  "console.importing": { en: "Importing…", sq: "Duke importuar…" },
  "console.importSave": { en: "Import & Save Artist Master", sq: "Importo & Ruaj Masterin e Artistit" },
  "console.clear": { en: "Clear", sq: "Pastro" },
  "console.professionalControls": { en: "Professional Controls", sq: "Kontrolle Profesionale" },
  "console.master": { en: "Master", sq: "Master" },
  "console.fileLabel": { en: "File: {name}", sq: "Skedar: {name}" },
  "console.none": { en: "None", sq: "Asnjë" },
  "console.referenceLabel": { en: "Reference: {name}", sq: "Referim: {name}" },
  "console.modeLabel": { en: "Mode: {mode}", sq: "Mënyra: {mode}" },
  "console.pro": { en: "Pro", sq: "Pro" },
  "console.quick": { en: "Quick", sq: "Shpejtë" },
  "console.genreLabel": { en: "Genre: {genre}", sq: "Zhanri: {genre}" },
  "console.notSet": { en: "Not set", sq: "Pa vendosur" },
  "console.styleLabel": { en: "Style: {style}", sq: "Stili: {style}" },
  "console.engineLabel": { en: "Engine: {engine}", sq: "Motori: {engine}" },
  "console.stemsOn": { en: "Stems on", sq: "Ndarje aktive" },
  "console.rendering": { en: "Rendering…", sq: "Duke renderuar…" },
  "console.previewFree": { en: "Preview — Free", sq: "Parapamje — Falas" },
  "console.masteringEllipsis": { en: "Mastering…", sq: "Duke masterizuar…" },
  "console.masterTrackLeft": { en: "Master Track — {remaining}/{limit} left", sq: "Masterizo — {remaining}/{limit} mbetur" },
  "console.masterTrackCredit": { en: "Master Track — using 1 credit ({n} left)", sq: "Masterizo — duke përdorur 1 kredit ({n} mbetur)" },
  "console.masterTrackQuotaUsed": { en: "Master Track — Quota used, upgrade", sq: "Masterizo — Kuota u përdor, përmirëso" },
  "console.masterTrackDefault": { en: "Master Track", sq: "Masterizo" },
  "console.previewNote": {
    en: "Preview renders the first 30s with the Standard engine, free and unlimited. Master Track renders the full file — 3 total as a free trial (one-time, then €2.99/track or subscribe), 50/month on Studio, 250/month on All-Access. Full result and A/B comparison appear on the right once it's done.",
    sq: "Parapamja renderon 30 sekondat e para me motorin Standard, falas dhe e pakufizuar. Masterizo renderon skedarin e plotë — 3 gjithsej si provë falas (një-herëshe, pastaj €2.99/këngë ose abonim), 50/muaj në Studio, 250/muaj në All-Access. Rezultati i plotë dhe krahasimi A/B shfaqen djathtas kur të përfundojë.",
  },
  "console.outOfMastersMonth": { en: "Out of masters this month?", sq: "Mbaruan masterat për këtë muaj?" },
  "console.usedFreeMasters": { en: "Used up your 3 free masters?", sq: "Përdore 3 masterat e tu falas?" },
  "console.buySingleMaster": { en: "Buy a single master (€2.99, no subscription)", sq: "Bli një master të vetëm (€2.99, pa abonim)" },
  "console.orUpgrade": { en: "or upgrade in Settings → Billing.", sq: "ose përmirëso te Cilësimet → Faturimi." },
  "console.orSubscribe": { en: "or subscribe in Settings → Billing.", sq: "ose abonohu te Cilësimet → Faturimi." },
  "console.back": { en: "Back", sq: "Mbrapa" },
  "console.next": { en: "Next", sq: "Para" },
  "console.quickPreviewAnyStep": { en: "Quick Preview — Free (Any Step)", sq: "Parapamje e Shpejtë — Falas (Çdo Hap)" },
  "console.loadingCatalog": { en: "Loading catalog…", sq: "Duke ngarkuar katalogun…" },
  "console.reviewCompare": { en: "Review / Compare", sq: "Shqyrto / Krahaso" },
  "console.processing": { en: "Processing", sq: "Duke përpunuar" },
  "console.beforeLufs": { en: "Before LUFS", sq: "LUFS Para" },
  "console.afterLufs": { en: "After LUFS", sq: "LUFS Pas" },
  "console.abMatched": {
    en: "Playback levels matched for a fair A/B ({detail}) — loudness alone won't make one side sound better.",
    sq: "Nivelet e riprodhimit u përputhën për një A/B të drejtë ({detail}) — vetëm volumi s'do ta bëjë njërën anë të tingëllojë më mirë.",
  },
  "console.abOriginal": { en: "original {db} dB", sq: "origjinali {db} dB" },
  "console.abMastered": { en: "mastered {db} dB", sq: "masteri {db} dB" },
  "console.originalSignal": { en: "Original Signal", sq: "Sinjali Origjinal" },
  "console.masteredSignal": { en: "Mastered Signal", sq: "Sinjali i Masterizuar" },
  "console.downloading": { en: "Downloading…", sq: "Duke shkarkuar…" },
  "console.downloadMaster": { en: "Download Master", sq: "Shkarko Masterin" },
  "console.downloadFailed": { en: "Download failed", sq: "Shkarkimi dështoi" },
  "console.codecPreview": { en: "Codec Preview", sq: "Parapamje Kodeku" },
  "console.codecPreviewBody": {
    en: "Hear what actually reaches a listener after streaming compression — real encode/decode round-trip.",
    sq: "Dëgjo çfarë arrin realisht te dëgjuesi pas kompresimit të streaming-ut — cikël real kodimi/dekodimi.",
  },
  "console.encoding": { en: "Encoding…", sq: "Duke koduar…" },
  "console.preview": { en: "Preview", sq: "Parapamje" },
  "console.truePeakDelta": { en: "True Peak Δ", sq: "True Peak Δ" },
  "console.lufsDelta": { en: "LUFS Δ", sq: "LUFS Δ" },
  "console.highFreqDelta": { en: "High-Freq Δ", sq: "Frek. Lartë Δ" },
  "console.processingSummary": { en: "Processing Summary", sq: "Përmbledhje Përpunimi" },
  "console.emptyReview": {
    en: "Master a track to see before/after loudness, processing metadata, and instant A/B playback here.",
    sq: "Masterizo një këngë për të parë volumin para/pas, metadata e përpunimit, dhe riprodhim A/B të menjëhershëm këtu.",
  },
  "console.inputSignalPreview": { en: "Input Signal Preview", sq: "Parapamje e Sinjalit Hyrës" },
  "console.codecPreviewFailed": { en: "Codec preview failed", sq: "Parapamja e kodekut dështoi" },
  "console.phase.queue": { en: "Queueing mastering job", sq: "Duke radhitur punën e masterizimit" },
  "console.phase.read": { en: "Reading and validating source audio", sq: "Duke lexuar dhe vlerësuar audion burimore" },
  "console.phase.analyzeLoudness": { en: "Analyzing loudness and dynamics", sq: "Duke analizuar volumin dhe dinamikën" },
  "console.phase.estimateBalance": { en: "Estimating frequency balance", sq: "Duke vlerësuar balancën e frekuencave" },
  "console.phase.applyTone": { en: "Applying tone and spatial correction", sq: "Duke aplikuar korrigjim toni dhe hapësinor" },
  "console.phase.refine": { en: "Refining dynamics and loudness", sq: "Duke rafinuar dinamikën dhe volumin" },
  "console.phase.render": { en: "Rendering mastered output", sq: "Duke renderuar rezultatin e masterizuar" },
  "console.phase.prepare": { en: "Preparing preview and download", sq: "Duke përgatitur parapamjen dhe shkarkimin" },
  "console.masteringComplete": { en: "Mastering complete", sq: "Masterizimi përfundoi" },
  "console.masteringStopped": { en: "Mastering stopped", sq: "Masterizimi u ndal" },

  "adaptive.title": { en: "Adaptive Controls", sq: "Kontrolle Adaptive" },
  "adaptive.body": {
    en: "Live values for your current genre/style/tags selection against this file. Drag a knob, use arrow keys, or click the number to type an exact value.",
    sq: "Vlera në kohë reale për zgjedhjen aktuale të zhanrit/stilit/etiketave kundrejt këtij skedari. Tërhiq një çelës, përdor shigjetat, ose kliko numrin për të shkruar një vlerë të saktë.",
  },
  "adaptive.uploadHint": { en: "Upload a track to see real per-band values here.", sq: "Ngarko një këngë për të parë vlera reale për çdo brez këtu." },
  "adaptive.computing": { en: "Computing live values…", sq: "Duke llogaritur vlerat në kohë reale…" },
  "adaptive.targetLoudness": { en: "Target loudness", sq: "Volumi shënjestër" },
  "adaptive.dynamicRange": { en: "Dynamic range", sq: "Diapazoni dinamik" },
  "adaptive.stereoWidth": { en: "Stereo width", sq: "Gjerësia stereo" },
  "adaptive.tweak.lowEnd": { en: "Low End", sq: "Bas i Thellë" },
  "adaptive.tweak.punch": { en: "Punch", sq: "Goditje" },
  "adaptive.tweak.presence": { en: "Presence", sq: "Prezencë" },
  "adaptive.tweak.brightness": { en: "Brightness", sq: "Ndriçim" },
  "adaptive.tweak.warmth": { en: "Warmth", sq: "Ngrohtësi" },
  "adaptive.tweak.width": { en: "Width", sq: "Gjerësi" },
  "adaptive.tweak.loudness": { en: "Loudness", sq: "Volum" },
  "adaptive.band.sub": { en: "Sub", sq: "Sub" },
  "adaptive.band.bass": { en: "Bass", sq: "Bas" },
  "adaptive.band.lowMid": { en: "Low Mid", sq: "Mes-Ulët" },
  "adaptive.band.mid": { en: "Mid", sq: "Mes" },
  "adaptive.band.highMid": { en: "High Mid", sq: "Mes-Lartë" },
  "adaptive.band.presence": { en: "Presence", sq: "Prezencë" },
  "adaptive.band.air": { en: "Air", sq: "Ajër" },

  "result.eyebrow": { en: "Master complete", sq: "Masterizimi përfundoi" },
  "result.title": { en: "Your master is ready", sq: "Masteri yt është gati" },
  "result.before": { en: "Before", sq: "Para" },
  "result.after": { en: "After", sq: "Pas" },
  "result.masterAnother": { en: "Master Another Track", sq: "Masterizo një Gjurmë Tjetër" },
  "result.viewAllMasters": { en: "View All My Masters", sq: "Shiko të Gjitha Masterat e Mia" },
  "result.detailsHeading": { en: "What changed", sq: "Çfarë ndryshoi" },

  "help.title": { en: "Help & Support", sq: "Ndihmë & Asistencë" },
  "help.subtitle": { en: "Answers to the things people actually get stuck on while using the app.", sq: "Përgjigje për gjërat ku njerëzit ngecin realisht duke përdorur aplikacionin." },
  "help.chatgptTitle": { en: "Create a custom artist preset with ChatGPT", sq: "Krijo një preset artisti të personalizuar me ChatGPT" },
  "help.chatgptBody": {
    en: "You don't have to set every knob by hand — describe the sound you want to an AI chat assistant and import what it gives you back.",
    sq: "Nuk duhet të rregullosh çdo buton me dorë — përshkruaji tingullin që do një asistent bisede AI dhe importo çfarë të kthen.",
  },
  "help.step1": { en: "Download the template JSON", sq: "Shkarko shabllonin JSON" },
  "help.step1tail": { en: "— this shows the exact shape the app expects.", sq: "— kjo tregon formën e saktë që pret aplikacioni." },
  "help.step2": {
    en: "Copy the master prompt below into ChatGPT (or any AI chat), and replace the last line with your own description of the sound you want (an artist reference, genre, how loud/warm/wide, etc).",
    sq: "Kopjo prompt-in kryesor më poshtë në ChatGPT (ose çdo bisedë AI), dhe zëvendëso rreshtin e fundit me përshkrimin tënd të tingullit që do (referim artisti, zhanër, sa i lartë/ngrohtë/gjerë, etj).",
  },
  "help.step3": { en: "Save what it gives you back as a", sq: "Ruaje çfarë të kthen si skedar" },
  "help.step3tail": { en: "file.", sq: "" },
  "help.step4pre": { en: "In", sq: "Te" },
  "help.step4path": { en: "Master Audio → Saved Artists → Import Preset JSON", sq: "Master Audio → Artistë të Ruajtur → Importo Preset JSON" },
  "help.step4tail": {
    en: ", give it an artist name and upload that file. It's saved to your account and ready to reuse on every future track.",
    sq: ", jepi një emër artisti dhe ngarko atë skedar. Ruhet në llogarinë tënde dhe gati për ripërdorim në çdo këngë të ardhshme.",
  },
  "help.masterPrompt": { en: "Master prompt", sq: "Prompt kryesor" },
  "help.copyPrompt": { en: "Copy prompt", sq: "Kopjo prompt-in" },
  "help.copied": { en: "Copied!", sq: "U kopjua!" },
  "help.stillStuck": { en: "Still stuck?", sq: "Ende i ngecur?" },
  "help.emailIntro": { en: "Email", sq: "Email" },
  "help.emailTail": {
    en: "— include your account email and, if it's about a specific render, roughly when you ran it.",
    sq: "— përfshi emailin e llogarisë tënde dhe, nëse ka të bëjë me një renderim specifik, përafërsisht kur e bëre.",
  },
  "help.guides": { en: "Mastering guides →", sq: "Udhëzues masterizimi →" },
  "help.terms": { en: "Terms & Conditions →", sq: "Kushtet e Përdorimit →" },
  "help.privacy": { en: "Privacy Policy →", sq: "Politika e Privatësisë →" },
  "help.refund": { en: "Refund Policy →", sq: "Politika e Rimbursimit →" },

  "help.topic1.q": { en: "My master sounds mono even though I have stereo speakers", sq: "Masteri im tingëllon mono edhe pse kam altoparlantë stereo" },
  "help.topic1.a": {
    en: "If the file you uploaded is itself mono (or near-mono), the output is mathematically mono too — mastering can't invent stereo information that was never in the source. The report panel flags this automatically after a render so it's never a silent surprise.",
    sq: "Nëse skedari që ngarkove është vetë mono (ose pothuajse mono), edhe rezultati është matematikisht mono — masterizimi nuk mund të shpikë informacion stereo që s'ka ekzistuar kurrë në burim. Paneli i raportit e sinjalizon këtë automatikisht pas një renderimi.",
  },
  "help.topic2.q": { en: "Where did my file go? I can't download it anymore.", sq: "Ku shkoi skedari im? S'mund ta shkarkoj më." },
  "help.topic2.a": {
    en: "Uploaded files, masters, and codec previews are automatically deleted 48 hours after you create them (see the Refund/Privacy policy) — this app doesn't offer long-term audio storage. Check My Masters for what's still inside the window, and download what you need before it expires.",
    sq: "Skedarët e ngarkuar, masterët, dhe parapamjet e kodekut fshihen automatikisht 48 orë pas krijimit (shiko politikën e Rimbursimit/Privatësisë) — ky aplikacion nuk ofron ruajtje afatgjatë audio. Kontrollo Masterat e Mia për çfarë është ende brenda afatit, dhe shkarko çfarë të duhet para se të skadojë.",
  },
  "help.topic3.q": { en: "What's the difference between Standard and Professional?", sq: "Cili është ndryshimi midis Standard dhe Professional?" },
  "help.topic3.a": {
    en: "Standard is the free, default engine. Professional adds oversampled true-peak limiting, finer dynamic EQ, and tempo-aware compression timing — pick it from the Engine dropdown when mastering.",
    sq: "Standard është motori falas, i parazgjedhur. Professional shton kufizim true-peak me oversampling, EQ dinamik më të hollësishëm, dhe kohëzgjatje kompresimi të ndjeshme ndaj tempos — zgjidhe nga menuja Engine gjatë masterizimit.",
  },
  "help.topic4.q": { en: "How do I reuse the same mastering chain for an artist's next release?", sq: "Si ta ripërdor të njëjtin zinxhir masterizimi për botimin tjetër të një artisti?" },
  "help.topic4.a": {
    en: "Import a full preset JSON under Saved Artists (in the Master Audio tab) once, then pick that artist from the dropdown on every future track — it's applied exactly as saved, and it's private to your account.",
    sq: "Importo një JSON preseti të plotë tek Artistë të Ruajtur (në tab-in Master Audio) një herë, pastaj zgjidh atë artist nga menuja në çdo këngë të ardhshme — aplikohet saktësisht siç është ruajtur, dhe është privat për llogarinë tënde.",
  },
  "help.topic5.q": { en: "A render has been stuck on \"Mastering…\" for a while", sq: "Një renderim ka ngecur te \"Duke masterizuar…\" për një kohë" },
  "help.topic5.a": {
    en: "Renders with stem separation enabled can take a minute or two — that's expected. If it's been much longer than that, refresh the page; the notification banner and My Masters tab will still show the result once it lands.",
    sq: "Renderimet me ndarje instrumentesh aktive mund të marrin një a dy minuta — kjo është normale. Nëse ka kaluar shumë më gjatë se kaq, rifresko faqen; banderola e njoftimit dhe tab-i Masterat e Mia do ta shfaqin rezultatin kur të mbërrijë.",
  },
  "help.topic6.q": { en: "Can I get my old mastered file back after it expired?", sq: "Mund ta marr sërish skedarin tim të vjetër të masterizuar pasi ka skaduar?" },
  "help.topic6.a": {
    en: "No — once a file passes the 48-hour retention window it's permanently gone from our servers, by design (see Privacy Policy). Re-upload the original and master it again.",
    sq: "Jo — sapo një skedar kalon afatin 48-orësh, fshihet përfundimisht nga serverët tanë, me dizajn (shiko Politikën e Privatësisë). Ngarko përsëri origjinalin dhe masterizoje sërish.",
  },

  "badge.masters": { en: "masters", sq: "masterë" },

  "cookie.body": {
    en: "We use local storage to keep you signed in and, if you allow it, privacy-friendly analytics with no tracking cookies. See our",
    sq: "Përdorim local storage për të të mbajtur të kyçur dhe, nëse e lejon, analitikë miqësore me privatësinë pa cookies gjurmimi. Shiko",
  },
  "cookie.privacyLink": { en: "Privacy Policy", sq: "Politikën e Privatësisë" },
  "cookie.decline": { en: "Decline", sq: "Refuzo" },
  "cookie.accept": { en: "Accept", sq: "Prano" },

  "notif.masterReady": { en: "Your master is ready", sq: "Masteri yt është gati" },
  "notif.inProgress": { en: "Mastering in progress…", sq: "Masterizimi në progres…" },
  "notif.takesAWhile": { en: "This can take a minute or two.", sq: "Kjo mund të marrë një a dy minuta." },
  "notif.failed": { en: "Mastering failed", sq: "Masterizimi dështoi" },
  "notif.viewResult": { en: "View result →", sq: "Shiko rezultatin →" },
  "notif.dismiss": { en: "Dismiss", sq: "Mbyll" },

  "chordsPanel.title": { en: "Show Chords", sq: "Shfaq Akordet" },
  "chordsPanel.subtitle": { en: "Detect BPM, key, and chords, then play along in sync.", sq: "Zbulo BPM, tonalitetin, dhe akordet, pastaj luaj në sinkron." },

  "chordDetector.analyzing": { en: "Analyzing…", sq: "Duke analizuar…" },
  "chordDetector.detect": { en: "Detect Chords", sq: "Zbulo Akordet" },
  "chordDetector.detectFreeLeft": { en: "Detect Chords — {remaining}/{limit} free left", sq: "Zbulo Akordet — {remaining}/{limit} falas mbetur" },
  "chordDetector.detectCredit": { en: "Detect Chords — using 1 credit ({n} left)", sq: "Zbulo Akordet — duke përdorur 1 kredit ({n} mbetur)" },
  "chordDetector.detectBuyUpgrade": { en: "Detect Chords — buy or upgrade", sq: "Zbulo Akordet — bli ose përmirëso" },
  "chordDetector.unlimitedPlan": { en: "Unlimited on your plan.", sq: "Të pakufizuara në planin tënd." },
  "chordDetector.freeTrialLeft": { en: "Free trial — {remaining} of {limit} left, one-time, doesn't renew.", sq: "Provë falas — {remaining} nga {limit} mbetur, një-herëshe, nuk rinovohet." },
  "chordDetector.creditsLeft": { en: "{n} purchased credit{s} left.", sq: "{n} kredit{s} të blerë mbetur." },
  "chordDetector.failed": { en: "Chord detection failed", sq: "Zbulimi i akordeve dështoi" },
  "chordDetector.checkoutFailed": { en: "Failed to start checkout.", sq: "Nisja e checkout dështoi." },
  "chordDetector.buyOne": { en: "Buy one ({price})", sq: "Bli një ({price})" },
  "chordDetector.redirecting": { en: "Redirecting…", sq: "Duke ridrejtuar…" },
  "chordDetector.unlimitedPrice": { en: "Unlimited — {price}/mo", sq: "Të pakufizuara — {price}/muaj" },
  "chordDetector.seeAllPlans": { en: "or see all plans", sq: "ose shiko të gjitha planet" },
  "chordDetector.key": { en: "Key", sq: "Tonaliteti" },
  "chordDetector.bpm": { en: "BPM", sq: "BPM" },
  "chordDetector.timeSig": { en: "Time Sig.", sq: "Metrika" },
  "chordDetector.estimatedNote": {
    en: "Estimated from the audio, not ground truth — a starting point for the key and chords, not a guaranteed-accurate transcription.",
    sq: "Vlerësuar nga audio, jo e vërteta absolute — një pikënisje për tonalitetin dhe akordet, jo një transkriptim i garantuar i saktë.",
  },
  "chordDetector.chordProgression": { en: "Chord Progression", sq: "Progresioni i Akordeve" },
  "chordDetector.masterThisSong": { en: "Master This Song →", sq: "Masterizo Këtë Këngë →" },
  "chordDetector.sameFileNote": { en: "Same file, no re-upload — jumps straight into the mastering console.", sq: "I njëjti skedar, pa ringarkim — kalon direkt te konsola e masterizimit." },
  "chordDetector.emptyWithFile": { en: "Detect BPM, key, and chords, then play along.", sq: "Zbulo BPM, tonalitetin, dhe akordet, pastaj luaj së bashku." },
  "chordDetector.emptyNoFile": { en: "Choose an audio file first.", sq: "Zgjidh një skedar audio së pari." },

  "onboarding.skip": { en: "Skip", sq: "Anashkalo" },
  "onboarding.back": { en: "Back", sq: "Mbrapa" },
  "onboarding.next": { en: "Next", sq: "Para" },
  "onboarding.getStarted": { en: "Get started", sq: "Fillo" },
  "onboarding.s0.title": { en: "Welcome to Auralith Forge", sq: "Mirë se erdhe në Auralith Forge" },
  "onboarding.s0.body": { en: "A quick tour of how mastering works here — four steps, less than a minute.", sq: "Një xhiro e shpejtë e si funksionon masterizimi këtu — katër hapa, më pak se një minutë." },
  "onboarding.s1.title": { en: "1. Choose your audio", sq: "1. Zgjidh audion tënde" },
  "onboarding.s1.body": {
    en: "Drop a track in Master Audio. Want to match a reference song's tone instead? Upload that too — Reference mode takes over automatically.",
    sq: "Ngarko një këngë te Master Audio. Do të përputhësh tonin e një kënge referimi? Ngarko edhe atë — mënyra Referim merr përsipër automatikisht.",
  },
  "onboarding.s2.title": { en: "2. Pick a mode", sq: "2. Zgjidh një mënyrë" },
  "onboarding.s2.body": {
    en: "Quick mode: pick a genre/style, the engine does the rest. Pro mode: hands-on control over EQ, compression, limiting. Saved Artists let you reuse an exact chain on future tracks.",
    sq: "Mënyra Shpejtë: zgjidh një zhanër/stil, motori bën pjesën tjetër. Mënyra Pro: kontroll i plotë mbi EQ, kompresim, limiting. Artistët e Ruajtur të lejojnë të ripërdorësh të njëjtin zinxhir në këngë të ardhshme.",
  },
  "onboarding.s3.title": { en: "3. Master it", sq: "3. Masterizoje" },
  "onboarding.s3.body": {
    en: "Hit Master. Real processing runs — this isn't a preview, so it can take a moment, longer if stem separation is on.",
    sq: "Shtyp Master. Përpunimi real fillon — nuk është parapamje, kështu që mund të marrë pak kohë, më gjatë nëse ndarja e instrumenteve është aktive.",
  },
  "onboarding.s4.title": { en: "4. Review & share", sq: "4. Shqyrto & ndaj" },
  "onboarding.s4.body": {
    en: "Finished masters land in My Masters — download, delete, or (on All-Access) generate a temporary share link. Files auto-expire after 48 hours, so grab what you need.",
    sq: "Masterat e përfunduar futen te Masterat e Mia — shkarko, fshi, ose (në All-Access) krijo një lidhje të përkohshme ndarjeje. Skedarët skadojnë automatikisht pas 48 orësh, kështu që merr çfarë të duhet.",
  },

  "settings.title": { en: "Settings", sq: "Cilësimet" },
  "settings.profile": { en: "Profile", sq: "Profili" },
  "settings.firstName": { en: "First name", sq: "Emri" },
  "settings.lastName": { en: "Last name", sq: "Mbiemri" },
  "settings.studioName": { en: "Studio name", sq: "Emri i studios" },
  "settings.optional": { en: "Optional", sq: "Opsionale" },
  "settings.phone": { en: "Phone number", sq: "Numri i telefonit" },
  "settings.saveProfile": { en: "Save profile", sq: "Ruaj profilin" },
  "settings.saving": { en: "Saving…", sq: "Duke ruajtur…" },
  "settings.saved": { en: "Saved.", sq: "U ruajt." },
  "settings.saveFailed": { en: "Failed to save.", sq: "Ruajtja dështoi." },
  "settings.changePassword": { en: "Change password", sq: "Ndrysho fjalëkalimin" },
  "settings.currentPassword": { en: "Current password", sq: "Fjalëkalimi aktual" },
  "settings.newPassword": { en: "New password", sq: "Fjalëkalimi i ri" },
  "settings.passwordUpdated": { en: "Password updated.", sq: "Fjalëkalimi u përditësua." },
  "settings.updating": { en: "Updating…", sq: "Duke përditësuar…" },
  "settings.updatePassword": { en: "Update password", sq: "Përditëso fjalëkalimin" },
  "settings.help": { en: "Help", sq: "Ndihmë" },
  "settings.wantRefresher": { en: "Want a refresher on how the app works?", sq: "Do një përsëritje se si funksionon aplikacioni?" },
  "settings.replayTutorial": { en: "Replay tutorial", sq: "Riluaj udhëzuesin" },
  "settings.sessions": { en: "Sessions", sq: "Sesionet" },
  "settings.sessionsBody": {
    en: "Signed-in sessions expire automatically after 14 days. If you signed in on a device you don't recognize, or just want to be sure, you can end every other signed-in session right now.",
    sq: "Sesionet e kyçura skadojnë automatikisht pas 14 ditësh. Nëse je kyçur në një pajisje që s'e njeh, ose thjesht do të jesh i sigurt, mund t'i mbyllësh të gjitha sesionet e tjera tani.",
  },
  "settings.signedOutRedirecting": { en: "Signed out everywhere. Redirecting…", sq: "U çkyçe kudo. Duke ridrejtuar…" },
  "settings.working": { en: "Working…", sq: "Duke punuar…" },
  "settings.signOutAllDevices": { en: "Sign out of all devices", sq: "Dil nga të gjitha pajisjet" },
  "settings.dangerZone": { en: "Danger zone", sq: "Zonë rreziku" },
  "settings.dangerBody": {
    en: "Permanently deletes your account, profile, Saved Artists, and render history. This can't be undone.",
    sq: "Fshin përgjithmonë llogarinë tënde, profilin, Artistët e Ruajtur, dhe historikun e renderimeve. Kjo s'mund të zhbëhet.",
  },
  "settings.deleteAccount": { en: "Delete account", sq: "Fshi llogarinë" },
  "settings.googleConfirm": { en: "You'll be asked to confirm with Google before this completes.", sq: "Do të kërkohet konfirmim me Google para se kjo të përfundojë." },
  "settings.typeDelete": { en: "Type DELETE to confirm", sq: "Shkruaj DELETE për të konfirmuar" },
  "settings.deleting": { en: "Deleting…", sq: "Duke fshirë…" },
  "settings.permanentlyDelete": { en: "Permanently delete my account", sq: "Fshi përgjithmonë llogarinë time" },
  "settings.cancel": { en: "Cancel", sq: "Anulo" },

  "app.menu": { en: "Menu", sq: "Menuja" },
  "app.closeMenu": { en: "Close menu", sq: "Mbyll menunë" },
  "app.collapseMenu": { en: "Collapse menu", sq: "Mbyll menunë" },
  "app.expandMenu": { en: "Expand menu", sq: "Hap menunë" },

  "thankYou.title": { en: "Thanks — you're all set", sq: "Faleminderit — je gati" },
  "thankYou.body": {
    en: "Your purchase went through. Whatever you bought — subscription, credits, or an add-on — is already active on your account.",
    sq: "Blerja jote kaloi me sukses. Çfarëdo që bleve — abonim, kredite, ose shtesë — është tashmë aktive në llogarinë tënde.",
  },
  "thankYou.backToApp": { en: "Back to the app", sq: "Kthehu te aplikacioni" },

  "shared.missingToken": { en: "This link is missing its access token.", sq: "Kësaj lidhjeje i mungon tokeni i qasjes." },
  "shared.invalidOrExpired": { en: "This link is invalid or has expired.", sq: "Kjo lidhje është e pavlefshme ose ka skaduar." },
  "shared.linkUnavailable": { en: "Link unavailable", sq: "Lidhja nuk ofrohet" },
  "shared.sharedMaster": { en: "Shared master", sq: "Master i ndarë" },
  "shared.downloading": { en: "Downloading…", sq: "Duke shkarkuar…" },
  "shared.download": { en: "Download", sq: "Shkarko" },
  "shared.downloadFailed": { en: "Download failed", sq: "Shkarkimi dështoi" },
  "shared.expiresIn": { en: "This link stops working in about {remaining}.", sq: "Kjo lidhje pushon së punuari për rreth {remaining}." },
  "shared.aboutToExpire": { en: "This link is about to expire.", sq: "Kjo lidhje është duke skaduar." },
  "shared.minutes": { en: "{n} minutes", sq: "{n} minuta" },
  "shared.hours": { en: "{n} hour{s}", sq: "{n} orë" },
  "shared.masterYourOwn": { en: "Master your own audio at Auralith Forge →", sq: "Masterizo audion tënde te Auralith Forge →" },

  "result.loadFailed": { en: "Couldn't load this master.", sq: "S'u ngarkua dot ky master." },
  "result.notFound": { en: "This master doesn't exist, or isn't yours.", sq: "Ky master nuk ekziston, ose nuk është yti." },
  "result.expiredTitle": { en: "This master has expired", sq: "Ky master ka skaduar" },
  "result.expiredBody": {
    en: "Files are removed 48 hours after creation. This one's metadata is still here, but the audio itself is gone — re-upload and master it again if you need it.",
    sq: "Skedarët fshihen 48 orë pas krijimit. Metadata e këtij ende është këtu, por vetë audio ka shkuar — ngarkoje përsëri dhe masterizoje sërish nëse të duhet.",
  },
  "result.backToMasters": { en: "Back to My Masters", sq: "Kthehu te Masterat e Mia" },
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

  // params is optional — a plain {name: value} map, substituted into
  // "{name}" tokens in the resolved string. Only a handful of strings
  // need this (pagination counts, etc.), so this stays a dumb string
  // replace rather than a real ICU/format library.
  const t = useCallback(
    (key, params) => {
      const raw = DICT[key]?.[lang] || DICT[key]?.en || key;
      if (!params) return raw;
      return Object.entries(params).reduce((acc, [name, value]) => acc.replaceAll(`{${name}}`, value), raw);
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
