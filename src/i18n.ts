/** Live UI language. English is the source string. Other catalogs override it. */

type PhraseRows = Record<string, readonly [string, string, string, string]>;

export type Catalog = Readonly<Record<string, string>>;

const fr: Catalog = {
  "About me": "À propos de moi",
  "Accept": "Accepter",
  "Active Now": "Actifs",
  "Activities": "Activités",
  "Add": "Ajouter",
  "Add Friend": "Ajouter un ami",
  "Add account": "Ajouter un compte",
  "Add to Favorites": "Ajouter aux favoris",
  "All events": "Tous les événements",
  "Apps": "Applications",
  "Back": "Retour",
  "Ban": "Bannir",
  "Block": "Bloquer",
  "Call": "Appel",
  "Camera": "Caméra",
  "Cancel": "Annuler",
  "Clear": "Effacer",
  "Close": "Fermer",
  "Close DM": "Fermer le message",
  "Connecting to Discord": "Connexion à Discord",
  "Copy": "Copier",
  "Copy ID": "Copier l’identifiant",
  "Copy link": "Copier le lien",
  "Create": "Créer",
  "Create Event": "Créer un événement",
  "Create My Own": "Créer le mien",
  "Create Thread": "Créer un fil",
  "Custom status": "Statut personnalisé",
  "Decline": "Refuser",
  "Delete": "Supprimer",
  "Delete this message?": "Supprimer ce message ?",
  "Direct messages": "Messages privés",
  "Discover": "Découvrir",
  "Dismiss": "Ignorer",
  "Done": "Terminé",
  "Edit Channel": "Modifier le salon",
  "Editing your message": "Modification du message",
  "Favorites": "Favoris",
  "Folder": "Dossier",
  "Friends": "Amis",
  "Go Live": "Passer en direct",
  "Ignore": "Ignorer",
  "Inbox": "Boîte de réception",
  "Join": "Rejoindre",
  "Join Voice": "Rejoindre le vocal",
  "Join a Server": "Rejoindre un serveur",
  "Kick": "Expulser",
  "Language": "Langue",
  "Language & Time": "Langue et heure",
  "Leave": "Quitter",
  "Loading…": "Chargement…",
  "Log Out": "Se déconnecter",
  "Mark All Read": "Tout marquer comme lu",
  "Mark As Read": "Marquer comme lu",
  "Members": "Membres",
  "Mentions": "Mentions",
  "Message": "Message",
  "Mod View": "Vue modération",
  "Mod view": "Vue modération",
  "More": "Plus",
  "Mute": "Mettre en sourdine",
  "New Group DM": "Nouveau groupe",
  "New messages": "Nouveaux messages",
  "Note": "Note",
  "Notification settings": "Notifications",
  "Open": "Ouvrir",
  "Pin": "Épingler",
  "Pin Channel": "Épingler le salon",
  "Pinned": "Épinglés",
  "Pins": "Épingles",
  "Profile": "Profil",
  "Remove": "Retirer",
  "Remove Bookmark": "Retirer le signet",
  "Remove from Favorites": "Retirer des favoris",
  "Remove Reminder": "Retirer le rappel",
  "Reply": "Répondre",
  "Roles": "Rôles",
  "Save": "Enregistrer",
  "Saved messages": "Messages enregistrés",
  "Search": "Rechercher",
  "Send": "Envoyer",
  "Send a message": "Envoyer un message",
  "Servers": "Serveurs",
  "Settings": "Paramètres",
  "Share your screen": "Partager votre écran",
  "Start a Call": "Démarrer un appel",
  "Stickers": "Autocollants",
  "Timeout": "Exclure temporairement",
  "Unban": "Débannir",
  "Unfavorite": "Retirer des favoris",
  "Unpin": "Désépingler",
  "Unpin Channel": "Désépingler le salon",
  "Unmute": "Réactiver le son",
  "Voice settings": "Paramètres vocaux",
  "You're all caught up.": "Vous êtes à jour.",
  "Dates follow this language. The rest of Lark stays in English.": "L’interface suit cette langue.",
  "Used for clocks and the document language.": "Utilisée pour l’horloge et l’interface.",
  "The interface follows this language.": "L’interface suit cette langue.",
  "No bookmarks yet. Save a message and it stays with your account.": "Pas encore de signets. Un message enregistré reste sur le compte.",
  "Save a message and it stays with your account.": "Un message enregistré reste sur le compte.",
  "No reminders yet.": "Pas encore de rappels.",
  "Bookmark Message": "Ajouter un signet",
  "Create Reminder": "Créer un rappel",
  "GIF": "GIF",
};

const es: Catalog = {
  "About me": "Sobre mí",
  "Accept": "Aceptar",
  "Active Now": "Activos ahora",
  "Activities": "Actividades",
  "Add": "Añadir",
  "Add Friend": "Añadir amigo",
  "Add account": "Añadir cuenta",
  "Add to Favorites": "Añadir a favoritos",
  "All events": "Todos los eventos",
  "Apps": "Aplicaciones",
  "Back": "Atrás",
  "Ban": "Banear",
  "Block": "Bloquear",
  "Call": "Llamada",
  "Camera": "Cámara",
  "Cancel": "Cancelar",
  "Clear": "Borrar",
  "Close": "Cerrar",
  "Close DM": "Cerrar MD",
  "Connecting to Discord": "Conectando con Discord",
  "Copy": "Copiar",
  "Copy ID": "Copiar ID",
  "Copy link": "Copiar enlace",
  "Create": "Crear",
  "Create Event": "Crear evento",
  "Create My Own": "Crear el mío",
  "Create Thread": "Crear hilo",
  "Custom status": "Estado personalizado",
  "Decline": "Rechazar",
  "Delete": "Eliminar",
  "Delete this message?": "¿Eliminar este mensaje?",
  "Direct messages": "Mensajes directos",
  "Discover": "Descubrir",
  "Dismiss": "Descartar",
  "Done": "Hecho",
  "Edit Channel": "Editar canal",
  "Editing your message": "Editando tu mensaje",
  "Favorites": "Favoritos",
  "Folder": "Carpeta",
  "Friends": "Amigos",
  "Go Live": "Emitir",
  "Ignore": "Ignorar",
  "Inbox": "Bandeja",
  "Join": "Unirse",
  "Join Voice": "Unirse a voz",
  "Join a Server": "Unirse a un servidor",
  "Kick": "Expulsar",
  "Language": "Idioma",
  "Language & Time": "Idioma y hora",
  "Leave": "Salir",
  "Loading…": "Cargando…",
  "Log Out": "Cerrar sesión",
  "Mark All Read": "Marcar todo como leído",
  "Mark As Read": "Marcar como leído",
  "Members": "Miembros",
  "Mentions": "Menciones",
  "Message": "Mensaje",
  "Mod View": "Vista de moderación",
  "Mod view": "Vista de moderación",
  "More": "Más",
  "Mute": "Silenciar",
  "New Group DM": "Nuevo grupo",
  "New messages": "Mensajes nuevos",
  "Note": "Nota",
  "Notification settings": "Notificaciones",
  "Open": "Abrir",
  "Pin": "Fijar",
  "Pin Channel": "Fijar canal",
  "Pinned": "Fijados",
  "Pins": "Mensajes fijados",
  "Profile": "Perfil",
  "Remove": "Quitar",
  "Remove Bookmark": "Quitar marcador",
  "Remove from Favorites": "Quitar de favoritos",
  "Remove Reminder": "Quitar recordatorio",
  "Reply": "Responder",
  "Roles": "Roles",
  "Save": "Guardar",
  "Saved messages": "Mensajes guardados",
  "Search": "Buscar",
  "Send": "Enviar",
  "Send a message": "Enviar un mensaje",
  "Servers": "Servidores",
  "Settings": "Ajustes",
  "Share your screen": "Compartir pantalla",
  "Start a Call": "Iniciar llamada",
  "Stickers": "Stickers",
  "Timeout": "Aislar",
  "Unban": "Quitar ban",
  "Unfavorite": "Quitar de favoritos",
  "Unpin": "Desfijar",
  "Unpin Channel": "Desfijar canal",
  "Unmute": "Activar sonido",
  "Voice settings": "Ajustes de voz",
  "You're all caught up.": "Estás al día.",
  "Dates follow this language. The rest of Lark stays in English.": "La interfaz sigue este idioma.",
  "Used for clocks and the document language.": "Se usa para el reloj y la interfaz.",
  "The interface follows this language.": "La interfaz sigue este idioma.",
  "No bookmarks yet. Save a message and it stays with your account.": "Aún no hay marcadores. Un mensaje guardado queda en la cuenta.",
  "Save a message and it stays with your account.": "Un mensaje guardado queda en la cuenta.",
  "No reminders yet.": "Aún no hay recordatorios.",
  "Bookmark Message": "Guardar mensaje",
  "Create Reminder": "Crear recordatorio",
  "GIF": "GIF",
};

const de: Catalog = {
  "About me": "Über mich",
  "Accept": "Annehmen",
  "Active Now": "Gerade aktiv",
  "Activities": "Aktivitäten",
  "Add": "Hinzufügen",
  "Add Friend": "Freund hinzufügen",
  "Add account": "Konto hinzufügen",
  "Add to Favorites": "Zu Favoriten",
  "All events": "Alle Ereignisse",
  "Apps": "Apps",
  "Back": "Zurück",
  "Ban": "Bannen",
  "Block": "Blockieren",
  "Call": "Anruf",
  "Camera": "Kamera",
  "Cancel": "Abbrechen",
  "Clear": "Leeren",
  "Close": "Schließen",
  "Close DM": "Unterhaltung schließen",
  "Connecting to Discord": "Verbindung zu Discord",
  "Copy": "Kopieren",
  "Copy ID": "ID kopieren",
  "Copy link": "Link kopieren",
  "Create": "Erstellen",
  "Create Event": "Ereignis erstellen",
  "Create My Own": "Eigenen erstellen",
  "Create Thread": "Thread erstellen",
  "Custom status": "Eigener Status",
  "Decline": "Ablehnen",
  "Delete": "Löschen",
  "Delete this message?": "Diese Nachricht löschen?",
  "Direct messages": "Direktnachrichten",
  "Discover": "Entdecken",
  "Dismiss": "Schließen",
  "Done": "Fertig",
  "Edit Channel": "Kanal bearbeiten",
  "Editing your message": "Nachricht bearbeiten",
  "Favorites": "Favoriten",
  "Folder": "Ordner",
  "Friends": "Freunde",
  "Go Live": "Live gehen",
  "Ignore": "Ignorieren",
  "Inbox": "Posteingang",
  "Join": "Beitreten",
  "Join Voice": "Sprachchat beitreten",
  "Join a Server": "Server beitreten",
  "Kick": "Kicken",
  "Language": "Sprache",
  "Language & Time": "Sprache und Zeit",
  "Leave": "Verlassen",
  "Loading…": "Wird geladen…",
  "Log Out": "Abmelden",
  "Mark All Read": "Alle als gelesen",
  "Mark As Read": "Als gelesen markieren",
  "Members": "Mitglieder",
  "Mentions": "Erwähnungen",
  "Message": "Nachricht",
  "Mod View": "Mod-Ansicht",
  "Mod view": "Mod-Ansicht",
  "More": "Mehr",
  "Mute": "Stummschalten",
  "New Group DM": "Neue Gruppe",
  "New messages": "Neue Nachrichten",
  "Note": "Notiz",
  "Notification settings": "Benachrichtigungen",
  "Open": "Öffnen",
  "Pin": "Anheften",
  "Pin Channel": "Kanal anheften",
  "Pinned": "Angeheftet",
  "Pins": "Angeheftete Nachrichten",
  "Profile": "Profil",
  "Remove": "Entfernen",
  "Remove Bookmark": "Lesezeichen entfernen",
  "Remove from Favorites": "Aus Favoriten entfernen",
  "Remove Reminder": "Erinnerung entfernen",
  "Reply": "Antworten",
  "Roles": "Rollen",
  "Save": "Speichern",
  "Saved messages": "Gespeicherte Nachrichten",
  "Search": "Suchen",
  "Send": "Senden",
  "Send a message": "Nachricht senden",
  "Servers": "Server",
  "Settings": "Einstellungen",
  "Share your screen": "Bildschirm teilen",
  "Start a Call": "Anruf starten",
  "Stickers": "Sticker",
  "Timeout": "Timeout",
  "Unban": "Entbannen",
  "Unfavorite": "Nicht mehr favorisieren",
  "Unpin": "Lösen",
  "Unpin Channel": "Kanal lösen",
  "Unmute": "Stummschaltung aufheben",
  "Voice settings": "Spracheinstellungen",
  "You're all caught up.": "Du bist auf dem neuesten Stand.",
  "Dates follow this language. The rest of Lark stays in English.": "Die Oberfläche folgt dieser Sprache.",
  "Used for clocks and the document language.": "Gilt für die Uhr und die Oberfläche.",
  "The interface follows this language.": "Die Oberfläche folgt dieser Sprache.",
  "No bookmarks yet. Save a message and it stays with your account.": "Noch keine Lesezeichen. Eine gespeicherte Nachricht bleibt am Konto.",
  "Save a message and it stays with your account.": "Eine gespeicherte Nachricht bleibt am Konto.",
  "No reminders yet.": "Noch keine Erinnerungen.",
  "Bookmark Message": "Nachricht merken",
  "Create Reminder": "Erinnerung erstellen",
  "GIF": "GIF",
};

const pt: Catalog = {
  "About me": "Sobre mim",
  "Accept": "Aceitar",
  "Active Now": "Ativos agora",
  "Activities": "Atividades",
  "Add": "Adicionar",
  "Add Friend": "Adicionar amigo",
  "Add account": "Adicionar conta",
  "Add to Favorites": "Adicionar aos favoritos",
  "All events": "Todos os eventos",
  "Apps": "Aplicativos",
  "Back": "Voltar",
  "Ban": "Banir",
  "Block": "Bloquear",
  "Call": "Chamada",
  "Camera": "Câmera",
  "Cancel": "Cancelar",
  "Clear": "Limpar",
  "Close": "Fechar",
  "Close DM": "Fechar conversa",
  "Connecting to Discord": "Conectando ao Discord",
  "Copy": "Copiar",
  "Copy ID": "Copiar ID",
  "Copy link": "Copiar link",
  "Create": "Criar",
  "Create Event": "Criar evento",
  "Create My Own": "Criar o meu",
  "Create Thread": "Criar tópico",
  "Custom status": "Status personalizado",
  "Decline": "Recusar",
  "Delete": "Excluir",
  "Delete this message?": "Excluir esta mensagem?",
  "Direct messages": "Mensagens diretas",
  "Discover": "Descobrir",
  "Dismiss": "Dispensar",
  "Done": "Concluído",
  "Edit Channel": "Editar canal",
  "Editing your message": "Editando sua mensagem",
  "Favorites": "Favoritos",
  "Folder": "Pasta",
  "Friends": "Amigos",
  "Go Live": "Transmitir",
  "Ignore": "Ignorar",
  "Inbox": "Caixa de entrada",
  "Join": "Entrar",
  "Join Voice": "Entrar na voz",
  "Join a Server": "Entrar em um servidor",
  "Kick": "Expulsar",
  "Language": "Idioma",
  "Language & Time": "Idioma e hora",
  "Leave": "Sair",
  "Loading…": "Carregando…",
  "Log Out": "Sair da conta",
  "Mark All Read": "Marcar tudo como lido",
  "Mark As Read": "Marcar como lido",
  "Members": "Membros",
  "Mentions": "Menções",
  "Message": "Mensagem",
  "Mod View": "Visão de moderação",
  "Mod view": "Visão de moderação",
  "More": "Mais",
  "Mute": "Silenciar",
  "New Group DM": "Novo grupo",
  "New messages": "Novas mensagens",
  "Note": "Nota",
  "Notification settings": "Notificações",
  "Open": "Abrir",
  "Pin": "Fixar",
  "Pin Channel": "Fixar canal",
  "Pinned": "Fixados",
  "Pins": "Mensagens fixadas",
  "Profile": "Perfil",
  "Remove": "Remover",
  "Remove Bookmark": "Remover marcador",
  "Remove from Favorites": "Remover dos favoritos",
  "Remove Reminder": "Remover lembrete",
  "Reply": "Responder",
  "Roles": "Cargos",
  "Save": "Salvar",
  "Saved messages": "Mensagens salvas",
  "Search": "Buscar",
  "Send": "Enviar",
  "Send a message": "Enviar uma mensagem",
  "Servers": "Servidores",
  "Settings": "Configurações",
  "Share your screen": "Compartilhar a tela",
  "Start a Call": "Iniciar chamada",
  "Stickers": "Figurinhas",
  "Timeout": "Castigo",
  "Unban": "Remover banimento",
  "Unfavorite": "Desfavoritar",
  "Unpin": "Desafixar",
  "Unpin Channel": "Desafixar canal",
  "Unmute": "Reativar som",
  "Voice settings": "Configurações de voz",
  "You're all caught up.": "Você está em dia.",
  "Dates follow this language. The rest of Lark stays in English.": "A interface segue este idioma.",
  "Used for clocks and the document language.": "Usado no relógio e na interface.",
  "The interface follows this language.": "A interface segue este idioma.",
  "No bookmarks yet. Save a message and it stays with your account.": "Ainda não há marcadores. Uma mensagem salva fica na conta.",
  "Save a message and it stays with your account.": "Uma mensagem salva fica na conta.",
  "No reminders yet.": "Ainda não há lembretes.",
  "Bookmark Message": "Salvar mensagem",
  "Create Reminder": "Criar lembrete",
  "GIF": "GIF",
};

const frCatalog: Record<string, string> = { ...fr };
const esCatalog: Record<string, string> = { ...es };
const deCatalog: Record<string, string> = { ...de };
const ptCatalog: Record<string, string> = { ...pt };

/** Inline chrome only. The long phrase file joins these on a non-English locale. */
const catalogs: Record<string, Record<string, string>> = {
  fr: frCatalog,
  es: esCatalog,
  de: deCatalog,
  "pt-BR": ptCatalog,
  pt: ptCatalog,
};

let current = "en";

export function localeId(): string {
  return current;
}

export function setLocale(id: string): boolean {
  const next = id?.trim() || "en";
  const changed = next !== current;
  current = next;
  if (typeof document !== "undefined") document.documentElement.lang = next;
  return changed;
}

export function hasPhrase(source: string): boolean {
  const catalog = catalogs[current];
  return Boolean(catalog && Object.prototype.hasOwnProperty.call(catalog, source));
}

const known = new Set<string>();
for (const catalog of [frCatalog, esCatalog, deCatalog, ptCatalog]) {
  for (const key of Object.keys(catalog)) known.add(key);
}

let phrasesReady = false;
let phraseTask: Promise<void> | null = null;

/** Load the long translation file. English never needs it. */
export function ensurePhrases(): Promise<void> {
  if (phrasesReady) return Promise.resolve();
  if (!phraseTask) {
    phraseTask = import("./i18n-phrases").then(({ phrases }) => {
      absorbPhrases(phrases);
    });
  }
  return phraseTask;
}

function absorbPhrases(phrases: PhraseRows) {
  if (phrasesReady) return;
  for (const [source, row] of Object.entries(phrases)) {
    known.add(source);
    frCatalog[source] = row[0];
    esCatalog[source] = row[1];
    deCatalog[source] = row[2];
    ptCatalog[source] = row[3];
  }
  phrasesReady = true;
}

/** True when the English source is in a shipped catalog, regardless of the active locale. */
export function knownPhrase(source: string): boolean {
  return known.has(source);
}

export function t(source: string): string {
  if (!source || current === "en" || current === "en-GB") return source;
  return catalogs[current]?.[source] ?? source;
}

const TEXT_NODE = 3;

/** Rewrite chrome text that was created from an English source string. */
export function localizeTree(root: ParentNode) {
  const children = root.children;
  if (!children) return;
  for (const child of Array.from(children)) {
    if (!("dataset" in child)) continue;
    const node = child as HTMLElement;
    const source = node.dataset?.i18n;
    const storedLabel = node.dataset?.i18nLabel;
    if (source && node.childElementCount === 0) node.textContent = t(source);
    if (storedLabel) node.setAttribute("aria-label", t(storedLabel));
    if (!source && node.childElementCount === 0 && node.childNodes.length === 1 && node.childNodes[0].nodeType === TEXT_NODE) {
      const raw = node.textContent ?? "";
      if (knownPhrase(raw)) {
        node.dataset.i18n = raw;
        node.textContent = t(raw);
      }
    }
    if (!storedLabel) {
      const aria = node.getAttribute("aria-label");
      if (aria && knownPhrase(aria)) {
        node.dataset.i18nLabel = aria;
        node.setAttribute("aria-label", t(aria));
      }
    }
    const storedTitle = node.dataset?.i18nTitle;
    if (storedTitle) node.setAttribute("title", t(storedTitle));
    else {
      const title = node.getAttribute("title");
      if (title && knownPhrase(title)) {
        node.dataset.i18nTitle = title;
        node.setAttribute("title", t(title));
      }
    }
    if (node.childElementCount > 0) localizeTree(node);
  }
}

export function catalogSize(id: string): number {
  return Object.keys(catalogs[id] ?? {}).length;
}
