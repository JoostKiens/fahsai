import { useTranslation } from 'react-i18next';
import { pm25ToSoftRgb, pm25ToSoftTextRgb } from '../../../utils/aqiColors';

interface Props {
  value: number;
  category: string;
  source?: 'measured' | 'modelled';
}

export function AqiBadge({ value, category, source = 'measured' }: Props) {
  const { t } = useTranslation();
  const [br, bg, bb] = pm25ToSoftRgb(value);
  const [tr, tg, tb] = pm25ToSoftTextRgb(value);
  const bgColor = `rgb(${br},${bg},${bb})`;
  const textColor = `rgb(${tr},${tg},${tb})`;

  const style: React.CSSProperties =
    source === 'modelled'
      ? {
          backgroundColor: bgColor,
          color: textColor,
          backgroundImage: `repeating-linear-gradient(135deg, rgba(${tr},${tg},${tb},0.22) 0 2px, transparent 2px 6px)`,
        }
      : { backgroundColor: bgColor, color: textColor };

  const ariaLabel =
    source === 'modelled'
      ? `PM2.5 ${Math.round(value)}, ${category} ${t('infoPanel.modelledBadgeSuffix')}`
      : `PM2.5 ${Math.round(value)}, ${category}`;

  return (
    <span
      className="inline-flex items-center gap-2 text-[11px] font-medium pl-2 pr-2.5 py-1 rounded"
      style={style}
      aria-label={ariaLabel}
    >
      <span className="text-[18px] font-semibold tabular-nums leading-none">
        {Math.round(value)}
      </span>
      <span className="text-[10px] leading-tight max-w-[88px]">{category}</span>
    </span>
  );
}
