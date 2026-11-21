/**
 * WhatsApp CRM Modern Emoji Picker Component
 * Apple / WhatsApp Web styled responsive emoji selector
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X, Smile, ThumbsUp, Heart, Sparkles, Car, Briefcase } from 'lucide-react';

interface WhatsAppEmojiPickerProps {
  onSelectEmoji?: (emoji: string) => void;
  onSelect?: (emoji: string) => void;
  onClose: () => void;
}

interface EmojiCategory {
  id: string;
  name: string;
  icon: React.ElementType;
  emojis: { char: string; name: string }[];
}

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'smileys',
    name: 'Smileys & Emotion',
    icon: Smile,
    emojis: [
      { char: '😀', name: 'grinning face smile' },
      { char: '😃', name: 'smiling face with big eyes' },
      { char: '😄', name: 'grinning face with smiling eyes' },
      { char: '😁', name: 'beaming face with smiling eyes' },
      { char: '😆', name: 'grinning squinting face laugh' },
      { char: '😅', name: 'sweat smile nervous' },
      { char: '🤣', name: 'rolling on floor laughing rofl' },
      { char: '😂', name: 'face with tears of joy laugh' },
      { char: '🙂', name: 'slightly smiling face' },
      { char: '🙃', name: 'upside down face' },
      { char: '😉', name: 'winking face wink' },
      { char: '😊', name: 'smiling face with smiling eyes blush' },
      { char: '😇', name: 'smiling face with halo angel' },
      { char: '🥰', name: 'smiling face with hearts love' },
      { char: '😍', name: 'heart eyes love' },
      { char: '🤩', name: 'star struck excited' },
      { char: '😘', name: 'face blowing kiss' },
      { char: '😗', name: 'kissing face' },
      { char: '😚', name: 'kissing face with closed eyes' },
      { char: '😙', name: 'kissing face with smiling eyes' },
      { char: '😋', name: 'face savoring food delicious' },
      { char: '😛', name: 'face with tongue' },
      { char: '😜', name: 'winking face with tongue joke' },
      { char: '🤪', name: 'zany face crazy' },
      { char: '😝', name: 'squinting face with tongue' },
      { char: '🤑', name: 'money mouth face rich cash' },
      { char: '🤗', name: 'hugging face hug' },
      { char: '🤭', name: 'face with hand over mouth oops' },
      { char: '🤫', name: 'shushing face quiet secret' },
      { char: '🤔', name: 'thinking face hmm ponder' },
      { char: '🤐', name: 'zipper mouth face silent' },
      { char: '🤨', name: 'face with raised eyebrow skeptic' },
      { char: '😐', name: 'neutral face straight' },
      { char: '😑', name: 'expressionless face blank' },
      { char: '😶', name: 'face without mouth silent' },
      { char: '😏', name: 'smirking face smug' },
      { char: '😒', name: 'unamused face annoyed' },
      { char: '🙄', name: 'face with rolling eyes eye roll' },
      { char: '😬', name: 'grimacing face awkward' },
      { char: '🤥', name: 'lying face pinocchio' },
      { char: '😌', name: 'relieved face calm' },
      { char: '😔', name: 'pensive face sad' },
      { char: '😪', name: 'sleepy face tired' },
      { char: '🤤', name: 'drooling face' },
      { char: '😴', name: 'sleeping face zzz' },
      { char: '😷', name: 'face with medical mask sick' },
      { char: '🤒', name: 'face with thermometer sick fever' },
      { char: '🤕', name: 'face with head bandage hurt' },
      { char: '🤢', name: 'nauseated face sick' },
      { char: '🤮', name: 'face vomiting puking' },
      { char: '🤧', name: 'sneezing face cold' },
      { char: '🥵', name: 'hot face sweating summer' },
      { char: '🥶', name: 'cold face freezing winter' },
      { char: '🥴', name: 'woozy face dizzy' },
      { char: '😵', name: 'knocked out face dizzy' },
      { char: '🤯', name: 'exploding head mind blown' },
      { char: '🤠', name: 'cowboy hat face' },
      { char: '🥳', name: 'partying face celebrate' },
      { char: '😎', name: 'smiling face with sunglasses cool' },
      { char: '🤓', name: 'nerd face smart' },
      { char: '🧐', name: 'face with monocle examine' },
      { char: '😕', name: 'confused face' },
      { char: '😟', name: 'worried face' },
      { char: '🙁', name: 'slightly frowning face' },
      { char: '😮', name: 'face with open mouth surprise' },
      { char: '😯', name: 'hushed face' },
      { char: '😲', name: 'astonished face shock' },
      { char: '😳', name: 'flushed face embarrassed' },
      { char: '🥺', name: 'pleading face please puppy eyes' },
      { char: '😦', name: 'frowning face with open mouth' },
      { char: '😧', name: 'anguished face' },
      { char: '😨', name: 'fearful face scared' },
      { char: '😰', name: 'anxious face with sweat' },
      { char: '😥', name: 'sad but relieved face' },
      { char: '😢', name: 'crying face tear sad' },
      { char: '😭', name: 'loudly crying face sob tears' },
      { char: '😱', name: 'face screaming in fear scream' },
      { char: '😖', name: 'confounded face' },
      { char: '😣', name: 'persevering face' },
      { char: '😞', name: 'disappointed face' },
      { char: '😓', name: 'downcast face with sweat' },
      { char: '😩', name: 'weary face tired' },
      { char: '😫', name: 'tired face exhausted' },
      { char: '🥱', name: 'yawning face bored' },
      { char: '😤', name: 'face with steam from nose proud' },
      { char: '😡', name: 'pouting face angry mad' },
      { char: '😠', name: 'angry face mad' },
      { char: '🤬', name: 'face with symbols on mouth curse swearing' }
    ]
  },
  {
    id: 'people',
    name: 'Gestures & People',
    icon: ThumbsUp,
    emojis: [
      { char: '👋', name: 'waving hand wave hello hi bye' },
      { char: '🤚', name: 'raised back of hand' },
      { char: '🖐️', name: 'hand with fingers splayed' },
      { char: '✋', name: 'raised hand stop high five' },
      { char: '🖖', name: 'vulcan salute spock' },
      { char: '👌', name: 'ok hand fine perfect' },
      { char: '🤌', name: 'pinched fingers italian chef' },
      { char: '🤏', name: 'pinching hand little small' },
      { char: '✌️', name: 'victory hand peace' },
      { char: '🤞', name: 'crossed fingers luck hope' },
      { char: '🤟', name: 'love you gesture' },
      { char: '🤘', name: 'sign of the horns rock' },
      { char: '🤙', name: 'call me hand phone' },
      { char: '👈', name: 'backhand index pointing left' },
      { char: '👉', name: 'backhand index pointing right' },
      { char: '👆', name: 'backhand index pointing up' },
      { char: '🖕', name: 'middle finger' },
      { char: '👇', name: 'backhand index pointing down' },
      { char: '☝️', name: 'index pointing up one' },
      { char: '👍', name: 'thumbs up like approve good yes' },
      { char: '👎', name: 'thumbs down dislike bad no' },
      { char: '✊', name: 'raised fist power' },
      { char: '👊', name: 'oncoming fist punch brofist' },
      { char: '🤛', name: 'left facing fist' },
      { char: '🤜', name: 'right facing fist' },
      { char: '👏', name: 'clapping hands applause bravo praise' },
      { char: '🙌', name: 'raising hands celebrate hooray' },
      { char: '👐', name: 'open hands' },
      { char: '🤲', name: 'palms up together' },
      { char: '🤝', name: 'handshake deal agree partnership' },
      { char: '🙏', name: 'folded hands pray thank you please namaste' },
      { char: '✍️', name: 'writing hand write signature' },
      { char: '💅', name: 'nail polish' },
      { char: '🤳', name: 'selfie camera' },
      { char: '💪', name: 'flexed biceps muscle strong fitness' },
      { char: '👀', name: 'eyes look see gaze' },
      { char: '👁️', name: 'eye look vision' },
      { char: '👂', name: 'ear listen hear' },
      { char: '👃', name: 'nose smell' },
      { char: '🧠', name: 'brain smart think' },
      { char: '🫀', name: 'anatomical heart' },
      { char: '🫁', name: 'lungs breath' },
      { char: '🦷', name: 'tooth dentist' },
      { char: '🦴', name: 'bone' },
      { char: '👤', name: 'bust in silhouette user person contact' },
      { char: '👥', name: 'busts in silhouette group team users' },
      { char: '🗣️', name: 'speaking head talk speak voice' }
    ]
  },
  {
    id: 'symbols',
    name: 'Hearts & Symbols',
    icon: Heart,
    emojis: [
      { char: '❤️', name: 'red heart love like' },
      { char: '🧡', name: 'orange heart' },
      { char: '💛', name: 'yellow heart' },
      { char: '💚', name: 'green heart' },
      { char: '💙', name: 'blue heart' },
      { char: '💜', name: 'purple heart' },
      { char: '🖤', name: 'black heart' },
      { char: '🤍', name: 'white heart' },
      { char: '🤎', name: 'brown heart' },
      { char: '💔', name: 'broken heart heartbreak' },
      { char: '❣️', name: 'heart exclamation' },
      { char: '💕', name: 'two hearts love' },
      { char: '💞', name: 'revolving hearts' },
      { char: '💓', name: 'beating heart pulse' },
      { char: '💗', name: 'growing heart' },
      { char: '💖', name: 'sparkling heart love sparkle' },
      { char: '💘', name: 'heart with arrow cupid' },
      { char: '💝', name: 'heart with ribbon gift' },
      { char: '🔥', name: 'fire flame lit hot trend' },
      { char: '⭐', name: 'star favorite rating' },
      { char: '🌟', name: 'glowing star sparkle' },
      { char: '✨', name: 'sparkles clean magic new' },
      { char: '💯', name: 'hundred points score perfect 100' },
      { char: '✅', name: 'check mark button verify done approved success' },
      { char: '☑️', name: 'check box with check mark done' },
      { char: '✔️', name: 'check mark tick true' },
      { char: '❌', name: 'cross mark cancel reject delete no' },
      { char: '❎', name: 'cross mark button no' },
      { char: '⚠️', name: 'warning alert caution' },
      { char: '⚡', name: 'high voltage lightning fast quick' },
      { char: '🔔', name: 'bell notification alert ring' },
      { char: '🔕', name: 'bell with slash silent mute' },
      { char: '💡', name: 'light bulb idea inspiration' },
      { char: '📌', name: 'pushpin pin location mark' },
      { char: '📍', name: 'round pushpin location map address' },
      { char: '🚩', name: 'triangular flag mark report' },
      { char: '💬', name: 'speech balloon comment chat message' },
      { char: '💭', name: 'thought balloon think dream' },
      { char: '📢', name: 'loudspeaker announcement broadcast alert' },
      { char: '📣', name: 'megaphone cheering announce marketing' }
    ]
  },
  {
    id: 'activities',
    name: 'Celebration & Events',
    icon: Sparkles,
    emojis: [
      { char: '🎉', name: 'party popper celebrate celebration birthday event' },
      { char: '🎊', name: 'confetti ball celebration' },
      { char: '🎈', name: 'balloon birthday party' },
      { char: '🎂', name: 'birthday cake celebration anniversary' },
      { char: '🎁', name: 'wrapped gift present offer discount' },
      { char: '🏆', name: 'trophy champion win winner award' },
      { char: '🥇', name: '1st place medal gold winner first' },
      { char: '🥈', name: '2nd place medal silver' },
      { char: '🥉', name: '3rd place medal bronze' },
      { char: '🏅', name: 'sports medal award achievement' },
      { char: '🎖️', name: 'military medal honor' },
      { char: '🎫', name: 'ticket pass expo event' },
      { char: '🎟️', name: 'admission tickets entry show' },
      { char: '🎪', name: 'circus tent festival expo fair' },
      { char: '🎨', name: 'artist palette design craft' },
      { char: '🎯', name: 'bullseye direct target goal hit' },
      { char: '🚀', name: 'rocket launch fast speed growth' }
    ]
  },
  {
    id: 'objects',
    name: 'Business & Tools',
    icon: Briefcase,
    emojis: [
      { char: '💼', name: 'briefcase work business portfolio company' },
      { char: '🏢', name: 'office building company headquarters workplace' },
      { char: '🏬', name: 'department store shop mall' },
      { char: '🏭', name: 'factory industrial manufacture plant' },
      { char: '🏗️', name: 'building construction structures architecture' },
      { char: '🏠', name: 'house home residential property' },
      { char: '📞', name: 'telephone receiver call support contact' },
      { char: '📱', name: 'mobile phone cellphone whatsapp' },
      { char: '📧', name: 'email envelope mail letter' },
      { char: '✉️', name: 'envelope letter postal message' },
      { char: '📨', name: 'incoming envelope receive mail' },
      { char: '📦', name: 'package box delivery parcel order shipping' },
      { char: '📄', name: 'page facing up document paper contract' },
      { char: '📃', name: 'page with curl terms invoice bill' },
      { char: '📊', name: 'bar chart analytics report growth' },
      { char: '📈', name: 'chart increasing upward trend profit' },
      { char: '📉', name: 'chart decreasing loss' },
      { char: '📋', name: 'clipboard tasks survey audit list' },
      { char: '📅', name: 'calendar date schedule appointment meeting' },
      { char: '📆', name: 'tear off calendar date' },
      { char: '📁', name: 'file folder archive documents' },
      { char: '📂', name: 'open file folder' },
      { char: '💰', name: 'money bag cash salary finance payment' },
      { char: '💵', name: 'dollar banknote cash money currency' },
      { char: '💳', name: 'credit card payment purchase banking' },
      { char: '🧾', name: 'receipt bill payment voucher invoice proof' },
      { char: '🔒', name: 'locked security safe confidential' },
      { char: '🔓', name: 'unlocked open access' },
      { char: '🔑', name: 'key access password credential' },
      { char: '⚙️', name: 'gear settings system config option' },
      { char: '🛠️', name: 'hammer and wrench tools service repair maintenance' },
      { char: '📐', name: 'triangular ruler engineering measure drafting' },
      { char: '📏', name: 'straight ruler dimension size drawing' }
    ]
  },
  {
    id: 'travel',
    name: 'Travel & Places',
    icon: Car,
    emojis: [
      { char: '🚗', name: 'automobile car vehicle transport drive' },
      { char: '🚕', name: 'taxi cab ride' },
      { char: '🚙', name: 'sport utility vehicle suv' },
      { char: '🚌', name: 'bus public transport transit' },
      { char: '🚎', name: 'trolleybus' },
      { char: '🚚', name: 'delivery truck logistics freight transport' },
      { char: '🚛', name: 'articulated lorry truck cargo' },
      { char: '🚜', name: 'tractor farming agriculture site' },
      { char: '🏍️', name: 'motorcycle bike ride delivery' },
      { char: '🛵', name: 'motor scooter delivery' },
      { char: '🚲', name: 'bicycle bike cycle' },
      { char: '✈️', name: 'airplane flight travel airport trip' },
      { char: '🚆', name: 'train transit rail metro travel' },
      { char: '🚇', name: 'metro subway underground' },
      { char: '🚉', name: 'station train terminal' },
      { char: '🗺️', name: 'world map location geography route' },
      { char: '📍', name: 'pin address destination visit location' }
    ]
  }
];

const FAST_FREQUENT_EMOJIS = [
  '😊', '❤️', '👍', '😂', '🙏', '🎉', '✅', '👋', '🔥', '👏', '🤝', '💼', '📞', '📍', '💬', '🏢', '📄'
];

export const WhatsAppEmojiPicker: React.FC<WhatsAppEmojiPickerProps> = ({
  onSelectEmoji,
  onSelect,
  onClose
}) => {
  const handlePick = (emoji: string) => {
    if (onSelectEmoji) onSelectEmoji(emoji);
    if (onSelect) onSelect(emoji);
  };
  const [activeCategory, setActiveCategory] = useState<string>('smileys');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Filter emojis based on search query
  const filteredEmojis = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    const all = EMOJI_CATEGORIES.flatMap(c => c.emojis);
    const seen = new Set<string>();
    return all.filter(e => {
      if (seen.has(e.char)) return false;
      const match = e.name.toLowerCase().includes(q);
      if (match) seen.add(e.char);
      return match;
    });
  }, [searchQuery]);

  const currentCategoryData = useMemo(() => {
    return EMOJI_CATEGORIES.find(c => c.id === activeCategory) || EMOJI_CATEGORIES[0];
  }, [activeCategory]);

  return (
    <div className="crm-emoji-picker-popover" ref={pickerRef} role="dialog" aria-label="Emoji Picker">
      {/* Search Bar */}
      <div className="crm-emoji-search-row">
        <Search size={14} className="crm-emoji-search-icon" />
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search emojis..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="crm-emoji-search-input"
          autoFocus
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              searchInputRef.current?.focus();
            }}
            className="crm-emoji-clear-btn"
            aria-label="Clear search"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Quick Frequency Row */}
      {!searchQuery && (
        <div className="crm-emoji-quick-row">
          {FAST_FREQUENT_EMOJIS.map((emoji, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handlePick(emoji)}
              className="crm-emoji-cell quick"
              title={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Main Grid Area */}
      <div className="crm-emoji-grid-body">
        {filteredEmojis ? (
          filteredEmojis.length === 0 ? (
            <div className="crm-emoji-no-results">No emojis matching &ldquo;{searchQuery}&rdquo;</div>
          ) : (
            <div className="crm-emoji-grid">
              {filteredEmojis.map((e, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handlePick(e.char)}
                  className="crm-emoji-cell"
                  title={e.name}
                  aria-label={e.name}
                >
                  {e.char}
                </button>
              ))}
            </div>
          )
        ) : (
          <div>
            <div className="crm-emoji-cat-title">{currentCategoryData.name}</div>
            <div className="crm-emoji-grid">
              {currentCategoryData.emojis.map((e, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handlePick(e.char)}
                  className="crm-emoji-cell"
                  title={e.name}
                  aria-label={e.name}
                >
                  {e.char}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Category Tabs Footer */}
      {!searchQuery && (
        <div className="crm-emoji-tabs-footer">
          {EMOJI_CATEGORIES.map(cat => {
            const Icon = cat.icon;
            const isActive = cat.id === activeCategory;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`crm-emoji-cat-tab ${isActive ? 'active' : ''}`}
                title={cat.name}
                aria-label={cat.name}
              >
                <Icon size={16} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
