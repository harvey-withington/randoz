import { useMemo, type ReactNode } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { ArrowDown, ArrowUp } from 'lucide-react-native';
import { Txt } from '../components/Txt';
import { plural, t } from '../i18n';
import type { Section } from '../lib/gallery';
import type { Item, Sort, ViewType } from '../lib/types';
import { useTheme } from '../theme/theme';
import { PhotoRow } from './PhotoRow';
import { PhotoTile } from './PhotoTile';

interface Props {
  sections: Section[];
  view: ViewType;
  sort: Sort;
  /** The width there is to fill. */
  width: number;
  selecting: boolean;
  selected: Set<string>;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onSort: (sort: Sort) => void;
  /** Room to leave under the last photo, for what floats over the list. */
  bottomSpace: number;
  /** Shown when there is nothing to list. */
  empty: ReactNode;
  /** Hidden from screen readers, as while the viewer covers it. */
  hidden: boolean;
}

type Row =
  | { kind: 'columns'; key: string }
  | { kind: 'heading'; key: string; title: string; count: number }
  | { kind: 'tiles'; key: string; section: string; items: Item[] }
  | { kind: 'detail'; key: string; item: Item };

/** The smallest a tile may be, which sets how many fit across. */
const TILE_MIN: Record<Exclude<ViewType, 'details'>, { side: number; columns: number }> = {
  large: { side: 150, columns: 3 },
  small: { side: 92, columns: 5 },
};

/**
 * A group's photos, in the sections and order given, drawn as large tiles,
 * small tiles or a list with details. The details list has column headings
 * that sort it.
 */
export function Gallery(props: Props) {
  const { sections, view, sort, width, selecting, selected, onOpen, onToggle, onSort, bottomSpace, empty, hidden } = props;
  const theme = useTheme();
  const c = theme.color;
  const gap = theme.space[1];
  const grid = view === 'details' ? null : TILE_MIN[view];
  const columns = grid ? Math.max(grid.columns, Math.floor(width / grid.side)) : 1;
  const cell = (width - gap * (columns - 1)) / columns;

  const rows = useMemo(() => {
    const out: Row[] = [];
    if (view === 'details' && sections.length > 0) out.push({ kind: 'columns', key: 'columns' });
    for (const section of sections) {
      if (section.title) out.push({ kind: 'heading', key: 'h:' + section.key, title: section.title, count: section.items.length });
      if (view === 'details') {
        for (const item of section.items) out.push({ kind: 'detail', key: section.key + ':' + item.id, item });
      } else {
        for (let at = 0; at < section.items.length; at += columns) {
          const items = section.items.slice(at, at + columns);
          out.push({ kind: 'tiles', key: section.key + ':' + items[0].id, section: section.key, items });
        }
      }
    }
    return out;
  }, [sections, view, columns]);

  const press = (id: string) => (selecting ? onToggle(id) : onOpen(id));

  const renderRow = ({ item: row }: { item: Row }) => {
    if (row.kind === 'columns') return <Columns sort={sort} onSort={onSort} />;
    if (row.kind === 'heading') {
      return (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: theme.space[2],
            paddingHorizontal: theme.space[3],
            paddingTop: theme.space[4],
            paddingBottom: theme.space[2],
          }}
        >
          <Txt variant="title" accessibilityRole="header" numberOfLines={1} style={{ flexShrink: 1 }}>
            {row.title}
          </Txt>
          <Txt variant="faint">{plural(row.count, 'groups.photosOne', 'groups.photos')}</Txt>
        </View>
      );
    }
    if (row.kind === 'detail') {
      return (
        <PhotoRow
          item={row.item}
          selecting={selecting}
          selected={selected.has(row.item.id)}
          onPress={() => press(row.item.id)}
          onLongPress={() => onToggle(row.item.id)}
        />
      );
    }
    return (
      <View style={{ flexDirection: 'row', gap, marginBottom: gap }}>
        {row.items.map((item) => (
          <PhotoTile
            key={item.id}
            item={item}
            size={cell}
            selecting={selecting}
            selected={selected.has(item.id)}
            onPress={() => press(item.id)}
            onLongPress={() => onToggle(item.id)}
          />
        ))}
      </View>
    );
  };

  return (
    <FlatList
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      data={rows}
      extraData={selected}
      keyExtractor={(row) => row.key}
      renderItem={renderRow}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: bottomSpace, flexGrow: 1, backgroundColor: c.bg }}
      ListEmptyComponent={<>{empty}</>}
    />
  );
}

interface ColumnsProps {
  sort: Sort;
  onSort: (sort: Sort) => void;
}

/** The details list's column headings. Tapping one sorts by it; tapping Date again turns it round. */
function Columns({ sort, onSort }: ColumnsProps) {
  const theme = useTheme();
  const c = theme.color;
  const date = sort === 'oldest' ? 'oldest' : 'newest';
  const columns: { label: string; sort: Sort; active: boolean; up: boolean }[] = [
    { label: t('sort.title'), sort: 'title', active: sort === 'title', up: true },
    { label: t('sort.person'), sort: 'person', active: sort === 'person', up: true },
    { label: t('sort.date'), sort: sort === 'newest' ? 'oldest' : 'newest', active: sort === date, up: sort === 'oldest' },
    { label: t('sort.size'), sort: 'size', active: sort === 'size', up: false },
  ];
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: theme.space[1],
        paddingHorizontal: theme.space[2],
        borderBottomWidth: 1,
        borderBottomColor: c.border,
        backgroundColor: c.surface,
      }}
    >
      {columns.map((column) => {
        const Arrow = column.up ? ArrowUp : ArrowDown;
        return (
          <Pressable
            key={column.label}
            accessibilityRole="button"
            accessibilityLabel={t('sort.by', { what: column.label })}
            accessibilityState={{ selected: column.active }}
            onPress={() => onSort(column.sort)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 2,
              minHeight: theme.touch,
              paddingHorizontal: theme.space[2],
            }}
          >
            <Txt variant="label" color={column.active ? c.accent : undefined}>
              {column.label}
            </Txt>
            {column.active ? <Arrow size={14} color={c.accent} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
