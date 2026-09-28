import { describe, expect, it } from 'vitest';
import { State } from 'ts-fsrs';
import { newCardRow } from '../src/core/srs';
import type { CardRow } from '../src/core/types';
import { AREA_BY_ID } from '../src/game/activities';
import * as W from '../src/game/world';
import { topUpHand } from '../src/ui/tabs/CombatView';

const card = (id: number, over: Partial<CardRow> = {}): CardRow => ({ ...newCardRow(1, `q${id}`, 'a', 'attack', 0), id, state: State.Review, ...over });

describe('combat hand', () => {
  it('only holds due cards, and bosses pull due leeches first', () => {
    const w = W.newWorld(40);
    W.startTrip(w, AREA_BY_ID.graveyard, () => 0);
    w.combat!.hand = [99]; // no longer due
    const pool = [card(1), card(2), card(3, { lapses: 5 }), card(4)];
    topUpHand(w, pool, false);
    expect(w.combat!.hand).toEqual([1, 2, 3]);
    W.nextEnemy(w, () => 0, true);
    w.combat!.hand = [];
    topUpHand(w, pool, false);
    expect(w.combat!.hand[0]).toBe(3);
    expect(w.combat!.leeches).toEqual([3]);
  });

  it('changes only the hand, so it cannot undo a play made in the meantime', () => {
    const w = W.newWorld(40);
    W.startTrip(w, AREA_BY_ID.graveyard, () => 0);
    w.combat!.enemy.hp = -3; // a kill that just happened
    w.stats.kills = 7;
    topUpHand(w, [card(1), card(2), card(3)], false);
    expect(w.combat!.enemy.hp).toBe(-3);
    expect(w.stats.kills).toBe(7);
  });

  it('draws extra cards for Insight', () => {
    const w = W.newWorld(40);
    W.startTrip(w, AREA_BY_ID.graveyard, () => 0);
    w.combat!.hand = [1, 2];
    w.combat!.bonusDraw = 1;
    topUpHand(w, [card(1), card(2), card(3), card(4), card(5)], false);
    expect(w.combat!.hand).toHaveLength(4);
  });
});
