import { useTranslation } from 'react-i18next';
import placeholder from '@/assets/basemap-placeholder.jpg';
import phonePlaceholder from '@/assets/basemap-placeholder-phone.jpg';
import { useIsMobile } from '@/hooks/useIsMobile';

// The blurred basemap of the server-rendered #intro (see MapPlaceholder.astro and index.css), for
// the gaps after that fallback has been replaced: while the map chunk loads and until Mapbox has
// loaded its style. The browser already has the image, it is preloaded.
export function MapLoadingPlaceholder() {
  const { t } = useTranslation();
  // The phone view on phones, split where initialMapView and MapPlaceholder.astro split.
  const image = useIsMobile() ? phonePlaceholder : placeholder;
  return (
    <div role="status" className="map-loading w-full h-full">
      <img
        className="map-placeholder"
        src={image.src}
        width={image.width}
        height={image.height}
        alt=""
      />
      <span className="sr-only">{t('map.loading')}</span>
    </div>
  );
}
