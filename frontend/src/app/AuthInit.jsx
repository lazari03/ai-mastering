"use client";

import { useEffect } from "react";

import { useAuthStore } from "@/store/authStore";

// Subscribes to Firebase's auth state once, globally, for the whole app —
// mounted in the root layout so every page (including the public landing
// page) knows whether someone's signed in without each one re-subscribing.
// Renders nothing itself.
export default function AuthInit() {
  useEffect(() => {
    const unsubscribe = useAuthStore.getState().init();
    return unsubscribe;
  }, []);

  return null;
}
