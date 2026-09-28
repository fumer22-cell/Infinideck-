import type { HeroLook, ToolKind } from '../art/hero';
import { ITEMS, METALS } from '../game/items';
import type { Levels } from '../game/skills';
import { bestTool, type World } from '../game/world';

const metalOf = (id?: string) => (id ? METALS.find((m) => id.startsWith(`${m.id}-`)) : undefined);

/** Dress the hero in their equipped armour, holding the right tool for the job. */
export function heroLook(world: World, lv: Levels, tool: ToolKind): HeroLook {
  const helm = metalOf(world.equip.helm);
  const body = metalOf(world.equip.body);
  const shield = metalOf(world.equip.shield);
  let toolColor = '#9a9486';
  let toolLight: string | undefined = '#d0d0d0';
  let kind = tool;
  if (tool === 'pickaxe' || tool === 'axe') {
    const t = bestTool(world, tool === 'pickaxe' ? 'pickaxe' : 'axe', lv);
    const m = metalOf(t?.id);
    if (m) {
      toolColor = m.y;
      toolLight = m.Y;
    }
  } else if (tool === 'rod') {
    const t = bestTool(world, 'rod', lv);
    toolColor = (t && ITEMS[t.id].tint?.Y) || '#c8a040';
  } else if (tool === 'sword') {
    const m = metalOf(world.equip.weapon);
    if (m) {
      toolColor = m.Y;
      toolLight = m.y;
    } else kind = 'none';
  }
  return { helm: helm?.y, helmLight: helm?.Y, body: body?.y, bodyLight: body?.Y, shield: shield?.y, tool: kind, toolColor, toolLight };
}
