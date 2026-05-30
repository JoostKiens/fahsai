import { ScrollArea } from '@base-ui-components/react/scroll-area';

export function AppScrollArea({
  children,
  className,
  viewportClassName = 'h-full rounded-[inherit]',
}: {
  children: React.ReactNode;
  className?: string;
  viewportClassName?: string;
}) {
  return (
    <ScrollArea.Root className={className}>
      <ScrollArea.Viewport className={viewportClassName}>
        <ScrollArea.Content>{children}</ScrollArea.Content>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar className="flex w-1.5 touch-none select-none justify-center px-px opacity-0 transition-opacity duration-300 data-hovering:opacity-100 data-scrolling:opacity-100 data-scrolling:duration-75">
        <ScrollArea.Thumb className="w-full rounded-full bg-gray-300 hover:bg-gray-400" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}
