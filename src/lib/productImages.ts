import espressoCortadoImg from '../assets/images/espresso_cortado_1794587393003.jpg';
import v60PourOverImg from '../assets/images/v60_pour_over_1794587392996.jpg';
import icedMatchaImg from '../assets/images/iced_matcha_latte_1794587393590.jpg';
import spanishLatteImg from '../assets/images/spanish_latte_iced_1794587393947.jpg';
import pistachioCroissantImg from '../assets/images/pistachio_croissant_1794587393635.jpg';
import basluneCoffeeBarImg from '../assets/images/baslune_coffee_bar_1794587394823.jpg';

const BUNDLED_IMAGES: Record<string, string> = {
  '/src/assets/images/espresso_cortado_1794587393003.jpg': espressoCortadoImg,
  '/src/assets/images/v60_pour_over_1794587392996.jpg': v60PourOverImg,
  '/src/assets/images/iced_matcha_latte_1794587393590.jpg': icedMatchaImg,
  '/src/assets/images/spanish_latte_iced_1794587393947.jpg': spanishLatteImg,
  '/src/assets/images/pistachio_croissant_1794587393635.jpg': pistachioCroissantImg,
  '/src/assets/images/baslune_coffee_bar_1794587394823.jpg': basluneCoffeeBarImg,
};

export const HERO_BAR_IMAGE = basluneCoffeeBarImg;

export const PRESET_GALLERY = [
  { label: 'Espresso & Cortado', path: '/src/assets/images/espresso_cortado_1794587393003.jpg', preview: espressoCortadoImg },
  { label: 'V60 Pour Over', path: '/src/assets/images/v60_pour_over_1794587392996.jpg', preview: v60PourOverImg },
  { label: 'Iced Matcha Latte', path: '/src/assets/images/iced_matcha_latte_1794587393590.jpg', preview: icedMatchaImg },
  { label: 'Iced Spanish Latte', path: '/src/assets/images/spanish_latte_iced_1794587393947.jpg', preview: spanishLatteImg },
  { label: 'Pistachio Croissant', path: '/src/assets/images/pistachio_croissant_1794587393635.jpg', preview: pistachioCroissantImg },
];

export function resolveProductImage(url?: string | null): string {
  if (!url) return '';
  return BUNDLED_IMAGES[url] || url;
}
