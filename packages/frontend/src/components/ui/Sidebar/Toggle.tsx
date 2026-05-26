import { motion, LayoutGroup } from 'motion/react';
import { SPRING } from '../../../lib/animation';

interface Props {
  checked: boolean;
  onChange: () => void;
  label: string;
}

export function Toggle({ checked, onChange, label }: Props) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`
        relative flex items-center w-8 h-[18px] rounded-full cursor-pointer
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1
        transition-colors duration-150 ease-out hover:duration-[175ms]
        ${checked ? 'bg-teal-600' : 'bg-gray-200'}
      `}
    >
      <LayoutGroup>
        <motion.span
          layout
          transition={SPRING}
          className="absolute w-[14px] h-[14px] rounded-full bg-white shadow-sm"
          style={{ left: checked ? 'calc(100% - 16px)' : '2px' }}
        />
      </LayoutGroup>
    </button>
  );
}
