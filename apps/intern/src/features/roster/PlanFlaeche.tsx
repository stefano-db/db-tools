import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * Flaeche, die ihren Inhalt passend rechnet.
 *
 * Wandtafel und Freigabe-Seite haben dieselbe Not: sie haengen an einer Wand
 * oder liegen auf einem fremden Telefon, und niemand kann scrollen. Also wird
 * der Plan in natuerlicher Groesse aufgebaut, gemessen und so skaliert, dass er
 * in beide Richtungen hineingeht — das haelt auch, wenn Namen dazukommen.
 *
 * Der Ursprung liegt oben links und die Mitte wird gerechnet: der Aufbau ist
 * breiter als mancher Rahmen und liegt dann links an; eine Skalierung aus der
 * Mitte wuerde ihn rechts aus dem Bild schieben.
 */
export function PlanFlaeche({
  breite,
  hoechstens = 2.2,
  children,
}: {
  /** Breite des unskalierten Aufbaus in Punkten. */
  breite: number;
  /** Obergrenze der Vergroesserung — sonst wird es auf grossen Schirmen albern. */
  hoechstens?: number;
  children: React.ReactNode;
}) {
  const rahmenRef = useRef<HTMLDivElement>(null);
  const inhaltRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, dx: 0, dy: 0 });

  const rechnen = useCallback(() => {
    const rahmen = rahmenRef.current;
    const inhalt = inhaltRef.current;
    if (!rahmen || !inhalt) return;
    // offsetWidth/Height bleiben von der Transformation unberuehrt — gemessen
    // wird also immer der unskalierte Aufbau. Genommen wird davon der groessere
    // Wert gegenueber scrollWidth/Height: eine Tabelle kann breiter werden als
    // ihr Rahmen, und nach der zugewiesenen Breite gerechnet schnitte die
    // Skalierung dann die letzte Spalte ab.
    const breiteInhalt = Math.max(inhalt.offsetWidth, inhalt.scrollWidth);
    const hoeheInhalt = Math.max(inhalt.offsetHeight, inhalt.scrollHeight);
    const scale = Math.min(
      rahmen.clientWidth / breiteInhalt,
      rahmen.clientHeight / hoeheInhalt,
      hoechstens,
    );
    setFit({
      scale,
      dx: (rahmen.clientWidth - breiteInhalt * scale) / 2,
      dy: (rahmen.clientHeight - hoeheInhalt * scale) / 2,
    });
  }, [hoechstens]);

  useLayoutEffect(() => {
    rechnen();
    const ro = new ResizeObserver(rechnen);
    if (rahmenRef.current) ro.observe(rahmenRef.current);
    if (inhaltRef.current) ro.observe(inhaltRef.current);
    window.addEventListener('resize', rechnen);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', rechnen);
    };
  }, [rechnen, children]);

  return (
    <div ref={rahmenRef} className="h-full w-full overflow-hidden">
      <div
        ref={inhaltRef}
        className="plan-tv origin-top-left px-4 py-2"
        style={{ width: breite, transform: `translate(${fit.dx}px, ${fit.dy}px) scale(${fit.scale})` }}
      >
        {children}
      </div>
    </div>
  );
}
