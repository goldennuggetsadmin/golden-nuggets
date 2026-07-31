import { useFonts } from "expo-font";

/**
 * Loads the exact fonts used in the approved Golden Nuggets UI:
 * Instrument Serif (regular + italic) and Inter (400/500/600/700).
 * URLs are resolved via Google Fonts static CDN and pinned in-code
 * so the app boots offline of the CSS index.
 */
export function useAppFonts() {
  return useFonts({
    InstrumentSerif_400Regular: {
      uri: "https://fonts.gstatic.com/s/instrumentserif/v5/jizBRFtNs2ka5fXjeivQ4LroWlx-2zI.ttf",
    },
    InstrumentSerif_400Regular_Italic: {
      uri: "https://fonts.gstatic.com/s/instrumentserif/v5/jizHRFtNs2ka5fXjeivQ4LroWlx-6zATiw.ttf",
    },
    Inter_400Regular: {
      uri: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf",
    },
    Inter_500Medium: {
      uri: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fMZg.ttf",
    },
    Inter_600SemiBold: {
      uri: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZg.ttf",
    },
    Inter_700Bold: {
      uri: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf",
    },
  });
}
