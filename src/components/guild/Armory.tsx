"use client";

import { useState } from "react";
import { RARITY_META } from "@/lib/game";
import { useCountUp } from "@/lib/hooks";
import type { ItemCategory, Profile, ShopItem } from "@/lib/types";

type Cat = "all" | ItemCategory;

const CATS: { key: Cat; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "consumable", label: "Consumables" },
  { key: "title", label: "Titles" },
  { key: "theme", label: "Themes" },
  { key: "companion", label: "Companions" },
  { key: "badge", label: "Crests" },
];

const RARITY_COLOR: Record<ShopItem["rarity"], string> = {
  common: "var(--muted)",
  rare: "var(--info)",
  epic: "var(--attr-discipline)",
  legendary: "var(--gold)",
};

interface Props {
  profile: Profile;
  shop: ShopItem[];
  busy: Set<number>;
  onBuy: (id: number) => void;
  onEquip: (id: number) => void;
  onUse: (id: number) => void;
}

export function Armory({ profile, shop, busy, onBuy, onEquip, onUse }: Props) {
  const [cat, setCat] = useState<Cat>("all");
  const gold = useCountUp(profile.gold);
  const items = shop.filter((i) => cat === "all" || i.category === cat);

  return (
    <div className="space-y-4">
      <div className="panel p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold">The Armory</h2>
            <p className="text-sm text-muted">
              Spend hard-won gold on titles, themes, companions and potions.
            </p>
          </div>
          <p className="rounded-xl border border-line-strong bg-panel-2 px-4 py-2 font-display text-lg font-bold tabular-nums text-gold-2">
            <span aria-hidden="true">🪙</span> {gold}
            <span className="sr-only"> gold available</span>
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter items">
          {CATS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`chip cursor-pointer transition-colors ${
                cat === c.key ? "border-gold bg-gold/15 text-gold-2" : "hover:border-line-strong hover:text-ink"
              }`}
              aria-pressed={cat === c.key}
              onClick={() => setCat(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3" aria-label="Items for sale">
        {items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            profile={profile}
            busy={busy.has(item.id)}
            onBuy={onBuy}
            onEquip={onEquip}
            onUse={onUse}
          />
        ))}
      </ul>
    </div>
  );
}

function ItemCard({
  item,
  profile,
  busy,
  onBuy,
  onEquip,
  onUse,
}: {
  item: ShopItem;
  profile: Profile;
  busy: boolean;
  onBuy: (id: number) => void;
  onEquip: (id: number) => void;
  onUse: (id: number) => void;
}) {
  const locked = profile.level < item.minLevel;
  const canAfford = profile.gold >= item.price;
  const maxed = item.stackable ? item.quantity >= item.maxStack : item.owned;
  const equippable =
    item.category === "title" || item.category === "theme" || item.category === "companion";
  const color = RARITY_COLOR[item.rarity];
  const shortfall = item.price - profile.gold;

  return (
    <li
      className="panel rise flex flex-col p-4 transition-shadow"
      style={item.equipped ? { boxShadow: "0 0 0 1px var(--gold), 0 0 30px -10px var(--gold)" } : undefined}
    >
      <div className="flex items-start gap-3">
        <span
          className="grid h-14 w-14 flex-none place-items-center rounded-xl border text-3xl"
          style={{ borderColor: color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
          aria-hidden="true"
        >
          {item.icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold leading-tight">{item.name}</h3>
          <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wider" style={{ color }}>
            {RARITY_META[item.rarity].label} · {item.category}
          </p>
          {item.equipped && <span className="chip mt-1 border-gold text-gold-2">Equipped</span>}
          {item.stackable && item.owned && (
            <span className="chip mt-1">
              Held {item.quantity}/{item.maxStack}
            </span>
          )}
        </div>
      </div>

      <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{item.description}</p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <span className="font-display font-bold text-gold-2">
          <span aria-hidden="true">🪙</span> {item.price}
          <span className="sr-only"> gold</span>
        </span>

        <div className="flex flex-wrap gap-2">
          {locked ? (
            <span className="chip" title={`Unlocks at level ${item.minLevel}`}>
              <span aria-hidden="true">🔒</span> Level {item.minLevel}
            </span>
          ) : (
            <>
              {item.owned && item.category === "consumable" && item.payload === "xp_elixir" && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => onUse(item.id)}
                  disabled={busy}
                >
                  Drink
                </button>
              )}
              {item.owned && equippable && (
                <button
                  type="button"
                  className={`btn ${item.equipped ? "btn-ghost" : "btn-primary"}`}
                  onClick={() => onEquip(item.id)}
                  aria-pressed={item.equipped}
                  disabled={busy}
                >
                  {item.equipped ? "Unequip" : "Equip"}
                </button>
              )}
              {item.owned && !equippable && item.category !== "consumable" && (
                <span className="chip border-gold text-gold-2">Owned ✓</span>
              )}
              {!maxed && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onBuy(item.id)}
                  disabled={!canAfford || busy}
                  aria-busy={busy}
                  title={canAfford ? undefined : `You need ${shortfall} more gold`}
                >
                  {item.owned ? "Buy another" : canAfford ? "Buy" : `Need ${shortfall} more`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}
