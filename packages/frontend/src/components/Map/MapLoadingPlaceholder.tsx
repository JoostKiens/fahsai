import { useTranslation } from 'react-i18next';
import placeholder from '@/assets/basemap-placeholder.jpg';

// The blurred basemap and spinner of the server-rendered #intro (see MapPlaceholder.astro and
// index.css), for the gaps after that fallback has been replaced: while the map chunk loads and
// until Mapbox has loaded its style. The browser already has the image, it is preloaded.
export function MapLoadingPlaceholder() {
  const { t } = useTranslation();
  return (
    <div role="status" className="map-loading w-full h-full">
      <img
        className="map-placeholder"
        src={placeholder.src}
        width={placeholder.width}
        height={placeholder.height}
        alt=""
      />
      <span className="sr-only">{t('map.loading')}</span>
    </div>
  );
}
