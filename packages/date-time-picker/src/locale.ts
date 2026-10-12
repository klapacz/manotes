interface LocaleInfo extends Intl.Locale {
  getWeekInfo?: () => { firstDay: number };
  weekInfo?: { firstDay: number };
  getTextInfo?: () => { direction: string };
  textInfo?: { direction: string };
}

export function firstWeekday(locale: string): number {
  const info: LocaleInfo = new Intl.Locale(locale);

  return (info.getWeekInfo?.() ?? info.weekInfo)?.firstDay ?? 1;
}

export function isRTL(locale: string): boolean {
  const info: LocaleInfo = new Intl.Locale(locale);

  return (info.getTextInfo?.() ?? info.textInfo)?.direction === "rtl";
}
