import { Command } from './commands';
import { Document } from './model';

export interface HistoryEntry {
  label: string;
}

const HISTORY_LIMIT = 200;

/**
 * Undo-Stack mit Redo-Truncation und Coalescing:
 * Aufeinanderfolgende Commands mit gleichem coalesceKey (z. B. ein Drag)
 * werden zu einem einzigen Undo-Schritt zusammengefasst.
 */
export class History {
  private done: Command[] = [];
  private undone: Command[] = [];
  private listeners = new Set<() => void>();

  execute(doc: Document, command: Command): void {
    command.do(doc);
    this.undone = [];
    const top = this.done[this.done.length - 1];
    if (
      top &&
      top.coalesceKey !== undefined &&
      top.coalesceKey === command.coalesceKey &&
      top.merge
    ) {
      top.merge(command);
    } else {
      this.done.push(command);
      if (this.done.length > HISTORY_LIMIT) this.done.shift();
    }
    this.notify();
  }

  undo(doc: Document): boolean {
    const command = this.done.pop();
    if (!command) return false;
    command.undo(doc);
    this.undone.push(command);
    this.notify();
    return true;
  }

  redo(doc: Document): boolean {
    const command = this.undone.pop();
    if (!command) return false;
    command.do(doc);
    this.done.push(command);
    this.notify();
    return true;
  }

  /** Springt zu einem Punkt im Verlauf; index = Anzahl ausgeführter Schritte (0 = Anfangszustand). */
  jumpTo(doc: Document, index: number): void {
    while (this.done.length > index && this.undo(doc)) {
      /* rückwärts */
    }
    while (this.done.length < index && this.redo(doc)) {
      /* vorwärts */
    }
  }

  get canUndo(): boolean {
    return this.done.length > 0;
  }

  get canRedo(): boolean {
    return this.undone.length > 0;
  }

  /** Alle Schritte in Ausführungsreihenfolge; die ersten `activeCount` sind angewendet. */
  entries(): { steps: HistoryEntry[]; activeCount: number } {
    return {
      steps: [...this.done, ...[...this.undone].reverse()].map((c) => ({ label: c.label })),
      activeCount: this.done.length,
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
