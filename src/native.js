// Where is DoseLoop running? (website, installed PWA, or the Android app built with Capacitor)
export const isNativeApp = () => !!window.Capacitor?.isNativePlatform?.()

export function platform() {
  if (isNativeApp()) return 'app'
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
  return 'desktop'
}

// Latest Android build, published by .github/workflows/android.yml on every push to main
export const APK_URL = 'https://github.com/safafibm-ops/DoseLoop/releases/download/apk-latest/DoseLoop.apk'
