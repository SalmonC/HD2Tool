import type { JSX } from "preact";

export interface EquipmentWikiLinkItem {
  nameZh: string;
  wikiUrl?: string;
}

export function EquipmentWikiLink({
  item,
}: {
  item: EquipmentWikiLinkItem;
}): JSX.Element | null {
  if (!item.wikiUrl) return null;
  return (
    <a
      className="wiki-link"
      href={item.wikiUrl}
      target="_blank"
      rel="noopener noreferrer external"
      aria-label={`在 Wiki 查看${item.nameZh}`}
    >
      在 Wiki 查看
    </a>
  );
}
