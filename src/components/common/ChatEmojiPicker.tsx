import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Zap, Smile as SmileIcon, ThumbsUp, Briefcase, CheckCircle, Clock } from 'lucide-react';

interface ChatEmojiPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
  className?: string;
}

interface EmojiItem {
  emoji: string;
  name: string;
  category: 'faces' | 'gestures' | 'office' | 'symbols';
  keywords: string[];
}

const EMOJI_DATABASE: EmojiItem[] = [
  // Visages & Émotions
  { emoji: '😊', name: 'Sourire radieux', category: 'faces', keywords: ['content', 'sourire', 'joie', 'bien'] },
  { emoji: '😀', name: 'Grand sourire', category: 'faces', keywords: ['joie', 'rire', 'content'] },
  { emoji: '😁', name: 'Sourire éclatant', category: 'faces', keywords: ['dents', 'joie', 'heureux'] },
  { emoji: '😂', name: 'Rire aux larmes', category: 'faces', keywords: ['rire', 'mdr', 'drôle'] },
  { emoji: '🤣', name: 'Mort de rire', category: 'faces', keywords: ['rire', 'ptdr', 'hilarant'] },
  { emoji: '😉', name: 'Clin d\'œil', category: 'faces', keywords: ['clin d\'oeil', 'complice', 'accord'] },
  { emoji: '😇', name: 'Auréole', category: 'faces', keywords: ['ange', 'sage', 'innocent'] },
  { emoji: '🥰', name: 'Amour & Chaleur', category: 'faces', keywords: ['coeur', 'aimer', 'bienveillance'] },
  { emoji: '😍', name: 'Yeux coeur', category: 'faces', keywords: ['adore', 'magnifique', 'super'] },
  { emoji: '🤩', name: 'Étoiles plein les yeux', category: 'faces', keywords: ['impressionnant', 'bravo', 'top'] },
  { emoji: '😎', name: 'Lunettes de soleil', category: 'faces', keywords: ['cool', 'maîtrise', 'pro'] },
  { emoji: '🤓', name: 'Expert', category: 'faces', keywords: ['informatique', 'expert', 'technique', 'lunettes'] },
  { emoji: '🧐', name: 'Monocle', category: 'faces', keywords: ['analyse', 'examen', 'vérification', 'audit'] },
  { emoji: '🤔', name: 'Pensif', category: 'faces', keywords: ['réflexion', 'doute', 'question', 'pourquoi'] },
  { emoji: '🤫', name: 'Chut', category: 'faces', keywords: ['secret', 'discret', 'silence', 'confidentiel'] },
  { emoji: '🤗', name: 'Câlin chaleureux', category: 'faces', keywords: ['accueil', 'chaleur', 'bienvenue'] },
  { emoji: '🫡', name: 'Salute respectueux', category: 'faces', keywords: ['respect', 'ordre', 'reçu', 'compris', 'chef'] },
  { emoji: '😌', name: 'Soulagé', category: 'faces', keywords: ['calme', 'rassuré', 'zen'] },
  { emoji: '😴', name: 'Endormi', category: 'faces', keywords: ['fatigue', 'nuit', 'dormir'] },
  { emoji: '🤯', name: 'Tête qui explose', category: 'faces', keywords: ['choc', 'incroyable', 'fou'] },
  { emoji: '🥳', name: 'Fête', category: 'faces', keywords: ['célébration', 'succès', 'victoire', 'anniversaire'] },
  { emoji: '🤝', name: 'Poignée de main', category: 'gestures', keywords: ['accord', 'partenariat', 'contrat', 'entente', 'conclu'] },

  // Gestes & Validation
  { emoji: '👍', name: 'Pouce levé', category: 'gestures', keywords: ['ok', 'daccord', 'valider', 'super', 'bon', 'oui'] },
  { emoji: '👎', name: 'Pouce baissé', category: 'gestures', keywords: ['non', 'refus', 'mauvais', 'desaccord'] },
  { emoji: '👌', name: 'Parfait', category: 'gestures', keywords: ['nickel', 'impeccable', 'top', 'conforme'] },
  { emoji: '👏', name: 'Applaudissements', category: 'gestures', keywords: ['bravo', 'felicitations', 'succès'] },
  { emoji: '🙌', name: 'Mains levées', category: 'gestures', keywords: ['victoire', 'succes', 'hourra'] },
  { emoji: '🙏', name: 'Mains jointes', category: 'gestures', keywords: ['merci', 'remerciement', 'svp', 'priere', 'reconnaissance'] },
  { emoji: '✍️', name: 'Écriture', category: 'gestures', keywords: ['signature', 'noter', 'redaction', 'ecrire', 'contrat'] },
  { emoji: '💪', name: 'Force & Courage', category: 'gestures', keywords: ['courage', 'force', 'motivation', 'equipe'] },
  { emoji: '✌️', name: 'Signe de paix', category: 'gestures', keywords: ['victoire', 'paix', 'salut'] },
  { emoji: '🤞', name: 'Doigts croisés', category: 'gestures', keywords: ['chance', 'espoir'] },
  { emoji: '👋', name: 'Salut de la main', category: 'gestures', keywords: ['bonjour', 'au revoir', 'salut', 'coucou'] },
  { emoji: '🤙', name: 'Appelle-moi', category: 'gestures', keywords: ['appel', 'telephone', 'joindre'] },
  { emoji: '👈', name: 'Pointe gauche', category: 'gestures', keywords: ['gauche', 'regarde', 'ici'] },
  { emoji: '👉', name: 'Pointe droite', category: 'gestures', keywords: ['droite', 'voir', 'suivre'] },
  { emoji: '👆', name: 'Pointe haut', category: 'gestures', keywords: ['haut', 'ci-dessus', 'important'] },
  { emoji: '👇', name: 'Pointe bas', category: 'gestures', keywords: ['bas', 'ci-dessous', 'lien', 'fichier'] },

  // Entreprise, Trésorerie & Opérations Ets AMANI
  { emoji: '💼', name: 'Mallette professionnelle', category: 'office', keywords: ['travail', 'bureau', 'dossier', 'professionnel', 'mission'] },
  { emoji: '🏢', name: 'Siège & Bâtiment', category: 'office', keywords: ['siege', 'direction', 'bureau', 'societe', 'entreprise'] },
  { emoji: '🏦', name: 'Banque & Agence', category: 'office', keywords: ['banque', 'agence', 'caisse', 'succursale', 'etablissement'] },
  { emoji: '💰', name: 'Sac d\'argent', category: 'office', keywords: ['argent', 'tresorerie', 'fonds', 'liquidites', 'caisse', 'billetage'] },
  { emoji: '💵', name: 'Billets de banque', category: 'office', keywords: ['billet', 'argent', 'cash', 'especes', 'paiement'] },
  { emoji: '🪙', name: 'Pièce de monnaie', category: 'office', keywords: ['monnaie', 'centimes', 'appoint'] },
  { emoji: '💳', name: 'Carte bancaire', category: 'office', keywords: ['carte', 'virement', 'paiement', 'mobile money', 'flotte'] },
  { emoji: '🧾', name: 'Reçu / Ticket de caisse', category: 'office', keywords: ['recu', 'bordereau', 'ticket', 'justificatif', 'facture', 'billetage'] },
  { emoji: '📊', name: 'Graphique analytique', category: 'office', keywords: ['statistiques', 'rapport', 'bilan', 'performance', 'chiffres'] },
  { emoji: '📈', name: 'Hausse / Croissance', category: 'office', keywords: ['augmentation', 'positif', 'hausse', 'progression'] },
  { emoji: '📉', name: 'Baisse', category: 'office', keywords: ['reduction', 'baisse', 'deficit'] },
  { emoji: '📄', name: 'Document / Feuille', category: 'office', keywords: ['document', 'page', 'rapport', 'fichier'] },
  { emoji: '📁', name: 'Dossier archivé', category: 'office', keywords: ['dossier', 'archive', 'classeur'] },
  { emoji: '📋', name: 'Presse-papiers / Check-list', category: 'office', keywords: ['inventaire', 'liste', 'taches', 'controle', 'audit'] },
  { emoji: '📌', name: 'Punaise épingle', category: 'office', keywords: ['epingler', 'important', 'fixer', 'note'] },
  { emoji: '📍', name: 'Localisation / Agence', category: 'office', keywords: ['adresse', 'lieu', 'agence', 'ville', 'repere'] },
  { emoji: '🔒', name: 'Cadenas sécurité', category: 'office', keywords: ['securite', 'verrouille', 'confidentiel', 'protection'] },
  { emoji: '🔑', name: 'Clé d\'accès', category: 'office', keywords: ['cle', 'acces', 'autorisation', 'mot de passe'] },
  { emoji: '📦', name: 'Colis / Expédition', category: 'office', keywords: ['colis', 'livraison', 'envoi', 'transfert'] },
  { emoji: '🚚', name: 'Camion transport', category: 'office', keywords: ['transport', 'logistique', 'convoyage'] },
  { emoji: '🕒', name: 'Horloge / Heure', category: 'office', keywords: ['heure', 'temps', 'delai', 'retard', 'planning'] },
  { emoji: '📅', name: 'Calendrier', category: 'office', keywords: ['date', 'jour', 'echeance', 'rendez-vous'] },
  { emoji: '📞', name: 'Téléphone combiné', category: 'office', keywords: ['appel', 'contact', 'joindre', 'service'] },
  { emoji: '📱', name: 'Smartphone mobile', category: 'office', keywords: ['mobile', 'application', 'sms', 'flotte'] },

  // Statuts, Alertes & Symboles
  { emoji: '✅', name: 'Coché vert / Validé', category: 'symbols', keywords: ['valide', 'conforme', 'approuve', 'fait', 'ok', 'succes'] },
  { emoji: '❌', name: 'Croix rouge / Rejeté', category: 'symbols', keywords: ['annule', 'refuse', 'rejete', 'non', 'erreur'] },
  { emoji: '⚠️', name: 'Avertissement jaune', category: 'symbols', keywords: ['attention', 'alerte', 'vigilance', 'prudence'] },
  { emoji: '🚨', name: 'Gyrophare urgence', category: 'symbols', keywords: ['urgence', 'critique', 'danger', 'immediat'] },
  { emoji: 'ℹ️', name: 'Information', category: 'symbols', keywords: ['info', 'precision', 'note', 'a savoir'] },
  { emoji: '🔔', name: 'Cloche de notification', category: 'symbols', keywords: ['rappel', 'notification', 'alerte', 'signal'] },
  { emoji: '🟢', name: 'Pastille verte', category: 'symbols', keywords: ['en ligne', 'ouvert', 'disponible', 'actif'] },
  { emoji: '🔴', name: 'Pastille rouge', category: 'symbols', keywords: ['ferme', 'bloque', 'inactif', 'hors ligne', 'urgent'] },
  { emoji: '🟡', name: 'Pastille jaune', category: 'symbols', keywords: ['en cours', 'attente', 'intermediaire'] },
  { emoji: '🔵', name: 'Pastille bleue', category: 'symbols', keywords: ['information', 'standard', 'normal'] },
  { emoji: '⭐', name: 'Étoile', category: 'symbols', keywords: ['favori', 'prioritaire', 'important', 'qualite'] },
  { emoji: '🔥', name: 'Flamme / Priorité haute', category: 'symbols', keywords: ['urgent', 'top', 'tendance', 'chaud'] },
  { emoji: '💯', name: 'Score 100%', category: 'symbols', keywords: ['parfait', 'total', 'complet', 'excellent'] },
  { emoji: '🎯', name: 'Cible / Objectif', category: 'symbols', keywords: ['objectif', 'but', 'reussi', 'vise'] },
  { emoji: '💡', name: 'Ampoule idée', category: 'symbols', keywords: ['idee', 'solution', 'astuce', 'proposition'] },
  { emoji: '✨', name: 'Étincelles éclat', category: 'symbols', keywords: ['nouveau', 'propre', 'magique', 'brillant'] },
  { emoji: '🚀', name: 'Fusée décollage', category: 'symbols', keywords: ['lancement', 'rapide', 'vitesse', 'efficace'] },
  { emoji: '⏳', name: 'Sablier attente', category: 'symbols', keywords: ['attente', 'patienter', 'en cours', 'delai'] },
];

const RECENT_STORAGE_KEY = 'ets_amani_chat_recent_emojis_v1';
const DEFAULT_RECENTS = ['👍', '🙏', '✅', '💼', '💰', '📍', '🤝', '😊', '👏', '🎯', '🔥', '🧾'];

export default function ChatEmojiPicker({
  isOpen,
  onClose,
  onSelectEmoji,
  className = '',
}: ChatEmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState<'recents' | 'faces' | 'gestures' | 'office' | 'symbols'>('recents');
  const [searchQuery, setSearchQuery] = useState('');
  const [recents, setRecents] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(RECENT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // fallback
    }
    return DEFAULT_RECENTS;
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Fermeture par clic extérieur ou touche Échap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handlePickEmoji = (emoji: string) => {
    onSelectEmoji(emoji);

    // Mettre à jour les récents
    setRecents((prev) => {
      const next = [emoji, ...prev.filter((e) => e !== emoji)].slice(0, 16);
      try {
        localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const filteredEmojis = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      if (activeCategory === 'recents') {
        return EMOJI_DATABASE.filter((item) => recents.includes(item.emoji));
      }
      return EMOJI_DATABASE.filter((item) => item.category === activeCategory);
    }

    return EMOJI_DATABASE.filter((item) => {
      return (
        item.emoji.includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.keywords.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [searchQuery, activeCategory, recents]);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className={`absolute bottom-full mb-2 left-0 right-0 sm:left-2 sm:right-auto sm:w-84 md:w-96 rounded-2xl bg-white border border-slate-200/90 shadow-2xl shadow-slate-900/15 overflow-hidden z-40 animate-in fade-in zoom-in-95 duration-150 ${className}`}
    >
      {/* En-tête WhatsApp : Recherche & Fermeture */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-slate-100 bg-slate-50/70">
        <div className="flex flex-1 items-center gap-2 rounded-xl bg-white px-2.5 py-1.5 border border-slate-200 text-xs shadow-2xs">
          <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher un émoji (ok, merci, argent...)"
            className="w-full bg-transparent text-xs text-slate-800 placeholder:text-slate-400 outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition"
          title="Fermer le sélecteur"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Onglets des catégories avec style WhatsApp */}
      {!searchQuery && (
        <div className="flex items-center justify-between px-2 pt-1 border-b border-slate-100 bg-slate-50/40 text-slate-500 text-xs">
          <button
            type="button"
            onClick={() => setActiveCategory('recents')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold border-b-2 transition ${
              activeCategory === 'recents'
                ? 'border-[#008069] text-[#008069]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
            title="Fréquents & récents"
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Récents</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory('faces')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold border-b-2 transition ${
              activeCategory === 'faces'
                ? 'border-[#008069] text-[#008069]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
            title="Visages & émotions"
          >
            <SmileIcon className="h-3.5 w-3.5" />
            <span>Visages</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory('gestures')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold border-b-2 transition ${
              activeCategory === 'gestures'
                ? 'border-[#008069] text-[#008069]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
            title="Gestes & mains"
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            <span>Gestes</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory('office')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold border-b-2 transition ${
              activeCategory === 'office'
                ? 'border-[#008069] text-[#008069]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
            title="Bureau, Caisse & Trésorerie"
          >
            <Briefcase className="h-3.5 w-3.5" />
            <span>Bureau</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory('symbols')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold border-b-2 transition ${
              activeCategory === 'symbols'
                ? 'border-[#008069] text-[#008069]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
            title="Statuts & validation"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            <span>Statuts</span>
          </button>
        </div>
      )}

      {/* Raccourcis ultra-rapides en une ligne (toujours visibles pour efficacité maximale) */}
      <div className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50/40 border-b border-emerald-100/60 overflow-x-auto scrollbar-none">
        <span className="text-[10px] font-bold text-[#008069] uppercase tracking-wider shrink-0 flex items-center gap-1 mr-1">
          <Zap className="h-2.5 w-2.5" /> Express:
        </span>
        {['👍', '🙏', '✅', '💼', '💰', '🤝', '😊', '👏', '🎯', '🔥', '📍'].map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => handlePickEmoji(emoji)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-base hover:bg-white hover:scale-125 transition-transform"
            title={`Insérer ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Grille d'émojis principale */}
      <div className="p-3 max-h-52 overflow-y-auto">
        {filteredEmojis.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            Aucun émoji trouvé pour « {searchQuery} »
          </div>
        ) : (
          <div className="grid grid-cols-7 sm:grid-cols-8 gap-1.5">
            {filteredEmojis.map((item) => (
              <button
                key={item.emoji + item.name}
                type="button"
                onClick={() => handlePickEmoji(item.emoji)}
                className="group relative flex h-9 w-9 items-center justify-center rounded-xl text-lg hover:bg-slate-100 hover:scale-120 active:scale-95 transition-all"
                title={`${item.emoji} ${item.name}`}
              >
                {item.emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pied de panneau avec conseil discret */}
      <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
        <span>Cliquez pour insérer dans le message</span>
        <span>Échap pour fermer</span>
      </div>
    </div>
  );
}
