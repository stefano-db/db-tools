/**
 * Maskottchen und Logo.
 *
 * Die echten Bilder liegen später unter public/marke/. Solange eines fehlt,
 * erscheint ein Platzhalter — die Seite bleibt dadurch benutzbar, und das
 * Austauschen besteht nur darin, die Datei in den Ordner zu legen. Am Code
 * muss dafür nichts geändert werden.
 */
import { useState } from 'react';

export type MascotName = 'winken' | 'counter' | 'service' | 'kueche' | 'mechanik' | 'profil';

/** Dateiname und Notbehelf je Figur. */
const MASCOTS: Record<MascotName, { file: string; emoji: string }> = {
  winken: { file: 'maskottchen-winken.png', emoji: '👋' },
  counter: { file: 'maskottchen-counter.png', emoji: '🎳' },
  service: { file: 'maskottchen-service.png', emoji: '🍹' },
  kueche: { file: 'maskottchen-kueche.png', emoji: '👨‍🍳' },
  mechanik: { file: 'maskottchen-mechanik.png', emoji: '🔧' },
  profil: { file: 'maskottchen-profil.png', emoji: '🙂' },
};

export function Mascot({
  name,
  className = '',
  size = 64,
}: {
  name: MascotName;
  className?: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const entry = MASCOTS[name];

  if (failed) {
    return (
      <span
        className={`db-mascot-fallback grid shrink-0 place-items-center rounded-full ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.45 }}
        aria-hidden="true"
        title="Platzhalter — echtes Bild folgt"
      >
        {entry.emoji}
      </span>
    );
  }

  return (
    <img
      src={`/marke/${entry.file}`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** Wortmarke. Fällt auf Text zurück, solange das Logo fehlt. */
export function Logo({ className = '' }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className={`text-lg font-extrabold tracking-wide ${className}`}>
        DREAM<span className="text-db-gold"> BOWL</span>
      </span>
    );
  }

  return (
    <img
      src="/marke/logo.png"
      alt="Dream Bowl"
      onError={() => setFailed(true)}
      className={`h-9 w-auto object-contain ${className}`}
    />
  );
}
