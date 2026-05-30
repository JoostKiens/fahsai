import { Switch } from '@base-ui-components/react/switch';

interface Props {
  checked: boolean;
  onChange: () => void;
  label: string;
}

export function Toggle({ checked, onChange, label }: Props) {
  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      className="relative flex items-center w-8 h-[18px] rounded-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 transition-colors duration-150 ease-out bg-gray-200 data-checked:bg-teal-600"
    >
      <Switch.Thumb className="absolute w-[14px] h-[14px] rounded-full bg-white shadow-sm left-[2px] transition-transform duration-150 ease-out data-checked:translate-x-[14px]" />
    </Switch.Root>
  );
}
