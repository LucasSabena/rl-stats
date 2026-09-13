import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SortableHandle {
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
  setActivatorNodeRef: ReturnType<typeof useSortable>["setActivatorNodeRef"];
  isDragging: boolean;
}

interface SortableItemProps {
  id: string;
  children: (handle: SortableHandle) => React.ReactNode;
  className?: string;
}

export function SortableItem({ id, children, className }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 30 : undefined,
      }}
      className={cn(isDragging && "opacity-80", className)}
    >
      {children({ attributes, listeners, setActivatorNodeRef, isDragging })}
    </div>
  );
}

interface SortableListProps<T> {
  items: T[];
  idOf: (item: T) => string;
  onReorder: (items: T[]) => void;
  renderItem: (item: T, handle: SortableHandle) => React.ReactNode;
  strategy?: "vertical" | "grid";
  className?: string;
}

/**
 * Accessible drag-and-drop list/grid powered by dnd-kit. Keyboard sorting is
 * enabled (space to lift, arrows to move); `renderItem` receives a handle so
 * callers can render a visible drag grip anywhere in the item.
 */
export function SortableList<T>({
  items,
  idOf,
  onReorder,
  renderItem,
  strategy = "vertical",
  className,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = items.findIndex((item) => idOf(item) === active.id);
    const toIndex = items.findIndex((item) => idOf(item) === over.id);
    if (fromIndex < 0 || toIndex < 0) return;
    onReorder(arrayMove(items, fromIndex, toIndex));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext
        items={items.map(idOf)}
        strategy={strategy === "grid" ? rectSortingStrategy : verticalListSortingStrategy}
      >
        <div className={className}>
          {items.map((item) => (
            <SortableItem key={idOf(item)} id={idOf(item)}>
              {(handle) => renderItem(item, handle)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

export function DragHandle({
  handle,
  className,
  label,
}: {
  handle: SortableHandle;
  className?: string;
  label: string;
}) {
  return (
    <button
      type="button"
      ref={handle.setActivatorNodeRef}
      aria-label={label}
      className={cn(
        "flex h-7 w-6 cursor-grab items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary active:cursor-grabbing",
        className
      )}
      {...handle.attributes}
      {...handle.listeners}
    >
      <GripVertical size={14} aria-hidden="true" />
    </button>
  );
}
