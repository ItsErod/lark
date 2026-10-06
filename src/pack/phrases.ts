export type Lang = "en" | "es" | "fr" | "de" | "ja";

export interface Phrase {
  en: string;
  es: string;
  fr: string;
  de: string;
  ja: string;
}

export const PHRASES: Phrase[] = [
  { en: "good morning", es: "buenos días", fr: "bonjour", de: "guten Morgen", ja: "おはよう" },
  { en: "good night", es: "buenas noches", fr: "bonne nuit", de: "gute Nacht", ja: "おやすみ" },
  { en: "thank you", es: "gracias", fr: "merci", de: "danke", ja: "ありがとう" },
  { en: "thanks", es: "gracias", fr: "merci", de: "danke", ja: "ありがとう" },
  { en: "sounds good", es: "suena bien", fr: "ça me va", de: "klingt gut", ja: "いいね" },
  { en: "looks good", es: "se ve bien", fr: "ça rend bien", de: "sieht gut aus", ja: "よさそう" },
  { en: "on my way", es: "voy en camino", fr: "j'arrive", de: "ich bin unterwegs", ja: "今向かってる" },
  { en: "be right back", es: "vuelvo enseguida", fr: "je reviens", de: "bin gleich zurück", ja: "すぐ戻る" },
  { en: "one moment", es: "un momento", fr: "un instant", de: "einen Moment", ja: "少し待って" },
  { en: "see you tomorrow", es: "hasta mañana", fr: "à demain", de: "bis morgen", ja: "また明日" },
  { en: "can you take a look", es: "¿puedes echar un vistazo?", fr: "tu peux jeter un œil ?", de: "kannst du mal schauen?", ja: "見てもらえる？" },
  { en: "I'll take a look", es: "le echo un vistazo", fr: "j'y jette un œil", de: "ich schau mal", ja: "見てみる" },
  { en: "shipped", es: "ya está publicado", fr: "c'est en ligne", de: "ist draußen", ja: "出した" },
  { en: "the build is green", es: "la build está en verde", fr: "le build est vert", de: "der Build ist grün", ja: "ビルドは成功" },
  { en: "hold on", es: "espera", fr: "attends", de: "warte kurz", ja: "待って" },
  { en: "yes", es: "sí", fr: "oui", de: "ja", ja: "はい" },
  { en: "no", es: "no", fr: "non", de: "nein", ja: "いいえ" },
  { en: "please", es: "por favor", fr: "s'il te plaît", de: "bitte", ja: "お願い" },
  { en: "sorry", es: "perdón", fr: "désolé", de: "entschuldigung", ja: "ごめん" },
  { en: "welcome", es: "bienvenido", fr: "bienvenue", de: "willkommen", ja: "ようこそ" },
  {
    en: "I'll take the type ramp after lunch.",
    es: "Me ocupo de la escala tipográfica después de comer.",
    fr: "Je prends la rampe de corps après le déjeuner.",
    de: "Ich nehme die Schriftstufe nach dem Mittagessen.",
    ja: "昼のあとでタイプランプをやる。",
  },
  {
    en: "Shipping the compact density after this pass. Reactions welcome.",
    es: "Publico la densidad compacta después de esta pasada. Las reacciones son bienvenidas.",
    fr: "J'envoie la densité compacte après cette passe. Les réactions sont les bienvenues.",
    de: "Die kompakte Dichte kommt nach diesem Durchgang. Reaktionen willkommen.",
    ja: "このパスのあとでコンパクト密度を出す。リアクション歓迎。",
  },
  {
    en: "Rate limit headers are in. A 429 now waits instead of retrying in a tight loop.",
    es: "Las cabeceras de límite ya están. Un 429 ahora espera en vez de reintentar en bucle.",
    fr: "Les en-têtes de limite sont là. Un 429 attend au lieu de réessayer en boucle.",
    de: "Die Limit-Header sind drin. Eine 429 wartet jetzt, statt in einer engen Schleife zu wiederholen.",
    ja: "レート制限のヘッダーは入った。429は短いループで再試行せず待つ。",
  },
  {
    en: "Plugins are local files. They can highlight or hide a message. They never see the token.",
    es: "Los plugins son archivos locales. Pueden resaltar u ocultar un mensaje. Nunca ven el token.",
    fr: "Les plugins sont des fichiers locaux. Ils peuvent surligner ou masquer un message. Ils ne voient jamais le jeton.",
    de: "Plugins sind lokale Dateien. Sie können eine Nachricht hervorheben oder verstecken. Sie sehen das Token nie.",
    ja: "プラグインはローカルファイル。メッセージを強調するか隠せる。トークンは見ない。",
  },
];
